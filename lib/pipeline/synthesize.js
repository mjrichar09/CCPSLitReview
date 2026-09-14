import { createGenerator } from '../generate/index.js';
import { createLimiter } from '../util/throttle.js';
import { loadHistory } from '../util/history.js';
import { loadImportedPapers, importedBlock } from '../importedPapers.js';
import { log } from '../util/log.js';

// Ceilings, not budgets: Anthropic bills the tokens actually emitted, so a
// generous max_tokens costs nothing and a tight one throws. 1500 was too tight
// for a category narrative and halted a full run *after* scoring and
// summarising had already been paid for.
const NARRATIVE_TOKENS = 4000;
const TOP_ITEMS_TOKENS = 6000;
const OVERVIEW_TOKENS = 3000;

/**
 * Stage 5 — the editorial layer: a narrative per category, a cross-category
 * Top 5, and the month's opening paragraph.
 *
 * Category narratives are independent, so they run concurrently. The Top 5 and
 * the overview are not: both read the finished narratives, so they run after.
 *
 * This is also the only stage with a memory. Every earlier stage judges an item
 * on its own merits; the editorial layer is where "this reverses July" belongs,
 * so `loadHistory` supplies the previous months' narratives here and nowhere
 * else. See `historyBlock` for why that context is fenced as hard as it is.
 */
export async function synthesize({
  items,
  config,
  month,
  usage,
  env = process.env,
  generator: injected,
  history: injectedHistory,
  imported: injectedImported,
}) {
  const generator = injected ?? createGenerator(config, 'synthesize', { env });
  const history = injectedHistory ?? (await loadHistory(month, config.history));
  // Reader-imported papers reach the opening paragraph only: they are context
  // the reader themselves put in front of us, not results of this month's
  // search, so they have no place in a category's narrative of what the month
  // found. Empty unless the service-role read is configured.
  const imported = injectedImported ?? (await loadImportedPapers(month, { env }));

  const byCategory = new Map();
  for (const paper of items) {
    for (const id of paper.scored_in) {
      if (!byCategory.has(id)) byCategory.set(id, []);
      byCategory.get(id).push(paper);
    }
  }

  const categories = config.categories.filter((c) => byCategory.has(c.id));
  const limiter = createLimiter({
    rps: config.models.synthesize.rps ?? 0.75,
    concurrency: config.models.synthesize.concurrency ?? 4,
  });

  const narratives = new Array(categories.length);
  await Promise.all(
    categories.map((category, index) =>
      limiter.schedule(async () => {
        const papers = sortForReading(byCategory.get(category.id));
        const parsed = await generator.generate({
          system: categorySystem(category, history.byCategory.get(category.id) ?? []),
          user: papersBlock(papers),
          schema: {
            type: 'object',
            properties: {
              synthesis: { type: 'string' },
              references: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { marker: { type: 'integer' }, id: { type: 'string' } },
                  required: ['marker', 'id'],
                  additionalProperties: false,
                },
              },
            },
            required: ['synthesis', 'references'],
            additionalProperties: false,
          },
          maxTokens: NARRATIVE_TOKENS,
          usage,
        });
        // A fabricated id degrades to plain "[1]" text at render time rather
        // than a broken link (FootnoteText.jsx) — the same posture as the
        // Top-5 guard below, not a hard failure: this is decorative, and a
        // visible plain-text fallback is a fine outcome for a fabricated ref.
        narratives[index] = { id: category.id, synthesis: parsed.synthesis, references: parsed.references ?? [], papers };
      }),
    ),
  );

  const top = await pickTopItems({ items, narratives, config, generator, usage, history });
  const { summary, references } = await writeOverview({ narratives, top, items, month, config, generator, usage, history, imported });

  log.info('synthesize complete', {
    categories: narratives.length,
    top: top.length,
    history_months: history.months.length,
  });

  return {
    narratives,
    top_items: top,
    summary,
    references,
    stats: { categories: narratives.length, top_items: top.length },
  };
}

/**
 * The Top 5, chosen by the model but constrained to ids that actually exist.
 *
 * An invented id would render as a missing item in the most prominent section of
 * the report, so anything unrecognised is dropped and the list is backfilled by
 * relevance rather than silently coming up short.
 */
async function pickTopItems({ items, narratives, config, generator, usage, history }) {
  const want = config.top_items ?? 5;

  const recent = (history?.overviews ?? [])
    .filter((o) => o.top.length > 0)
    .map((o) => `${o.month}:\n${o.top.map((t) => `- ${t.title}`).join('\n')}`)
    .join('\n\n');

  const parsed = await generator.generate({
    system: `You are choosing the Top ${want} items of the month for an upstream CHO process development and CMC scientist, across every category.

Rank on what would change this reader's thinking, not on how prestigious the venue is or how comprehensive the work is. A result that contradicts current practice outranks a thorough confirmation of it. A preprint that matters outranks a journal paper that does not.

Spread across categories unless one area genuinely dominated the month. Return ids exactly as given, most important first, with one line saying why it earned the slot.${
      recent
        ? `

RECENTLY HIGHLIGHTED (previous months' Top items, newest first):

${recent}

A theme this reader was shown recently needs to earn its slot again: prefer the item that moves it on to the item that restates it. This is a tiebreaker, not a ban — a genuinely more important item still wins. ${CONTINUITY_GUARD}`
        : ''
    }`,
    user: narratives
      .map((n) => `## ${n.id}\n\n${n.papers.map((p) => `- id: ${p.external_id}\n  ${p.title}\n  ${p.summary}`).join('\n')}`)
      .join('\n\n'),
    schema: {
      type: 'object',
      properties: {
        top: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, reason: { type: 'string' } },
            required: ['id', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['top'],
      additionalProperties: false,
    },
    maxTokens: TOP_ITEMS_TOKENS,
    usage,
  });

  return reconcileTopPicks({ items, picks: parsed.top, want });
}

/**
 * Constrain a model's Top-N picks to ids that actually exist, drop duplicates,
 * and backfill any remaining slots by relevance. Extracted so the routine-based
 * generator's finalize step (scripts/finalize-routine-output.mjs) can apply the
 * exact same hallucination guard to picks the routine's own reasoning produced,
 * rather than trusting free-form output unconstrained.
 */
export function reconcileTopPicks({ items, picks, want }) {
  const valid = new Map(items.map((p) => [p.external_id, p]));
  const seen = new Set();
  const chosen = [];
  for (const entry of picks ?? []) {
    if (!valid.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    chosen.push({ id: entry.id, reason: entry.reason });
    if (chosen.length === want) break;
  }

  if (chosen.length < want) {
    const dropped = (picks ?? []).length - chosen.length;
    if (dropped > 0) log.warn('top_items: discarded unrecognised ids from the model', { dropped });
    for (const paper of sortForReading(items)) {
      if (chosen.length === want) break;
      if (seen.has(paper.external_id)) continue;
      seen.add(paper.external_id);
      chosen.push({ id: paper.external_id, reason: 'Highest remaining relevance score this month.' });
    }
  }
  return chosen;
}

async function writeOverview({ narratives, top, items, month, config, generator, usage, history, imported }) {
  const byId = new Map(items.map((p) => [p.external_id, p]));
  const previous = (history?.overviews ?? [])
    .filter((o) => o.summary)
    .map((o) => `${o.month}:\n${o.summary}`)
    .join('\n\n');

  const parsed = await generator.generate({
    system: `Write the opening paragraph of a monthly bioprocess digest for one expert reader: upstream CHO process development and CMC.

One paragraph, 4-6 sentences. Say what actually happened this month — the through-line, what shifted, what contradicted prior practice. Name specifics. If the month was quiet, say so; a manufactured theme is worse than an honest "nothing moved much this month, though X is worth watching."

No greeting, no sign-off, no "in this issue". Start with the substance.

${FOOTNOTE_INSTRUCTIONS}${
      previous
        ? `

PREVIOUS MONTHS' OPENING PARAGRAPHS (newest first):

${previous}

The reader has read these. Do not re-announce a theme they already opened on — either say what moved it this month or leave it out. Comparisons across months ("quieter than ${history.overviews[0].month}", "the third month running without X") are welcome where they are true. ${CONTINUITY_GUARD}`
        : ''
    }${importedBlock(imported?.papers)}`,
    user: `Month: ${month}\n\nTop items:\n${top.map((t) => `- id: ${t.id}\n  ${byId.get(t.id)?.title ?? t.id} — ${t.reason}`).join('\n')}\n\nCategory narratives:\n${narratives.map((n) => `## ${n.id}\n${n.synthesis}`).join('\n\n')}`,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        references: {
          type: 'array',
          items: {
            type: 'object',
            properties: { marker: { type: 'integer' }, id: { type: 'string' } },
            required: ['marker', 'id'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'references'],
      additionalProperties: false,
    },
    maxTokens: OVERVIEW_TOKENS,
    usage,
  });
  return { summary: parsed.summary, references: parsed.references ?? [] };
}

/**
 * The fence around prior-month context, on every prompt that receives any.
 *
 * Hand a model last month's prose and it will find a connection to it whether or
 * not one exists — the same failure the `thin_abstract` rule guards against in
 * summarize.js, and with the same consequence: this reader acts on these.
 */
const CONTINUITY_GUARD = `Previous months are context for contrast and continuity only. Reference them when this month's items genuinely extend, reverse, or leave unresolved something stated before, and say which. If there is no real connection, say nothing about previous months at all. An invented "building on last month's finding" is a factual error, not a stylistic one.`;

/**
 * The footnote convention shared by every prose-writing call. Rendered as
 * clickable links back to the cited paper on the section page
 * (FootnoteText.jsx) — a fabricated or out-of-scope id just renders as plain
 * "[1]" text rather than a broken link, so getting this wrong costs nothing
 * but the link.
 */
const FOOTNOTE_INSTRUCTIONS = `When you cite one specific paper's finding directly, mark it inline the first time with a bracketed number, like "...raised titer 2-fold [1]...". Reuse the same number for a repeat citation of the same paper later in this text. Do not mark general scene-setting, or a claim spanning several papers at once. List every marker you used in "references" as {marker, id}, using each paper's id exactly as given above. If you cite nothing directly, return references: [].`;

/** Prior narratives for one category, oldest last, or '' when there are none. */
function historyBlock(entries) {
  if (!entries?.length) return '';
  const blocks = [...entries]
    .reverse()
    .map((e) => `### ${e.month}\n${e.synthesis}`)
    .join('\n\n');
  return `

PREVIOUS MONTHS IN THIS CATEGORY (oldest first) — what you told this reader before:

${blocks}

${CONTINUITY_GUARD}`;
}

function categorySystem(category, history = []) {
  return `You are writing the monthly narrative for one category of a bioprocess digest, for a single expert reader in upstream CHO process development and CMC.

CATEGORY: ${category.name} (${category.id})

SCOPE:
${category.scope}

Write 3-5 sentences covering the through-line of the month in this category: what connects these items, what extends prior work, and above all what *contradicts* it. Name the specific papers by their finding. If two items disagree, say so — that is the most useful thing you can tell this reader.

If the month's items have no through-line, say that rather than inventing one. "Three unrelated results, of which the perfusion media work is the one worth reading" is a good answer.

No preamble. No list. Prose.

${FOOTNOTE_INSTRUCTIONS}${historyBlock(history)}

Write in plain ASCII, using American spellings (titer not titre, behavior not behaviour, defense not defence, modeling not modelling, labeled not labelled, characterized not characterised, analyzed not analysed, program not programme, center not centre, analog not analogue). Use a straight apostrophe ('), never a curly one. Use a hyphen for ranges (1.6-7.4-fold, 2012-2025) and avoid en and em dashes entirely — under a JSON schema they have been observed to come back as a broken escape that lands as a stray newline in the middle of a sentence. This governs your own prose only — never alter the wording of a paper title, an author name or a venue.`;
}

function papersBlock(papers) {
  return papers
    .map((p, i) => `[${i}] id: ${p.external_id}\n${p.title}\n${[p.venue, p.published].filter(Boolean).join(' · ')}\nrelevance ${p.relevance}\n${p.summary}\nwhy it matters: ${p.why_it_matters}`)
    .join('\n\n---\n\n');
}

export function sortForReading(papers) {
  return [...papers].sort(
    (a, b) => b.relevance - a.relevance || String(b.published ?? '').localeCompare(String(a.published ?? '')),
  );
}
