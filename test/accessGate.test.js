import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { admits } from '../lib/accessGate.js';
import { hasGuestCookie, isMemberOnlyPath, GUEST_COOKIE, GUEST_INIT_SCRIPT } from '../lib/guest.js';

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

test('admits a guest to the digest pages, even with Supabase unconfigured', () => {
  for (const configured of [true, false]) {
    assert.equal(admits({ configured, user: null, approved: false, guest: true, pathname: '/digest' }), true);
    assert.equal(admits({ configured, user: null, approved: false, guest: true, pathname: '/digest/2026-10/upstream_pd' }), true);
    assert.equal(admits({ configured, user: null, approved: false, guest: true, pathname: '/search-index.json' }), true);
  }
});

test('keeps a guest off the member-only pages', () => {
  for (const pathname of ['/digest/favorites', '/digest/discussion', '/digest/imports', '/digest/imports/x', '/digest/admin/topics']) {
    assert.equal(admits({ configured: true, user: null, approved: false, guest: true, pathname }), false, pathname);
  }
});

test('a signed-in, unapproved reader can still choose guest view', () => {
  assert.equal(admits({ configured: true, user, approved: false, guest: true, pathname: '/digest' }), true);
  assert.equal(admits({ configured: true, user, approved: false, guest: true, pathname: '/digest/discussion' }), false);
});

test('an approved reader reaches the member-only pages, guest cookie or not', () => {
  assert.equal(admits({ configured: true, user, approved: true, guest: true, pathname: '/digest/discussion' }), true);
});

test('member-only matching is by path segment, not prefix', () => {
  assert.equal(isMemberOnlyPath('/digest/favorites'), true);
  assert.equal(isMemberOnlyPath('/digest/favoritesx'), false);
  assert.equal(isMemberOnlyPath('/digest/2026-10'), false);
});

test('guest cookie parsing', () => {
  assert.equal(hasGuestCookie(`a=1; ${GUEST_COOKIE}=1; b=2`), true);
  assert.equal(hasGuestCookie(`${GUEST_COOKIE}=0`), false);
  assert.equal(hasGuestCookie(`x${GUEST_COOKIE}=1`), false);
  assert.equal(hasGuestCookie(''), false);
  assert.equal(hasGuestCookie(undefined), false);
  // The pre-paint script matches the same cookie the gate admits on.
  assert.ok(GUEST_INIT_SCRIPT.includes(`'${GUEST_COOKIE}=1'`));
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
