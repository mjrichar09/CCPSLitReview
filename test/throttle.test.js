import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLimiter, createLimiterRegistry } from '../lib/util/throttle.js';

test('sustains the configured rate across a burst', async () => {
  const limiter = createLimiter({ rps: 10, concurrency: 4, burst: 1 });
  const started = Date.now();
  await Promise.all(Array.from({ length: 6 }, () => limiter.schedule(async () => {})));
  const elapsed = Date.now() - started;

  // 6 jobs at 10/s with a burst of 1 means ~5 refill intervals of 100ms.
  assert.ok(elapsed >= 400, `expected pacing of at least 400ms, got ${elapsed}ms`);
});

test('never exceeds the concurrency cap', async () => {
  const limiter = createLimiter({ rps: 1000, concurrency: 3 });
  let active = 0;
  let peak = 0;

  await Promise.all(
    Array.from({ length: 20 }, () =>
      limiter.schedule(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      }),
    ),
  );

  assert.ok(peak <= 3, `concurrency cap breached: peak ${peak}`);
});

test('every queued job resolves — a token-starved queue must not be abandoned', async () => {
  // This is the regression test for the bug that truncated the first full run:
  // the limiter's refill timer was unref'd, so when every job was waiting on a
  // token and nothing else held the event loop open, Node exited with code 0
  // and partial results. Any change that lets a queued job go unresolved shows
  // up here as a timeout rather than as a silently short digest.
  const limiter = createLimiter({ rps: 20, concurrency: 2, burst: 1 });
  const done = [];

  await Promise.all(
    Array.from({ length: 12 }, (_, i) => limiter.schedule(async () => { done.push(i); })),
  );

  assert.equal(done.length, 12);
  assert.deepEqual([...done].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i));
});

test('a failing job rejects without stalling the queue behind it', async () => {
  const limiter = createLimiter({ rps: 100, concurrency: 2 });
  const results = await Promise.allSettled([
    limiter.schedule(async () => { throw new Error('boom'); }),
    limiter.schedule(async () => 'ok'),
    limiter.schedule(async () => 'ok too'),
  ]);

  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason.message, 'boom');
  assert.equal(results[1].value, 'ok');
  assert.equal(results[2].value, 'ok too');
});

test('the registry gives one shared limiter per key', async () => {
  const registry = createLimiterRegistry();
  const a = registry.for('pubmed', { rps: 3, concurrency: 1 });
  const b = registry.for('pubmed', { rps: 10, concurrency: 4 });
  const c = registry.for('europepmc', { rps: 5, concurrency: 2 });

  assert.equal(a, b, 'two categories hitting one host must share a bucket, not get one each');
  assert.notEqual(a, c);
});

test('rejects a nonsensical rate rather than silently running unthrottled', () => {
  assert.throws(() => createLimiter({ rps: 0 }), /rps must be > 0/);
  assert.throws(() => createLimiter({}), /rps must be > 0/);
});
