import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Must be set before lib/digestDir.js is imported — it resolves at module load.
const dir = await mkdtemp(path.join(tmpdir(), 'digest-write-'));
process.env.DIGEST_DIR = dir;

const { write } = await import('../lib/pipeline/write.js');

after(() => rm(dir, { recursive: true, force: true }));

const config = {
  ledger: { shardAfter: 5000 },
  categories: [
    { id: 'upstream_pd', name: 'Upstream Process Development', max_items: 5, scope: 'x'.repeat(60) },
  ],
};

const paper = (id, over = {}) => ({
  external_id: `doi:${id}`,
  title: `Paper ${id}`,
  authors: ['A. Author'],
  venue: 'J. Bioproc.',
  published: '2026-08-01',
  url: `https://doi.org/${id}`,
  doi: id,
  summary: 'A summary.',
  why_it_matters: 'It matters.',
  relevance: 4,
  scored_in: ['upstream_pd'],
  sources: ['pubmed'],
  ...over,
});

const args = (over = {}) => ({
  items: [paper('a')],
  narratives: [{ id: 'upstream_pd', synthesis: 'A narrative.', papers: [paper('a')] }],
  top_items: [{ id: 'doi:a', reason: 'because' }],
  summary: 'An overview.',
  month: '2026-08',
  config,
  health: [],
  run_stats: { total_cost_usd: 1.23 },
  ...over,
});

test('assembles the report shape the viewer and the brief expect', async () => {
  const { report } = await write(args({ dry: true }));

  assert.equal(report.month_of, '2026-08-01');
  assert.match(report.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(report.summary, 'An overview.');
  assert.deepEqual(report.top_items, [{ id: 'doi:a', reason: 'because' }]);
  assert.equal(report.categories[0].name, 'Upstream Process Development', 'category names come from config');

  const item = report.categories[0].items[0];
  for (const key of ['id', 'title', 'authors', 'venue', 'published', 'url', 'doi', 'summary', 'why_it_matters', 'relevance_score', 'is_recurring']) {
    assert.ok(key in item, `item is missing ${key}`);
  }
  assert.equal(item.relevance_score, 4);
});

test('a dry run writes nothing and leaves the ledger alone', async () => {
  const { stats } = await write(args({ dry: true, month: '2099-01' }));
  assert.equal(stats.written, false);
  assert.equal(stats.ledger_size, null, 'a dry run that advanced the ledger would hide next month');
  await assert.rejects(() => readFile(path.join(dir, '2099-01.json'), 'utf8'));
});

test('writes the month and advances the ledger', async () => {
  const { stats } = await write(args({ month: '2026-09' }));
  assert.equal(stats.written, true);
  assert.equal(stats.ledger_size, 1);

  const onDisk = JSON.parse(await readFile(path.join(dir, '2026-09.json'), 'utf8'));
  assert.equal(onDisk.month_of, '2026-09-01');
  assert.equal(onDisk.categories[0].items.length, 1);
});

test('months are append-only: a second write is refused without --force', async () => {
  // The deliberate inverse of TrendTracker's overwrite-by-design writeReport.
  await write(args({ month: '2026-10' }));
  await assert.rejects(
    () => write(args({ month: '2026-10' })),
    /already exists and months are append-only/,
  );
});

test('--force overwrites deliberately', async () => {
  await write(args({ month: '2026-11' }));
  const { stats } = await write(args({ month: '2026-11', summary: 'Rewritten.', force: true }));
  assert.equal(stats.written, true);

  const onDisk = JSON.parse(await readFile(path.join(dir, '2026-11.json'), 'utf8'));
  assert.equal(onDisk.summary, 'Rewritten.');
});

test('a recurring item keeps its badge and says when it was first seen', async () => {
  // normalize has already narrowed a recurring item's categories to the ones it
  // has NOT been reported under, so reaching here with is_recurring true means
  // "seen before, but new to this section". The badge passes through unchanged.
  const recurring = paper('rec', { is_recurring: true, previously_seen: '2026-06' });
  const { report } = await write(args({
    dry: true,
    items: [recurring],
    narratives: [{ id: 'upstream_pd', synthesis: 'n', papers: [recurring] }],
  }));
  const item = report.categories[0].items[0];
  assert.equal(item.is_recurring, true);
  assert.equal(item.previously_seen, '2026-06', 'the reader is told which month, not just that it recurs');
});

test('a first-time item is not badged as recurring', async () => {
  const { report } = await write(args({ dry: true }));
  assert.equal(report.categories[0].items[0].is_recurring, false);
  assert.equal(report.categories[0].items[0].previously_seen, null);
});
