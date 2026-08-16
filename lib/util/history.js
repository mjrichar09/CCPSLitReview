import { getAllMonths, getReport } from '../digest.js';

/**
 * Cross-month memory for the synthesize stage.
 *
 * The month files are committed and append-only, so "what did I say about this
 * category in July" is a read, not a new store. Nothing is written here and no
 * schema changes: this is a view over `lib/digest.js`, deliberately, so that a
 * month's own record stays the single source of what it said.
 *
 * Reads are best-effort by design. `getReport` returns null for a missing or
 * unreadable month and that month is simply skipped — history is context, and
 * losing it must never halt a run that has already paid for scoring and
 * summarising. The first-ever month yields empty structures, which the prompts
 * treat as "no previous months" rather than as an empty heading.
 */

const EMPTY = { months: [], byCategory: new Map(), overviews: [] };

/**
 * The `back` most recent months strictly *earlier* than `month`.
 *
 * Strictly earlier matters: re-running a month with `--force` must not feed that
 * month its own narratives back to itself.
 */
export async function loadHistory(month, { back = 3 } = {}) {
  if (!(back > 0)) return EMPTY;

  // ISO months sort lexically and getAllMonths() is already newest-first.
  const wanted = (await getAllMonths()).filter((m) => m.localeCompare(month) < 0).slice(0, back);

  const months = [];
  const byCategory = new Map();
  const overviews = [];

  for (const past of wanted) {
    const report = await getReport(past);
    if (!report) continue;
    months.push(past);

    const titles = new Map();
    for (const category of report.categories ?? []) {
      for (const item of category.items ?? []) titles.set(item.id, item.title);
      if (!category.synthesis) continue;
      if (!byCategory.has(category.id)) byCategory.set(category.id, []);
      byCategory.get(category.id).push({ month: past, synthesis: category.synthesis });
    }

    overviews.push({
      month: past,
      summary: report.summary ?? null,
      top: (report.top_items ?? []).map((t) => ({ title: titles.get(t.id) ?? t.id, reason: t.reason })),
    });
  }

  return { months, byCategory, overviews };
}
