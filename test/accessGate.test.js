import { test } from 'node:test';
import assert from 'node:assert/strict';

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
