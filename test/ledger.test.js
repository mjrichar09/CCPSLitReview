import { test } from 'node:test';
import assert from 'node:assert/strict';

import { record, classify, shardEntries } from '../lib/util/ledger.js';

const item = (over = {}) => ({
  external_id: 'doi:10.1/x',
  title: 'A paper',
  categories: ['upstream_pd'],
  url: 'https://doi.org/10.1/x',
  ...over,
});

test('an unseen item is new', () => {
  assert.deepEqual(classify(new Map(), item(), '2026-08'), { status: 'new' });
});

test('an item already reported in an earlier month, in the same category, is dropped', () => {
  const entries = new Map();
  record(entries, item(), '2026-07');
  assert.equal(classify(entries, item(), '2026-08').status, 'seen');
});

test('an item newly matching a different category is recurring, not a drop', () => {
  // This is what keeps a paper first seen under upstream_pd from being lost
  // when it later becomes relevant to product_quality.
  const entries = new Map();
  record(entries, item({ categories: ['upstream_pd'] }), '2026-07');

  const verdict = classify(entries, item({ categories: ['upstream_pd', 'product_quality'] }), '2026-08');
  assert.equal(verdict.status, 'recurring');
  assert.deepEqual(verdict.newCategories, ['product_quality'], 'only the category it has not been reported under');
});

test('re-running the same month is not treated as a duplicate', () => {
  const entries = new Map();
  record(entries, item(), '2026-08');
  assert.equal(classify(entries, item(), '2026-08').status, 'same_month');
});

test('recording an item twice merges categories rather than duplicating it', () => {
  const entries = new Map();
  record(entries, item({ categories: ['upstream_pd'] }), '2026-07');
  record(entries, item({ categories: ['intensification'] }), '2026-08');

  assert.equal(entries.size, 1);
  const entry = entries.get('doi:10.1/x');
  assert.deepEqual(entry.categories.sort(), ['intensification', 'upstream_pd']);
  assert.equal(entry.first_seen_month, '2026-07', 'first_seen_month is not overwritten');
});

test('below the threshold everything stays in one file', () => {
  const entries = new Map([['a', { first_seen_month: '2026-08' }]]);
  const plan = shardEntries(entries, 5000);
  assert.equal(plan.sharded, false);
  assert.deepEqual(Object.keys(plan.files), ['articles.json']);
});

test('past the threshold entries split by first-seen year', () => {
  const entries = new Map([
    ['a', { first_seen_month: '2026-08' }],
    ['b', { first_seen_month: '2026-11' }],
    ['c', { first_seen_month: '2027-01' }],
  ]);
  const plan = shardEntries(entries, 2);

  assert.equal(plan.sharded, true);
  assert.deepEqual(Object.keys(plan.files).sort(), ['articles-2026.json', 'articles-2027.json', 'articles.json']);
  assert.deepEqual(Object.keys(plan.files['articles-2026.json']).sort(), ['a', 'b']);
  assert.deepEqual(Object.keys(plan.files['articles-2027.json']), ['c']);
  assert.deepEqual(
    plan.files['articles.json'], {},
    'the base file is emptied, never left holding ids that also live in a shard',
  );
});

test('an entry with no month lands in a named shard rather than being lost', () => {
  const plan = shardEntries(new Map([['a', {}], ['b', {}], ['c', {}]]), 2);
  assert.ok(plan.files['articles-unknown.json'], 'no entry is silently dropped');
});
