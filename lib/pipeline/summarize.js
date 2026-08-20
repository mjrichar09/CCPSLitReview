import { createGenerator } from '../generate/index.js';
import { createLimiter } from '../util/throttle.js';
import { log } from '../util/log.js';

const ABSTRACT_LIMIT = 2400;

/**
 * Stage 4 — a technical summary and a `why_it_matters` line per surviving item.
 *
 * Two economies decide the shape of this stage, and both are about not paying
 * twice for the same paper:
 *
 * 1. **Trim to `max_items` first.** Scoring keeps everything at or above the
 *    threshold; the report only ever shows `max_items` per category. Summarising
 *    the overflow and discarding it afterwards is spend with no reader.
 * 2. **Summarise a paper once, not once per category.** 180 category-level keeps
 *    are 128 distinct papers. Beyond the saving, one paper with two different
 *    summaries in two sections would read as an error.
 */
export async function summarize({ items, config, usage, env = process.env, generator: injected }) {
  const generator = injected ?? createGenerator(config, 'summarize', { env });
  const kept = trimToCaps(items, config);
  const papers = dedupeToDistinctPapers(kept);

  const batchSize = config.summarize?.batchSize ?? 6;
  const batches = [];
  for (let i = 0; i < papers.length; i += batchSize) batches.push(papers.slice(i, i + batchSize));

  const limiter = createLimiter({
    rps: config.models.summarize.rps ?? 0.75,
    concurrency: config.models.summarize.concurrency ?? 4,
  });

  const results = new Array(batches.length);
  await Promise.all(
    batches.map((batch, index) =>
      limiter.schedule(async () => {
        results[index] = await generator.generate({
          system: SYSTEM,
          user: buildUser(batch),
          schema: buildSchema(),
          maxTokens: Math.max(2048, batch.length * 400),
          usage,
        });
      }),
    ),
  );

  // Applied in batch order, like scoring: concurrency must not reorder the report.
  const summaries = new Map();
  batches.forEach((batch, index) => {
    const parsed = results[index];
    const byIndex = new Map((parsed?.summaries ?? []).map((s) => [s.index, s]));
    const missing = batch.map((_, i) => i).filter((i) => !byIndex.has(i));
    if (missing.length > 0) {
      // Same contract as scoring: a silently unsummarised item would render as
      // an empty card rather than as a failure.
      throw new Error(
        `summarize: model returned no summary for ${missing.length} of ${batch.length} items (batch ${index})`,
      );
    }
    batch.forEach((paper, i) => {
      const s = byIndex.get(i);
      summaries.set(paper.external_id, {
        summary: s.summary,
        why_it_matters: s.why_it_matters,
        thin_abstract: Boolean(s.thin_abstract),
      });
    });
  });

  const out = papers.map((paper) => ({ ...paper, ...summaries.get(paper.external_id) }));
  const thin = out.filter((p) => p.thin_abstract).length;
  log.info('summarize complete', { papers: out.length, batches: batches.length, thin });

  return {
    items: out,
    stats: {
      scored_keeps: items.length,
      after_cap: kept.length,
      distinct_papers: out.length,
      batches: batches.length,
      thin_abstracts: thin,
    },
  };
}

/**
 * Collapse category-level keeps to distinct papers, each carrying every
 * category it survived in as `scored_in`. Extracted from `summarize()` so the
 * routine-based generator's prep step (scripts/prep-for-routine.mjs) can reuse
 * this exact, deterministic logic instead of re-deriving it — 180 category-level
 * keeps are 128 distinct papers, and getting the merge wrong would carry
 * straight through to what the reader sees.
 */
export function dedupeToDistinctPapers(items) {
  const byId = new Map();
  for (const item of items) {
    const existing = byId.get(item.external_id);
    if (existing) {
      existing.scored_in.push(item.scored_for);
      existing.relevance = Math.max(existing.relevance, item.relevance);
    } else {
      byId.set(item.external_id, { ...item, scored_in: [item.scored_for] });
    }
  }
  return [...byId.values()];
}

/**
 * Keep the best `max_items` per category, by relevance then recency.
 *
 * Ties broken by publication date so a month of equally-scored items favours the
 * newer one — the reader's whole reason for a monthly digest.
 */
export function trimToCaps(items, config) {
  const caps = new Map(config.categories.map((c) => [c.id, c.max_items]));
  const byCategory = new Map();
  for (const item of items) {
    const id = item.scored_for;
    if (!byCategory.has(id)) byCategory.set(id, []);
    byCategory.get(id).push(item);
  }

  const kept = [];
  for (const [id, list] of byCategory) {
    list.sort((a, b) => b.relevance - a.relevance || String(b.published ?? '').localeCompare(String(a.published ?? '')));
    kept.push(...list.slice(0, caps.get(id) ?? list.length));
  }
  return kept;
}

const SYSTEM = `You are writing a monthly literature digest for exactly one reader: an upstream CHO cell culture process development and CMC scientist. Assume deep domain fluency. Never explain what a bioreactor, a fed-batch, a CQA or an HCP is.

For each item produce:

- summary: 2-3 sentences, technical and specific. Lead with what was actually done and what was found — titers, fold-changes, conditions, scales, mechanisms. Numbers where the abstract gives them. No throat-clearing ("This study investigates…"), no restating the title.
- why_it_matters: ONE sentence, written for this reader's job. What would they do differently, watch for, or reconsider? If the honest answer is "nothing yet, but it signals a direction", say that plainly.
- thin_abstract: true when the abstract is absent or too thin to support a real summary.

Hard rule: never invent a finding that is not in the text you were given. If the abstract is thin, set thin_abstract true, keep the summary to what is actually supported, and say what is not known. A confidently wrong summary is far worse here than an admittedly thin one — this reader will act on these.

Trade press and regulatory notices are not papers. Summarise what was announced or published and by whom; do not dress a press release up as a result.

Write in plain ASCII. Use a hyphen for ranges (1.6-7.4-fold, 2012-2025); avoid en and em dashes entirely. Under a JSON schema they have been observed coming back as a broken escape that lands as a stray newline mid-sentence.`;

function buildUser(batch) {
  const blocks = batch.map((item, index) => {
    const bits = [`[${index}] ${item.title}`];
    const meta = [item.venue, item.published, item.is_preprint ? 'PREPRINT' : null]
      .filter(Boolean)
      .join(' · ');
    if (meta) bits.push(meta);
    bits.push(item.abstract ? truncate(item.abstract, ABSTRACT_LIMIT) : '(no abstract available)');
    return bits.join('\n');
  });
  return `Summarise these ${batch.length} items.\n\n${blocks.join('\n\n---\n\n')}`;
}

function buildSchema() {
  return {
    type: 'object',
    properties: {
      summaries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            summary: { type: 'string' },
            why_it_matters: { type: 'string' },
            thin_abstract: { type: 'boolean' },
          },
          required: ['index', 'summary', 'why_it_matters', 'thin_abstract'],
          additionalProperties: false,
        },
      },
    },
    required: ['summaries'],
    additionalProperties: false,
  };
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
