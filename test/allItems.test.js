import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Must be set before lib/digestDir.js is imported — it resolves at module load.
const dir = await mkdtemp(path.join(tmpdir(), 'digest-allitems-'));
process.env.DIGEST_DIR = dir;

const { getAllItemsIndex } = await import('../lib/allItems.js');

after(() => rm(dir, { recursive: true, force: true }));

function report(month, items) {
  return {
    month_of: month,
    categories: [{ id: 'upstream_pd', name: 'Upstream', items }],
  };
}

async function seed(month, items) {
  await writeFile(path.join(dir, `${month}.json`), JSON.stringify(report(month, items)), 'utf8');
}

test('no committed months yields an empty index', async () => {
  assert.deepEqual(await getAllItemsIndex(), []);
});

test('collects items across months and builds the section-page href', async () => {
  await seed('2026-07', [{ id: 'doi:a', title: 'Paper A' }]);
  await seed('2026-08', [{ id: 'doi:b', title: 'Paper B' }]);

  const index = await getAllItemsIndex();
  assert.deepEqual(
    index.map((e) => [e.month, e.item.id]),
    [['2026-08', 'doi:b'], ['2026-07', 'doi:a']],
    'newest month first',
  );
  const b = index.find((e) => e.item.id === 'doi:b');
  assert.equal(b.href, '/digest/2026-08/upstream_pd#doi-b');
});

test('a paper recurring across months keeps only its newest copy', async () => {
  await seed('2026-05', [{ id: 'doi:recur', title: 'Old title' }]);
  await seed('2026-06', [{ id: 'doi:recur', title: 'New title' }]);

  const index = await getAllItemsIndex();
  const matches = index.filter((e) => e.item.id === 'doi:recur');
  assert.equal(matches.length, 1, 'only one copy survives');
  assert.equal(matches[0].month, '2026-06', 'the newest month\'s copy wins');
  assert.equal(matches[0].item.title, 'New title');
});
