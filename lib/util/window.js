import * as defaultReaders from '../digest.js';

/**
 * Resolve the date window a run covers.
 *
 * Precedence (highest first), per PLAN.md §5.3:
 *   1. --since YYYY-MM-DD    explicit override
 *   2. --month YYYY-MM       that calendar month, start to end
 *   3. newest committed report's generated_at
 *   4. now - defaultDays (35)
 *
 * Deriving the watermark from *committed* reports is what makes rule 3 mean
 * "since the last successful run": a dry run writes nothing, and a failed run
 * commits nothing, so neither can advance it.
 *
 * `readers` is injectable so this stays a pure function under test — ESM module
 * namespaces are read-only, so there is nothing to stub otherwise.
 */
export async function resolveWindow({
  since,
  month,
  defaultDays = 35,
  now = new Date(),
  readers = defaultReaders,
} = {}) {
  const to = new Date(now);

  if (since) {
    const from = parseDay(since, '--since');
    return { from, to, month: month ?? monthOfWindowEnd(to), reason: `--since ${since}` };
  }

  if (month) {
    assertMonth(month);
    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - 1);
    return { from, to: end, month, reason: `--month ${month}` };
  }

  const months = await readers.getAllMonths();
  if (months.length > 0) {
    const latest = await readers.getReport(months[0]);
    if (latest?.generated_at) {
      const from = new Date(latest.generated_at);
      if (!Number.isNaN(from.getTime())) {
        return {
          from,
          to,
          month: monthOfWindowEnd(to),
          reason: `since last committed run (${months[0]}, generated_at ${latest.generated_at})`,
        };
      }
    }
  }

  const from = new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from, to, month: monthOfWindowEnd(to), reason: `no prior run, defaulting to ${defaultDays} days` };
}

/**
 * The month a run labels itself with when not told explicitly: the month
 * containing the day before the window ends. A run on the 1st of September
 * therefore reports on 2026-08, which is the month that just closed; a manual
 * mid-month run reports on the current month.
 */
export function monthOfWindowEnd(to) {
  const d = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** YYYY-MM-DD for source APIs that take date strings. */
export function toDay(date) {
  return date.toISOString().slice(0, 10);
}

function parseDay(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be YYYY-MM-DD, got ${value}`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`${flag} is not a real date: ${value}`);
  return d;
}

function assertMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`--month must be YYYY-MM, got ${value}`);
  }
  const m = Number(value.slice(5));
  if (m < 1 || m > 12) throw new Error(`--month has an impossible month: ${value}`);
}
