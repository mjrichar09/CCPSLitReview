#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from '../lib/config.js';
import { resolveWindow } from '../lib/util/window.js';
import { fetchAll, summarize } from '../lib/pipeline/fetch.js';
import { SEARCH_SOURCES } from '../lib/adapters/index.js';
import { log, setLogLevel } from '../lib/util/log.js';

const STAGES = ['fetch', 'normalize', 'score', 'summarize', 'synthesize', 'write', 'all'];
const IMPLEMENTED = new Set(['fetch']); // Phase 1

const USAGE = `
Usage: node scripts/digest.mjs --stage <stage> [options]

Stages
  fetch        run every enabled adapter and collect raw records   (Phase 1)
  normalize    unify schema, dedupe against the ledger             (Phase 2)
  score        LLM relevance gate                                  (Phase 2)
  summarize    per-item summary + why_it_matters                   (Phase 3)
  synthesize   per-category narrative, Top 5, editorial overview   (Phase 3)
  write        emit the month's JSON and update the ledger         (Phase 3)
  all          every stage in order                                (Phase 3)

Options
  --month YYYY-MM     target month (default: the month the window ends in)
  --since YYYY-MM-DD  override the window start
  --category <id>     restrict to one category (repeatable)
  --source <id>       restrict to one source (repeatable)
  --dry-run           fetch and score but write nothing; print to stdout
  --force             allow overwriting an already-written month
  --log-level <lvl>   debug | info | warn | error   (default: info)
  --help              this message

Examples
  node scripts/digest.mjs --stage fetch --dry-run
  node scripts/digest.mjs --stage fetch --dry-run --category modeling_ml
  node scripts/digest.mjs --stage fetch --dry-run --since 2026-07-01 --source pubmed
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
  if (!STAGES.includes(stage)) {
    fail(`unknown stage "${stage}" — expected one of ${STAGES.join(', ')}`);
  }
  if (!IMPLEMENTED.has(stage)) {
    fail(`stage "${stage}" is not implemented yet (Phase 1 ships fetch only)`);
  }

  const config = loadConfig();

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
    categories = restrictSources(categories, new Set(values.source));
  }

  const window = await resolveWindow({
    since: values.since,
    month: values.month,
    defaultDays: config.window.defaultDays,
  });

  log.info('window resolved', {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    month: window.month,
    reason: window.reason,
  });

  const started = Date.now();
  const { records, health } = await fetchAll({ config, window, categories });

  printSummary(summarize(health, categories), health, records, Date.now() - started);

  if (values['dry-run']) {
    // Records to stdout so the run stays pipeable; everything else is stderr.
    process.stdout.write(JSON.stringify({ month: window.month, window: { from: window.from, to: window.to }, records }, null, 2) + '\n');
  } else {
    log.warn('fetch stage writes nothing in Phase 1 — re-run with --dry-run to see the records');
  }

  // A source that failed everywhere is worth a non-zero exit even though the
  // run itself completed: it means a whole feed of the digest went dark.
  const dead = deadSources(health);
  if (dead.length > 0) {
    log.error('sources failed in every category', { sources: dead.join(',') });
    process.exitCode = 1;
  }
}

function restrictSources(categories, wanted) {
  return categories.map((c) => {
    const sources = { ...(c.sources ?? {}) };
    for (const id of SEARCH_SOURCES) {
      sources[id] = { ...(sources[id] ?? {}), enabled: wanted.has(id) ? (sources[id]?.enabled ?? true) : false };
    }
    return { ...c, sources };
  });
}

function printSummary({ sources, rows, total }, health, records, ms) {
  const w = Math.max(14, ...rows.map((r) => r.category.length));
  const col = (s) => String(s).padStart(10);

  const out = [];
  out.push('');
  out.push(`fetched ${total} raw records in ${(ms / 1000).toFixed(1)}s`);
  out.push('');
  out.push(`${'category'.padEnd(w)}${sources.map(col).join('')}${col('total')}`);
  out.push('-'.repeat(w + (sources.length + 1) * 10));

  for (const row of rows) {
    const cells = row.cells.map((cell) => {
      if (!cell) return col('·');
      if (cell.status === 'failed') return col('FAIL');
      return col(cell.status === 'degraded' ? `${cell.fetched}!` : cell.fetched);
    });
    out.push(`${row.category.padEnd(w)}${cells.join('')}${col(row.total)}`);
  }

  out.push('-'.repeat(w + (sources.length + 1) * 10));
  const totals = sources.map((s) =>
    col(health.filter((h) => h.source === s && h.category !== '*').reduce((n, h) => n + h.fetched, 0)),
  );
  out.push(`${'total'.padEnd(w)}${totals.join('')}${col(total)}`);
  out.push('');
  out.push(`unique DOIs: ${new Set(records.filter((r) => r.doi).map((r) => r.doi)).size}   ` +
    `with abstract: ${records.filter((r) => r.abstract).length}/${records.length}`);

  const problems = health.filter((h) => h.status !== 'ok');
  if (problems.length > 0) {
    out.push('');
    out.push('source_health problems:');
    for (const p of problems) {
      out.push(`  [${p.status}] ${p.source}/${p.category}${p.error ? ` — ${p.error}` : ''}`);
    }
  }

  const notes = health.filter((h) => h.notes?.length);
  if (notes.length > 0) {
    out.push('');
    out.push('notes:');
    for (const n of notes) {
      for (const note of n.notes) out.push(`  ${n.source}/${n.category}: ${note}`);
    }
  }
  out.push('');

  process.stderr.write(out.join('\n') + '\n');
}

/** Sources that failed in every category they ran in. */
function deadSources(health) {
  const bySource = new Map();
  for (const h of health) {
    if (h.category === '*') continue;
    if (!bySource.has(h.source)) bySource.set(h.source, []);
    bySource.get(h.source).push(h);
  }
  return [...bySource.entries()]
    .filter(([, entries]) => entries.length > 0 && entries.every((e) => e.status === 'failed'))
    .map(([source]) => source);
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}

main().catch((err) => {
  log.error('run failed', { error: err.message });
  if (process.env.DIGEST_TRACE) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
