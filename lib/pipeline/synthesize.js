import { createGenerator } from '../generate/index.js';
import { createLimiter } from '../util/throttle.js';
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
 */
export async function synthesize({ items, config, month, usage, env = process.env, generator: injected }) {
  const generator = injected ?? createGenerator(config, 'synthesize', { env });

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
          system: categorySystem(category),
          user: papersBlock(papers),
          schema: { type: 'object', properties: { synthesis: { type: 'string' } }, required: ['synthesis'], additionalProperties: false },
          maxTokens: NARRATIVE_TOKENS,
          usage,
        });
        narratives[index] = { id: category.id, synthesis: parsed.synthesis, papers };
      }),
    ),
  );

  const top = await pickTopItems({ items, narratives, config, generator, usage });
  const summary = await writeOverview({ narratives, top, items, month, config, generator, usage });

  log.info('synthesize complete', { categories: narratives.length, top: top.length });

  return {
    narratives,
    top_items: top,
    summary,
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
async function pickTopItems({ items, narratives, config, generator, usage }) {
  const want = config.top_items ?? 5;
  const valid = new Map(items.map((p) => [p.external_id, p]));

  const parsed = await generator.generate({
    system: `You are choosing the Top ${want} items of the month for an upstream CHO process development and CMC scientist, across every category.

Rank on what would change this reader's thinking, not on how prestigious the venue is or how comprehensive the work is. A result that contradicts current practice outranks a thorough confirmation of it. A preprint that matters outranks a journal paper that does not.

Spread across categories unless one area genuinely dominated the month. Return ids exactly as given, most important first, with one line saying why it earned the slot.`,
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

  const seen = new Set();
  const chosen = [];
  for (const entry of parsed.top ?? []) {
    if (!valid.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    chosen.push({ id: entry.id, reason: entry.reason });
    if (chosen.length === want) break;
  }

  if (chosen.length < want) {
    const dropped = (parsed.top ?? []).length - chosen.length;
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

async function writeOverview({ narratives, top, items, month, config, generator, usage }) {
  const byId = new Map(items.map((p) => [p.external_id, p]));
  const parsed = await generator.generate({
    system: `Write the opening paragraph of a monthly bioprocess digest for one expert reader: upstream CHO process development and CMC.

One paragraph, 4-6 sentences. Say what actually happened this month — the through-line, what shifted, what contradicted prior practice. Name specifics. If the month was quiet, say so; a manufactured theme is worse than an honest "nothing moved much this month, though X is worth watching."

No greeting, no sign-off, no "in this issue". Start with the substance.`,
    user: `Month: ${month}\n\nTop items:\n${top.map((t) => `- ${byId.get(t.id)?.title ?? t.id} — ${t.reason}`).join('\n')}\n\nCategory narratives:\n${narratives.map((n) => `## ${n.id}\n${n.synthesis}`).join('\n\n')}`,
    schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false },
    maxTokens: OVERVIEW_TOKENS,
    usage,
  });
  return parsed.summary;
}

function categorySystem(category) {
  return `You are writing the monthly narrative for one category of a bioprocess digest, for a single expert reader in upstream CHO process development and CMC.

CATEGORY: ${category.name} (${category.id})

SCOPE:
${category.scope}

Write 3-5 sentences covering the through-line of the month in this category: what connects these items, what extends prior work, and above all what *contradicts* it. Name the specific papers by their finding, not by citation. If two items disagree, say so — that is the most useful thing you can tell this reader.

If the month's items have no through-line, say that rather than inventing one. "Three unrelated results, of which the perfusion media work is the one worth reading" is a good answer.

No preamble. No list. Prose.

Write in plain ASCII. Use a hyphen for ranges (1.6-7.4-fold, 2012-2025) and avoid en and em dashes entirely — under a JSON schema they have been observed to come back as a broken escape that lands as a stray newline in the middle of a sentence.`;
}

function papersBlock(papers) {
  return papers
    .map((p, i) => `[${i}] ${p.title}\n${[p.venue, p.published].filter(Boolean).join(' · ')}\nrelevance ${p.relevance}\n${p.summary}\nwhy it matters: ${p.why_it_matters}`)
    .join('\n\n---\n\n');
}

function sortForReading(papers) {
  return [...papers].sort(
    (a, b) => b.relevance - a.relevance || String(b.published ?? '').localeCompare(String(a.published ?? '')),
  );
}
