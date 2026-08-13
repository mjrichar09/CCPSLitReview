import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithRetry, fetchJson, HttpError } from '../lib/util/http.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: next.statusText ?? '',
      headers: new Map(),
      text: async () => next.body ?? '',
      json: async () => JSON.parse(next.body ?? '{}'),
    };
  };
  return calls;
}

test('a POST carries its method and body through', async () => {
  // Regression: an inner `const body` once shadowed the body parameter and put
  // it in a temporal dead zone, failing every request with
  // "Cannot access 'body' before initialization".
  const calls = stubFetch([{ status: 200, body: '{"ok":true}' }]);

  const data = await fetchJson('https://example.test/x', {
    method: 'POST',
    body: JSON.stringify({ a: 1 }),
    headers: { 'Content-Type': 'application/json' },
  });

  assert.deepEqual(data, { ok: true });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"a":1}');
});

test('a plain GET sends no method or body', async () => {
  const calls = stubFetch([{ status: 200, body: 'hello' }]);
  await fetchWithRetry('https://example.test/x');
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.body, undefined);
});

test('an error body is surfaced on the exception without breaking the request body', async () => {
  stubFetch([{ status: 400, statusText: 'Bad Request', body: 'bad query syntax' }]);
  await assert.rejects(
    () => fetchWithRetry('https://example.test/x', { method: 'POST', body: 'payload' }),
    (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      assert.match(err.body, /bad query syntax/);
      return true;
    },
  );
});

test('4xx is not retried', async () => {
  const calls = stubFetch([{ status: 404, statusText: 'Not Found' }]);
  await assert.rejects(() => fetchWithRetry('https://example.test/x', { retries: 3 }));
  assert.equal(calls.length, 1, 'a permanent failure must not burn the rate-limit budget');
});

test('an opted-in status is retried and can succeed', async () => {
  // The FDA feed answers a burst with 401 rather than 429.
  const calls = stubFetch([{ status: 401, statusText: 'Unauthorized' }, { status: 200, body: 'ok' }]);
  const res = await fetchWithRetry('https://example.test/x', { retries: 2, retryStatuses: [401] });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test('a 401 is still permanent when not opted in', async () => {
  const calls = stubFetch([{ status: 401, statusText: 'Unauthorized' }]);
  await assert.rejects(() => fetchWithRetry('https://example.test/x', { retries: 2 }));
  assert.equal(calls.length, 1);
});
