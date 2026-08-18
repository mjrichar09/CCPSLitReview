import { createProvider, parseJson } from '../providers/index.js';
import { createLimiter } from '../util/throttle.js';
import { loadFeedback, feedbackBlock } from '../feedback.js';
import { log } from '../util/log.js';

const ABSTRACT_LIMIT = 1200;

/**
 * Stage 3 — the relevance gate.
 *
 * One call per category per batch, judged against that category's scope
 * statement verbatim. The highest-volume stage in the pipeline, so items are
 * batched and the rubric is sent as a cached prefix rather than re-billed with
 * every batch.
 *
 * Items are addressed by index rather than by title: it keeps the response
 * small, and it makes a mis-aligned answer detectable instead of silently
 * attaching one paper's score to another.
 *
 * Batches run concurrently, in two waves. Wave one is the first batch of each
 * category — those are the calls that *write* the rubric cache, and they are all
 * for different rubrics, so nothing is duplicated. Wave two is every remaining
 * batch, each of which now reads a warm cache. Running the whole thing flat
 * would fire same-category batches together, and each would miss and re-write
 * the cache; running it strictly sequentially (as this first did) took over 40
 * minutes for one month and did not fit inside an Actions job.
 */
export async function score({
  items,
  config,
  usage,
  env = process.env,
  onBatch,
  provider: injected,
  month,
  feedback: injectedFeedback,
}) {
  // `provider` is injectable so the batching, the gate, and the
  // missing-verdict guard are testable without a network or an API key.
  const provider = injected ?? createProvider(config, 'score', { env });
  const threshold = config.relevance.threshold;
  const batchSize = config.relevance.batchSize;
  const categoryIds = config.categories.map((c) => c.id);
  const schema = buildSchema(categoryIds);

  // Loaded once per run, before the per-category loop, so the rubric-cache
  // property below (one system prompt per category) is unaffected.
  const feedback = injectedFeedback ?? (await loadFeedback(month, { env, back: config.history?.back }));

  const kept = [];
  const dropped = [];
  const perCategory = new Map();

  // Every (category, batch) pair, in the order results must be applied.
  const jobs = [];
  for (const category of config.categories) {
    const forCategory = items.filter((item) => item.categories.includes(category.id));
    if (forCategory.length === 0) continue;
    const system = buildSystem(category, categoryIds, threshold, feedback.byCategory.get(category.id) ?? []);
    for (let i = 0; i < forCategory.length; i += batchSize) {
      jobs.push({ category, system, batch: forCategory.slice(i, i + batchSize), first: i === 0 });
    }
  }

  const limiter = createLimiter({
    rps: config.models.score.rps ?? 1,
    concurrency: config.models.score.concurrency ?? 4,
  });

  const call = async (job) => {
    const response = await provider.complete({
      system: job.system,
      user: buildUser(job.batch),
      schema,
      maxTokens: Math.max(1024, job.batch.length * 120),
    });
    usage?.record({
      stage: 'score',
      provider: provider.provider,
      model: provider.model,
      rates: provider.rates,
      usage: response.usage,
    });
    job.parsed = parseJson(response.text, `score/${job.category.id}`);
    onBatch?.({ category: job.category.id, size: job.batch.length });
  };

  const wave = (selected) => Promise.all(selected.map((job) => limiter.schedule(() => call(job))));
  await wave(jobs.filter((j) => j.first));
  await wave(jobs.filter((j) => !j.first));

  // Applied after every call has returned, in job order rather than completion
  // order: concurrency must not change which items land in the report or in what
  // sequence. A run must be reproducible from its inputs.
  for (const job of jobs) {
    applyScores({ batch: job.batch, parsed: job.parsed, category: job.category, threshold, kept, dropped, perCategory });
  }
  for (const [id, tally] of perCategory) {
    log.info('scored category', { category: id, seen: tally.seen, kept: tally.kept });
  }

  return {
    items: kept,
    dropped,
    stats: {
      scored: kept.length + dropped.length,
      kept: kept.length,
      dropped: dropped.length,
      threshold,
      by_category: Object.fromEntries(perCategory),
    },
  };
}

function applyScores({ batch, parsed, category, threshold, kept, dropped, perCategory }) {
  const scores = new Map((parsed?.scores ?? []).map((s) => [s.index, s]));

  // A missing verdict is a contract violation, not a zero: silently dropping
  // the item would look identical to the model judging it irrelevant.
  const missing = batch.map((_, i) => i).filter((i) => !scores.has(i));
  if (missing.length > 0) {
    throw new Error(
      `score/${category.id}: model returned no verdict for ${missing.length} of ${batch.length} items (indices ${missing.slice(0, 5).join(', ')})`,
    );
  }

  const tally = perCategory.get(category.id) ?? { seen: 0, kept: 0, dropped: 0 };

  batch.forEach((item, index) => {
    const verdict = scores.get(index);
    const relevance = clamp(verdict.relevance);
    const entry = {
      ...item,
      relevance,
      rationale: verdict.rationale,
      scored_for: category.id,
      // The model may place an item in more than one category; intersect with
      // what it actually matched so it cannot invent a placement.
      categories: mergeCategories(item.categories, verdict.categories, category.id),
    };

    tally.seen += 1;
    if (relevance >= threshold) {
      kept.push(entry);
      tally.kept += 1;
    } else {
      dropped.push(entry);
      tally.dropped += 1;
    }
  });

  perCategory.set(category.id, tally);
}

function mergeCategories(existing, suggested, current) {
  const out = new Set(existing);
  out.add(current);
  for (const c of suggested ?? []) out.add(c);
  return [...out];
}

function clamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function buildSystem(category, categoryIds, threshold, feedbackEntries = []) {
  return `You are screening new literature for a single expert reader: an upstream CHO cell culture process development and CMC scientist. Assume deep domain fluency — never explain what a bioreactor or a fed-batch is.

You are scoring items for exactly one category.

CATEGORY: ${category.name} (${category.id})

SCOPE — this is the rubric. Judge against it literally:
${category.scope}

SCORING, 0 to 5:
5  directly in scope, and new or contradicts prior practice — the reader would change something after reading it
4  directly in scope and substantive, but confirms rather than challenges what is known
3  in scope and worth a look; the minimum that earns a place in the digest
2  adjacent — the reader would recognise the area but this specific item does not serve them
1  same vocabulary, different problem
0  out of scope, wrong field, or wrong expression system per the rubric above

Prefer what is NEW or CONTRADICTS prior practice over what is merely published. A competent but unsurprising paper is a 4, not a 5. Reviews score on whether they change the reader's picture, not on how comprehensive they are.

Items at or above ${threshold} are kept, so treat ${threshold} as the bar for "worth this reader's attention".

Some items are trade press or regulatory notices rather than papers, and some carry a thin abstract or none at all. Judge what is actually there — do not assume substance you cannot see, and do not reward an item for a promising title alone.

Return one verdict per item, addressed by the item's index. Every index you are given must appear exactly once.
- relevance: integer 0-5
- categories: the category ids this item genuinely belongs to, from ${JSON.stringify(categoryIds)}. Usually just "${category.id}". Add another only if the item squarely belongs there too.
- rationale: one line, concrete, naming the reason. "Raman model transferred across scales without recalibration" — not "relevant to PAT".${feedbackBlock(feedbackEntries)}`;
}

function buildUser(batch) {
  const blocks = batch.map((item, index) => {
    const bits = [`[${index}] ${item.title}`];
    const meta = [item.venue, item.published, item.is_preprint ? 'PREPRINT' : null]
      .filter(Boolean)
      .join(' · ');
    if (meta) bits.push(meta);
    bits.push(
      item.abstract
        ? truncate(item.abstract, ABSTRACT_LIMIT)
        : '(no abstract available — judge on title and venue alone, and score conservatively)',
    );
    return bits.join('\n');
  });

  return `Score these ${batch.length} items.\n\n${blocks.join('\n\n---\n\n')}`;
}

function buildSchema(categoryIds) {
  return {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            relevance: { type: 'integer' },
            categories: { type: 'array', items: { type: 'string', enum: categoryIds } },
            rationale: { type: 'string' },
          },
          required: ['index', 'relevance', 'categories', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['scores'],
    additionalProperties: false,
  };
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
