import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, trimToCaps } from '../lib/pipeline/summarize.js';

const config = {
  models: { summarize: { provider: 'stub', model: 'stub-1', rates: { input: 5, output: 25 } } },
  summarize: { batchSize: 2 },
  categories: [
    { id: 'upstream_pd', name: 'Upstream', max_items: 2, scope: 'x'.repeat(60) },
    { id: 'modeling_ml', name: 'Modeling', max_items: 3, scope: 'y'.repeat(60) },
  ],
};

const item = (id, over = {}) => ({
  external_id: `doi:${id}`,
  title: `Paper ${id}`,
  abstract: 'An abstract.',
  relevance: 4,
  scored_for: 'upstream_pd',
  categories: ['upstream_pd'],
  published: '2026-08-01',
  ...over,
});

/** A generator that answers every item with a positional summary. */
function stubGenerator() {
  const calls = [];
  return {
    calls,
    async generate({ user }) {
      calls.push(user);
      const n = (user.match(/^\[\d+\]/gm) ?? []).length;
      return {
        summaries: Array.from({ length: n }, (_, i) => ({
          index: i,
          summary: `summary ${i}`,
          why_it_matters: `matters ${i}`,
          thin_abstract: false,
        })),
      };
    },
  };
}

test('trims each category to its own max_items, highest relevance first', () => {
  const items = [
    item('a', { relevance: 3 }),
    item('b', { relevance: 5 }),
    item('c', { relevance: 4 }),
  ];
  const kept = trimToCaps(items, config);
  assert.deepEqual(kept.map((i) => i.title), ['Paper b', 'Paper c'], 'cap 2 keeps the top two');
});

test('breaks a relevance tie by recency', () => {
  const items = [
    item('old', { relevance: 4, published: '2026-07-01' }),
    item('new', { relevance: 4, published: '2026-08-10' }),
    item('mid', { relevance: 4, published: '2026-07-20' }),
  ];
  assert.deepEqual(trimToCaps(items, config).map((i) => i.title), ['Paper new', 'Paper mid']);
});

test('a paper matching two categories is summarised once, not twice', async () => {
  // 180 category-level keeps were 128 distinct papers. Paying twice is the
  // smaller problem; one paper carrying two different summaries in two sections
  // would read as a bug.
  const generator = stubGenerator();
  const items = [
    item('shared', { scored_for: 'upstream_pd' }),
    item('shared', { scored_for: 'modeling_ml' }),
  ];
  const result = await summarize({ items, config, generator });

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].scored_in.sort(), ['modeling_ml', 'upstream_pd']);
  assert.equal(result.stats.distinct_papers, 1);
});

test('summarises after the cap, not before — overflow is never paid for', async () => {
  const generator = stubGenerator();
  const items = [item('a'), item('b'), item('c'), item('d')]; // cap is 2
  const result = await summarize({ items, config, generator });

  assert.equal(result.stats.after_cap, 2);
  assert.equal(result.stats.distinct_papers, 2);
  assert.equal(generator.calls.length, 1, 'two items at batchSize 2 is a single call');
});

test('a missing summary halts rather than rendering an empty card', async () => {
  const generator = {
    async generate() {
      return { summaries: [{ index: 0, summary: 's', why_it_matters: 'w', thin_abstract: false }] };
    },
  };
  await assert.rejects(
    () => summarize({ items: [item('a'), item('b')], config, generator }),
    /no summary for 1 of 2 items/,
  );
});

test('carries the thin-abstract flag through instead of hiding it', async () => {
  const generator = {
    async generate() {
      return { summaries: [{ index: 0, summary: 's', why_it_matters: 'w', thin_abstract: true }] };
    },
  };
  const result = await summarize({ items: [item('a')], config, generator });
  assert.equal(result.items[0].thin_abstract, true);
  assert.equal(result.stats.thin_abstracts, 1);
});
