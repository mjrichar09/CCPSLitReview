import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DIGEST_DIR } from './digestDir.js';

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
