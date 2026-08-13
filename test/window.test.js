import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveWindow, monthOfWindowEnd, toDay } from '../lib/util/window.js';

const NOW = new Date('2026-09-01T06:00:00Z');

/** Stand in for committed reports without touching the filesystem. */
function withCommitted(months, reports = {}) {
  return {
    getAllMonths: async () => months,
    getReport: async (m) => reports[m] ?? null,
  };
}

test('precedence 1: --since wins over everything', async () => {
  const readers = withCommitted(['2026-08'], { '2026-08': { generated_at: '2026-08-01T00:00:00Z' } });
  const w = await resolveWindow({ since: '2026-07-04', now: NOW, readers });

  assert.equal(toDay(w.from), '2026-07-04');
  assert.equal(w.to.toISOString(), NOW.toISOString());
  assert.match(w.reason, /--since/);
});

test('precedence 2: --month covers that calendar month exactly', async () => {
  const readers = withCommitted([]);
  const w = await resolveWindow({ month: '2026-07', now: NOW, readers });

  assert.equal(toDay(w.from), '2026-07-01');
  assert.equal(toDay(w.to), '2026-07-31');
  assert.equal(w.month, '2026-07');
});

test('precedence 2: --month handles a 28-day February', async () => {
  const readers = withCommitted([]);
  const w = await resolveWindow({ month: '2026-02', now: NOW, readers });
  assert.equal(toDay(w.to), '2026-02-28');
});

test('precedence 3: the newest committed report sets the watermark', async () => {
  const readers = withCommitted(['2026-08', '2026-07'], {
    '2026-08': { generated_at: '2026-08-01T05:00:00Z' },
  });
  const w = await resolveWindow({ now: NOW, readers });

  assert.equal(w.from.toISOString(), '2026-08-01T05:00:00.000Z');
  assert.match(w.reason, /since last committed run/);
});

test('precedence 4: with no prior run, falls back to defaultDays', async () => {
  const readers = withCommitted([]);
  const w = await resolveWindow({ defaultDays: 35, now: NOW, readers });

  assert.equal(toDay(w.from), '2026-07-28', '35 days before 2026-09-01');
  assert.match(w.reason, /no prior run/);
});

test('a committed report with an unparseable generated_at falls through to the default', async () => {
  const readers = withCommitted(['2026-08'], { '2026-08': { generated_at: 'not a date' } });
  const w = await resolveWindow({ defaultDays: 35, now: NOW, readers });
  assert.match(w.reason, /no prior run/);
});

test('the default month label is the month that just closed', () => {
  // A run on the 1st reports on the previous month...
  assert.equal(monthOfWindowEnd(new Date('2026-09-01T06:00:00Z')), '2026-08');
  // ...but a manual mid-month run reports on the current month.
  assert.equal(monthOfWindowEnd(new Date('2026-09-14T06:00:00Z')), '2026-09');
  // Year boundary.
  assert.equal(monthOfWindowEnd(new Date('2027-01-01T00:30:00Z')), '2026-12');
});

test('malformed flags are rejected with a pointer to the flag', async () => {
  const readers = withCommitted([]);
  await assert.rejects(() => resolveWindow({ since: '07-04-2026', now: NOW, readers }), /--since must be YYYY-MM-DD/);
  await assert.rejects(() => resolveWindow({ month: '2026-13', now: NOW, readers }), /impossible month/);
  await assert.rejects(() => resolveWindow({ month: 'August', now: NOW, readers }), /--month must be YYYY-MM/);
});
