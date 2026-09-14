import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { admits } from '../lib/accessGate.js';

const user = { id: 'u1' };

test('blocks when Supabase is not configured, regardless of user/approved', () => {
  assert.equal(admits({ configured: false, user, approved: true }), false);
});

test('blocks a signed-out visitor', () => {
  assert.equal(admits({ configured: true, user: null, approved: false }), false);
});

test('blocks a signed-in but unapproved reader', () => {
  assert.equal(admits({ configured: true, user, approved: false }), false);
});

test('admits a signed-in, approved reader', () => {
  assert.equal(admits({ configured: true, user, approved: true }), true);
});

// proxy.js can't be imported here (it pulls in next/server, unresolvable
// outside Next's runtime) and its `matcher` has to be a static literal for
// Next to analyze, so the list is guarded against the source text.
test('the gate covers the digest pages and the search index', () => {
  const src = readFileSync(new URL('../proxy.js', import.meta.url), 'utf8');
  const matcher = src.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? '';
  assert.match(matcher, /'\/digest\/:path\*'/);
  // search-index.json is written to public/ and served from the site root,
  // outside /digest/**. Dropping it exposes every paper's title, authors,
  // venue and link to anyone, unauthenticated.
  assert.match(matcher, /'\/search-index\.json'/);
});
