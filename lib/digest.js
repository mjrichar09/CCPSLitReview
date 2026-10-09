import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DIGEST_DIR, stagingDir } from './digestDir.js';

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * All month strings (YYYY-MM), sorted newest-first. [] if no reports yet.
 * ISO months sort lexically, so no date parsing is needed.
 */
export async function getAllMonths() {
  let files;
  try {
    files = await readdir(DIGEST_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter((m) => MONTH_RE.test(m))
    .sort((a, b) => b.localeCompare(a));
}

/** One report by month, or null if missing/unreadable. */
export async function getReport(month) {
  if (!MONTH_RE.test(month ?? '')) return null;
  try {
    const raw = await readFile(path.join(DIGEST_DIR, `${month}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The newest report, or null if none exist. */
export async function getLatest() {
  const [newest] = await getAllMonths();
  return newest ? getReport(newest) : null;
}

/**
 * Per-category scoring tallies for a month — how many papers were judged and
 * how many passed the relevance gate — from the committed scored.json, or
 * null when that file is absent (it is committed for every month, but the
 * viewer must not break if one is ever missing). Reads only `stats`; the
 * file's item lists are large and the viewer has no use for them.
 */
export async function getScoringStats(month) {
  if (!MONTH_RE.test(month ?? '')) return null;
  try {
    const raw = await readFile(path.join(stagingDir(month), 'scored.json'), 'utf8');
    return JSON.parse(raw).stats?.by_category ?? null;
  } catch {
    return null;
  }
}

/**
 * One topic across every committed month, oldest first, for the
 * papers-per-month chart: `{ month, shown, relevant }`. `shown` is what the
 * month's page lists (capped by the topic's max_items); `relevant` is how
 * many passed scoring before the cap, which is the better measure of how
 * active the topic was. A month the topic did not exist in is left out,
 * not counted as zero.
 */
export async function getCategoryTrend(categoryId) {
  const months = (await getAllMonths()).slice().reverse();
  const out = [];
  for (const month of months) {
    const [report, stats] = await Promise.all([getReport(month), getScoringStats(month)]);
    const category = report?.categories?.find((c) => c.id === categoryId);
    if (!category) continue;
    const shown = category.items.length;
    out.push({ month, shown, relevant: stats?.[categoryId]?.kept ?? shown });
  }
  return out;
}
