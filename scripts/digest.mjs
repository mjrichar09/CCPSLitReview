#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from '../lib/config.js';
import { resolveWindow } from '../lib/util/window.js';
import { fetchAll, summarize as summarizeHealth } from '../lib/pipeline/fetch.js';
import { normalize } from '../lib/pipeline/normalize.js';
import { score } from '../lib/pipeline/score.js';
import { summarize } from '../lib/pipeline/summarize.js';
import { synthesize } from '../lib/pipeline/synthesize.js';
import { write } from '../lib/pipeline/write.js';
import { readStage, writeStage } from '../lib/util/staging.js';
import { createUsageLedger } from '../lib/util/usage.js';
import { SEARCH_SOURCES } from '../lib/adapters/index.js';
import { log, setLogLevel } from '../lib/util/log.js';

const STAGES = ['fetch', 'normalize', 'score', 'summarize', 'synthesize', 'write', 'all'];
const IMPLEMENTED = new Set(STAGES);
const ORDER = ['fetch', 'normalize', 'score', 'summarize', 'synthesize', 'write'];

const USAGE = `
Usage: node scripts/digest.mjs --stage <stage> [options]

Stages
  fetch        run every enabled adapter and collect raw records   (Phase 1)
  normalize    unify schema, dedupe, drop what was already seen    (Phase 2)
  score        LLM relevance gate                                  (Phase 2)
  summarize    per-item summary + why_it_matters                   (Phase 3)
  synthesize   per-category narrative, Top 5, editorial overview   (Phase 3)
  write        emit the month's JSON and update the ledger         (Phase 3)
  all          every implemented stage in order

Each stage reads its predecessor's staging artifact when one exists, so a
re-run after a mid-pipeline failure costs no re-fetching and no re-scoring.

Options
  --month YYYY-MM     target month (default: the month the window ends in)
  --since YYYY-MM-DD  override the window start
  --category <id>     restrict to one category (repeatable)
  --source <id>       restrict to one source (repeatable)
  --dry-run           do not publish: no month file, no ledger advance.
                      Staging artifacts are still written, so a re-run after a
                      failure costs no re-fetching, re-scoring or re-summarising.
  --fresh             ignore existing staging artifacts and re-run from fetch
  --force             allow overwriting an already-written month
  --log-level <lvl>   debug | info | warn | error   (default: info)
  --help              this message

Examples
  node scripts/digest.mjs --stage fetch --dry-run
  node scripts/digest.mjs --stage normalize --dry-run
  node scripts/digest.mjs --stage score --category modeling_ml --dry-run
`.trimStart();

async function main() {
  const { values } = parseArgs({
    options: {
      stage: { type: 'string' },
      month: { type: 'string' },
      since: { type: 'string' },
      category: { type: 'string', multiple: true },
      source: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
      fresh: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'log-level': { type: 'string', default: 'info' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help || !values.stage) {
    process.stdout.write(USAGE);
    process.exit(values.help ? 0 : 2);
  }

  setLogLevel(values['log-level']);
  const stage = values.stage;
  if (!STAGES.includes(stage)) fail(`unknown stage "${stage}" — expected one of ${STAGES.join(', ')}`);

  const config = loadConfig();
  const categories = selectCategories(config, values);
  const window = await resolveWindow({
    since: values.since,
    month: values.month,
    defaultDays: config.window.defaultDays,
  });
  const month = window.month;
  const dry = values['dry-run'];
  const usage = createUsageLedger();

  log.info('window resolved', {
    from: window.from.toISOString(), to: window.to.toISOString(), month, reason: window.reason,
  });

  const target = stage === 'all' ? ORDER[ORDER.length - 1] : stage;
  const wanted = ORDER.slice(0, ORDER.indexOf(target) + 1);
  const ctx = { config, categories, window, month, dry, fresh: values.fresh, force: values.force, usage };

  let result = null;
  for (const step of wanted) {
    result = await runStage(step, ctx, result);
  }

  report(target, result, ctx);

  const totals = usage.totals();
  if (totals.calls > 0) {
    process.stderr.write(usage.table({ keptItems: result?.items?.length ?? null }));
  }

  if (dry) {
    process.stdout.write(`${JSON.stringify({ month, stage: target, ...result }, null, 2)}\n`);
  }

  // Adapters fail soft by design, which means a run where *every* source died
  // still completes. That must not look like success: without this, a total
  // outage produces an empty digest and exit 0.
  const dead = deadSources(result?.health);
  if (dead.length > 0) {
    log.error('sources failed in every category they ran in', { sources: dead.join(',') });
    process.exitCode = 1;
  }
}

/** Sources that failed in every category they were enabled for. */
function deadSources(health) {
  const bySource = new Map();
  for (const h of health ?? []) {
    if (h.category === '*') continue;
    if (!bySource.has(h.source)) bySource.set(h.source, []);
    bySource.get(h.source).push(h);
  }
  return [...bySource.entries()]
    .filter(([, entries]) => entries.length > 0 && entries.every((e) => e.status === 'failed'))
    .map(([source]) => source);
}

/**
 * Staging artifacts are written on every run, dry ones included.
 *
 * `--dry-run` means "do not publish": no month file, no ledger advance. It does
 * NOT mean "discard the work". A dry run that failed in synthesize used to throw
 * away a completed scoring and summarising pass — real money, already spent —
 * because the artifacts behind them were never persisted. Caching them is the
 * entire point of the staging layer; `--fresh` is how you ask for a rebuild.
 */
async function runStage(step, ctx, previous) {
  const { month, dry, fresh } = ctx;

  // `write` has no staging artifact of its own — its output is the month file.
  if (!fresh && artifactFor(step)) {
    const cached = await readStage(month, artifactFor(step));
    if (cached) {
      log.info('reusing staging artifact', { stage: step, month, file: `${artifactFor(step)}.json` });
      // Carry the spend that produced this artifact, or the resumed run reports
      // only what it spent itself and the month's run_stats understate the cost.
      ctx.usage.restore(cached.usage);
      return cached;
    }
  }

  switch (step) {
    case 'fetch': {
      const { records, health } = await fetchAll({ config: ctx.config, window: ctx.window, categories: ctx.categories });
      const out = { month, window: { from: ctx.window.from, to: ctx.window.to }, records, health };
      out.usage = ctx.usage.rows();
      await writeStage(month, 'raw', out);
      return out;
    }
    case 'normalize': {
      const raw = previous ?? (await readStage(month, 'raw'));
      if (!raw) throw new Error('normalize: no raw records — run --stage fetch first');
      const out = await normalize({ records: raw.records, month, config: ctx.config });
      out.health = raw.health;
      out.usage = ctx.usage.rows();
      await writeStage(month, 'normalized', out);
      return out;
    }
    case 'score': {
      const normalized = previous ?? (await readStage(month, 'normalized'));
      if (!normalized) throw new Error('score: nothing normalized — run --stage normalize first');
      const out = await score({ items: normalized.items, config: ctx.config, usage: ctx.usage });
      out.month = month;
      out.health = normalized.health;
      out.run_stats = ctx.usage.toJSON({ stage: 'score' });
      // scored.json is committed even on a normal run: a future routine-based
      // generator reads it out of the repo (PLAN.md §7).
      out.usage = ctx.usage.rows();
      await writeStage(month, 'scored', out);
      return out;
    }
    case 'summarize': {
      const scored = previous ?? (await readStage(month, 'scored'));
      if (!scored) throw new Error('summarize: nothing scored — run --stage score first');
      const out = await summarize({ items: scored.items, config: ctx.config, usage: ctx.usage });
      out.health = scored.health;
      out.usage = ctx.usage.rows();
      await writeStage(month, 'summarized', out);
      return out;
    }
    case 'synthesize': {
      const summarized = previous ?? (await readStage(month, 'summarized'));
      if (!summarized) throw new Error('synthesize: nothing summarized — run --stage summarize first');
      const out = await synthesize({ items: summarized.items, config: ctx.config, month, usage: ctx.usage });
      out.items = summarized.items;
      out.health = summarized.health;
      out.usage = ctx.usage.rows();
      await writeStage(month, 'synthesized', out);
      return out;
    }
    case 'write': {
      const s = previous ?? (await readStage(month, 'synthesized'));
      if (!s) throw new Error('write: nothing synthesized — run --stage synthesize first');
      return write({
        items: s.items, narratives: s.narratives, top_items: s.top_items, summary: s.summary,
        month, config: ctx.config, health: s.health, run_stats: ctx.usage.toJSON(),
        dry, force: ctx.force,
      });
    }
    default:
      throw new Error(`no runner for stage "${step}"`);
  }
}

const ARTIFACTS = { fetch: 'raw', normalize: 'normalized', score: 'scored', summarize: 'summarized', synthesize: 'synthesized' };
function artifactFor(step) {
  return ARTIFACTS[step];
}

function selectCategories(config, values) {
  let categories = config.categories;
  if (values.category?.length) {
    const wanted = new Set(values.category);
    const unknown = [...wanted].filter((c) => !config.categories.some((x) => x.id === c));
    if (unknown.length) fail(`unknown category ids: ${unknown.join(', ')}`);
    categories = config.categories.filter((c) => wanted.has(c.id));
  }
  if (values.source?.length) {
    const unknown = values.source.filter((s) => !SEARCH_SOURCES.includes(s));
    if (unknown.length) fail(`unknown source ids: ${unknown.join(', ')}`);
    const wanted = new Set(values.source);
    categories = categories.map((c) => {
      const sources = { ...(c.sources ?? {}) };
      for (const id of SEARCH_SOURCES) {
        sources[id] = { ...(sources[id] ?? {}), enabled: wanted.has(id) ? (sources[id]?.enabled ?? true) : false };
      }
      return { ...c, sources };
    });
  }
  return categories;
}

function report(stage, result, ctx) {
  if (stage === 'fetch') return printFetch(result, ctx);
  if (stage === 'normalize') return printNormalize(result);
  if (stage === 'score') return printScore(result, ctx);
  if (stage === 'summarize') return printSummarize(result);
  if (stage === 'synthesize') return printSynthesize(result);
  if (stage === 'write') return printWrite(result);
}

function printFetch(result, ctx) {
  const { sources, rows, total } = summarizeHealth(result.health, ctx.categories);
  const w = Math.max(16, ...rows.map((r) => r.category.length));
  const col = (s) => String(s).padStart(10);
  const out = ['', `fetched ${total} raw records`, ''];
  out.push(`${'category'.padEnd(w)}${sources.map(col).join('')}${col('total')}`);
  out.push('-'.repeat(w + (sources.length + 1) * 10));
  for (const row of rows) {
    const cells = row.cells.map((cell) =>
      !cell ? col('·') : cell.status === 'failed' ? col('FAIL') : col(cell.status === 'degraded' ? `${cell.fetched}!` : cell.fetched),
    );
    out.push(`${row.category.padEnd(w)}${cells.join('')}${col(row.total)}`);
  }
  out.push('-'.repeat(w + (sources.length + 1) * 10));
  out.push('');
  printProblems(result.health, out);
  process.stderr.write(`${out.join('\n')}\n`);
}

function printNormalize(result) {
  const s = result.stats;
  const out = [
    '',
    `normalize: ${s.input} raw → ${s.output} unique → ${s.kept} kept`,
    '',
    `  collapsed by identifier  ${String(s.byId).padStart(5)}`,
    `  collapsed by title       ${String(s.byTitle).padStart(5)}   (same paper, different ids across sources)`,
    `  dropped as already seen  ${String(s.dropped_as_seen).padStart(5)}`,
    `  marked recurring         ${String(s.recurring).padStart(5)}`,
    `  ledger size              ${String(s.ledger_size).padStart(5)}`,
    '',
  ];
  process.stderr.write(`${out.join('\n')}\n`);
}

function printScore(result, ctx) {
  const s = result.stats;
  const out = ['', `score: ${s.scored} judged → ${s.kept} kept at threshold ${s.threshold}`, ''];
  const w = Math.max(16, ...Object.keys(s.by_category).map((k) => k.length));
  out.push(`${'category'.padEnd(w)}${'seen'.padStart(8)}${'kept'.padStart(8)}${'dropped'.padStart(9)}`);
  out.push('-'.repeat(w + 25));
  for (const [id, t] of Object.entries(s.by_category)) {
    out.push(`${id.padEnd(w)}${String(t.seen).padStart(8)}${String(t.kept).padStart(8)}${String(t.dropped).padStart(9)}`);
  }
  out.push('-'.repeat(w + 25));

  const cap = new Map(ctx.config.categories.map((c) => [c.id, c.max_items]));
  const over = Object.entries(s.by_category).filter(([id, t]) => t.kept > (cap.get(id) ?? Infinity));
  if (over.length > 0) {
    out.push('');
    out.push('over max_items (the write stage will trim to the cap, highest relevance first):');
    for (const [id, t] of over) out.push(`  ${id}: ${t.kept} kept, cap ${cap.get(id)}`);
  }
  out.push('');
  process.stderr.write(`${out.join('\n')}\n`);
}

function printSummarize(result) {
  const s = result.stats;
  process.stderr.write(`\nsummarize: ${s.scored_keeps} keeps → ${s.after_cap} after cap → ${s.distinct_papers} distinct papers in ${s.batches} calls${s.thin_abstracts ? ` (${s.thin_abstracts} thin abstracts)` : ''}\n\n`);
}

function printSynthesize(result) {
  const s = result.stats;
  process.stderr.write(`\nsynthesize: ${s.categories} category narratives, Top ${s.top_items}\n\n`);
}

function printWrite(result) {
  const s = result.stats;
  const out = [
    '',
    s.written ? `wrote ${s.month}.json` : `would write ${s.month}.json (dry run — nothing written, ledger untouched)`,
    '',
    `  papers            ${String(s.papers).padStart(5)}`,
    `  categories        ${String(s.categories).padStart(5)}`,
    `  category slots    ${String(s.category_slots).padStart(5)}`,
    `  top items         ${String(s.top_items).padStart(5)}`,
    `  ledger size       ${s.ledger_size == null ? '    -' : String(s.ledger_size).padStart(5)}`,
    '',
  ];
  process.stderr.write(`${out.join('\n')}\n`);
}

function printProblems(health, out) {
  const problems = (health ?? []).filter((h) => h.status !== 'ok');
  if (problems.length > 0) {
    out.push('source_health problems:');
    for (const p of problems) out.push(`  [${p.status}] ${p.source}/${p.category}${p.error ? ` — ${p.error}` : ''}`);
    out.push('');
  }
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}

main().catch((err) => {
  // An HttpError's message is only the status line; the provider's explanation
  // is in the body. Logging just the message turns "400 Bad Request" into an
  // undebuggable run — which is exactly what happened on the first Groq attempt.
  log.error('run failed', { error: err.message, ...(err.body ? { body: String(err.body).slice(0, 600) } : {}) });
  if (process.env.DIGEST_TRACE) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
