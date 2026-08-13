import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { INDEX_DIR } from '../digestDir.js';

const BASE = 'articles.json';
const SHARD_RE = /^articles-(\d{4})\.json$/;

/**
 * The dedupe ledger: every item ever reported, so "new since last month" means
 * something.
 *
 * Deliberately minimal — it answers "have I seen this?", not "what did I say
 * about it". The month files hold the content.
 *
 *   external_id -> { title, first_seen_month, categories, url }
 */

/** Read the base file plus any year shards into one map. */
export async function loadLedger() {
  const entries = new Map();
  let files;
  try {
    files = await readdir(INDEX_DIR);
  } catch {
    return entries; // no ledger yet — first run
  }

  for (const file of files.sort()) {
    if (file !== BASE && !SHARD_RE.test(file)) continue;
    try {
      const raw = await readFile(path.join(INDEX_DIR, file), 'utf8');
      for (const [id, entry] of Object.entries(JSON.parse(raw))) {
        entries.set(id, entry);
      }
    } catch (err) {
      // A corrupt ledger is not a soft failure: silently treating every item as
      // unseen would re-report a whole month of already-digested work.
      throw new Error(`ledger: cannot read ${file}: ${err.message}`);
    }
  }
  return entries;
}

/**
 * Add this month's kept items and write the ledger back.
 *
 * Below `shardAfter` everything lives in articles.json. Past it the map is
 * split into articles-YYYY.json by first-seen year, so no single file grows
 * without bound.
 */
export async function saveLedger(entries, { shardAfter = 5000 } = {}) {
  await mkdir(INDEX_DIR, { recursive: true });

  const plan = shardEntries(entries, shardAfter);
  for (const [name, group] of Object.entries(plan.files)) {
    await writeJson(path.join(INDEX_DIR, name), group);
  }
  return { sharded: plan.sharded, files: Object.keys(plan.files), total: entries.size };
}

/**
 * Exported for tests: decide which file each entry belongs in.
 *
 * Below the threshold everything is one file. Above it, entries split by
 * first-seen year and the base file is written *empty* rather than deleted, so
 * a half-finished migration can never leave the same id in both places.
 */
export function shardEntries(entries, shardAfter = 5000) {
  if (entries.size <= shardAfter) {
    return { sharded: false, files: { [BASE]: Object.fromEntries(entries) } };
  }

  const files = { [BASE]: {} };
  for (const [id, entry] of entries) {
    const year = String(entry.first_seen_month ?? '').slice(0, 4) || 'unknown';
    const name = `articles-${year}.json`;
    if (!files[name]) files[name] = {};
    files[name][id] = entry;
  }
  return { sharded: true, files };
}

/** Record an item against the current month, merging categories if seen before. */
export function record(entries, item, month) {
  const existing = entries.get(item.external_id);
  if (existing) {
    for (const c of item.categories) {
      if (!existing.categories.includes(c)) existing.categories.push(c);
    }
    return existing;
  }
  const entry = {
    title: item.title,
    first_seen_month: month,
    categories: [...item.categories],
    url: item.url ?? null,
  };
  entries.set(item.external_id, entry);
  return entry;
}

/**
 * Has this item already been reported, and in which categories?
 *
 * `seen` alone is not enough to drop an item: a paper first reported under
 * upstream_pd that now also matches product_quality is new *to that category*
 * and should still run, flagged as recurring.
 */
export function classify(entries, item, month) {
  const existing = entries.get(item.external_id);
  if (!existing) return { status: 'new' };
  if (existing.first_seen_month === month) return { status: 'same_month', entry: existing };

  const fresh = item.categories.filter((c) => !existing.categories.includes(c));
  if (fresh.length === 0) return { status: 'seen', entry: existing };
  return { status: 'recurring', entry: existing, newCategories: fresh };
}

function writeJson(file, value) {
  return writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
