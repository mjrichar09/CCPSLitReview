import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Must be set before lib/digestDir.js is imported — it resolves at module load.
const dir = await mkdtemp(path.join(tmpdir(), 'digest-history-'));
process.env.DIGEST_DIR = dir;

const { loadHistory } = await import('../lib/util/history.js');

after(() => rm(dir, { recursive: true, force: true }));

/** A month file with one category and one Top item, enough to read back. */
function report(month, synthesis) {
  return {
    month_of: month,
    summary: `overview ${month}`,
    top_items: [{ id: 'doi:a', reason: `reason ${month}` }],
    categories: [
      {
        id: 'upstream_pd',
        name: 'Upstream',
        synthesis,
        items: [{ id: 'doi:a', title: `Paper A (${month})` }],
      },
    ],
  };
}

async function seed(month, synthesis) {
  await writeFile(path.join(dir, `${month}.json`), JSON.stringify(report(month, synthesis)), 'utf8');
}

await seed('2026-05', 'may narrative');
await seed('2026-06', 'june narrative');
await seed('2026-07', 'july narrative');
await seed('2026-08', 'august narrative');

test('returns the `back` most recent months strictly earlier than the target', async () => {
  const history = await loadHistory('2026-08', { back: 2 });
  assert.deepEqual(history.months, ['2026-07', '2026-06'], 'newest-first, and never the target month itself');
  assert.deepEqual(
    history.byCategory.get('upstream_pd').map((e) => e.synthesis),
    ['july narrative', 'june narrative'],
  );
});

test('the target month never sees its own narratives, even on a re-run', async () => {
  const history = await loadHistory('2026-06', { back: 5 });
  assert.deepEqual(history.months, ['2026-05']);
});

test('back: 0 disables cross-month context entirely', async () => {
  const history = await loadHistory('2026-08', { back: 0 });
  assert.deepEqual(history.months, []);
  assert.equal(history.byCategory.size, 0);
  assert.deepEqual(history.overviews, []);
});

test('no earlier months yields empty structures rather than throwing', async () => {
  const history = await loadHistory('2026-01');
  assert.deepEqual(history.months, []);
  assert.equal(history.byCategory.size, 0);
});

test('an unreadable month is skipped, not fatal', async () => {
  await writeFile(path.join(dir, '2026-04.json'), 'not json at all', 'utf8');
  const history = await loadHistory('2026-06', { back: 3 });
  assert.deepEqual(history.months, ['2026-05'], 'the corrupt month drops out and the run continues');
});

test('Top-item ids resolve to titles from that month own record', async () => {
  const [overview] = (await loadHistory('2026-08', { back: 1 })).overviews;
  assert.equal(overview.month, '2026-07');
  assert.equal(overview.summary, 'overview 2026-07');
  assert.deepEqual(overview.top, [{ title: 'Paper A (2026-07)', reason: 'reason 2026-07' }]);
});
