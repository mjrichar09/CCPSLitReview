import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeOrder } from '../app/digest/categoryOrder.js';

const categories = [
  { id: 'upstream_pd', name: 'Upstream' },
  { id: 'modeling_ml', name: 'Modeling' },
  { id: 'regulatory', name: 'Regulatory' },
];

test('no saved order leaves the report order untouched', () => {
  assert.deepEqual(mergeOrder(categories, null), categories);
  assert.deepEqual(mergeOrder(categories, []), categories);
});

test('reorders by the saved ids', () => {
  const result = mergeOrder(categories, ['regulatory', 'upstream_pd', 'modeling_ml']);
  assert.deepEqual(result.map((c) => c.id), ['regulatory', 'upstream_pd', 'modeling_ml']);
});

test('a category added to the config since the order was saved is appended at the end', () => {
  const result = mergeOrder(categories, ['modeling_ml', 'upstream_pd']);
  assert.deepEqual(result.map((c) => c.id), ['modeling_ml', 'upstream_pd', 'regulatory']);
});

test('a stale saved id with no matching category is dropped', () => {
  const result = mergeOrder(categories, ['retired_category', 'modeling_ml', 'upstream_pd', 'regulatory']);
  assert.deepEqual(result.map((c) => c.id), ['modeling_ml', 'upstream_pd', 'regulatory']);
});

test('a duplicate saved id is not repeated in the output', () => {
  const result = mergeOrder(categories, ['upstream_pd', 'upstream_pd', 'modeling_ml']);
  assert.deepEqual(result.map((c) => c.id), ['upstream_pd', 'modeling_ml', 'regulatory']);
});
