import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Must be set before lib/digestDir.js is imported — it resolves at module load.
const dir = await mkdtemp(path.join(tmpdir(), 'digest-feedback-'));
process.env.DIGEST_DIR = dir;

const { loadFeedback, feedbackBlock } = await import('../lib/feedback.js');

after(() => rm(dir, { recursive: true, force: true }));

function report(month) {
  return {
    month_of: month,
    categories: [
      {
        id: 'upstream_pd',
        name: 'Upstream',
        items: [
          { id: 'doi:a', title: 'Paper A' },
          { id: 'doi:b', title: 'Paper B' },
        ],
      },
    ],
  };
}

async function seed(month) {
  await writeFile(path.join(dir, `${month}.json`), JSON.stringify(report(month)), 'utf8');
}

await seed('2026-07');

const configuredEnv = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon-key' };

test('disabled when the Supabase env vars are absent', async () => {
  const feedback = await loadFeedback('2026-08', { env: {}, back: 3 });
  assert.equal(feedback.enabled, false);
  assert.equal(feedback.byCategory.size, 0);
});

test('disabled with no target month to anchor the lookback', async () => {
  const feedback = await loadFeedback(undefined, { env: configuredEnv, back: 3 });
  assert.equal(feedback.enabled, false);
});

test('a vote query failure propagates and halts the run rather than degrading silently', async () => {
  const fetchVotes = async () => {
    throw new Error('network down');
  };
  await assert.rejects(
    () => loadFeedback('2026-08', { env: configuredEnv, back: 3, fetchVotes }),
    /network down/,
  );
});

test('resolves votes to their title and category, filters noise, and drops what cannot be resolved', async () => {
  const fetchVotes = async () => [
    { item_id: 'doi:a', up: 5, down: 0 }, // net 5 — kept
    { item_id: 'doi:b', up: 1, down: 0 }, // net 1 — below the noise floor
    { item_id: 'doi:unknown', up: 4, down: 0 }, // no committed month has this id
  ];
  const feedback = await loadFeedback('2026-08', { env: configuredEnv, back: 3, fetchVotes });
  assert.equal(feedback.enabled, true);
  assert.deepEqual(feedback.byCategory.get('upstream_pd'), [{ title: 'Paper A', up: 5, down: 0, net: 5 }]);
});

test('caps entries per category at the most contentious, most-positive-first', async () => {
  await writeFile(
    path.join(dir, '2026-06.json'),
    JSON.stringify({
      month_of: '2026-06',
      categories: [
        {
          id: 'upstream_pd',
          name: 'Upstream',
          items: Array.from({ length: 10 }, (_, i) => ({ id: `doi:x${i}`, title: `Paper X${i}` })),
        },
      ],
    }),
    'utf8',
  );
  const fetchVotes = async () =>
    Array.from({ length: 10 }, (_, i) => ({ item_id: `doi:x${i}`, up: i % 2 === 0 ? i + 2 : 0, down: i % 2 === 0 ? 0 : i + 2 }));

  const feedback = await loadFeedback('2026-08', { env: configuredEnv, back: 3, fetchVotes });
  const entries = feedback.byCategory.get('upstream_pd');
  assert.equal(entries.length, 8, 'capped at the per-category maximum');
  assert.ok(entries.every((e, i) => i === 0 || entries[i - 1].net >= e.net), 'sorted net descending for output');
});

test('feedbackBlock renders entries with a guard against over-fitting, and is empty with none', () => {
  assert.equal(feedbackBlock([]), '');
  const block = feedbackBlock([{ title: 'Paper A', up: 5, down: 0, net: 5 }]);
  assert.match(block, /READER FEEDBACK/);
  assert.match(block, /Paper A/);
  assert.match(block, /not a survey/);
});
