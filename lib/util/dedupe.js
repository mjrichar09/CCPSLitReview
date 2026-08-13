import { normalizeTitle } from './identity.js';

/**
 * Collapse duplicate records.
 *
 * Two passes, in the order the brief specifies:
 *   1. exact `external_id` — the same paper from the same source, or from two
 *      sources that both knew its DOI.
 *   2. title similarity — the case that motivates the whole stage: PubMed
 *      returns a record keyed on PMID and Europe PMC returns the same paper
 *      keyed on DOI, so their ids never collide.
 *
 * Merging is union-of-information, not first-wins: a PubMed record with an
 * abstract and a Europe PMC record with the DOI have to combine into one record
 * carrying both, or the scoring stage sees a thinner item than we actually hold.
 */
export function dedupe(records, { titleThreshold = 0.9 } = {}) {
  const stats = { input: records.length, byId: 0, byTitle: 0 };

  // --- pass 1: exact external_id -------------------------------------------
  const byId = new Map();
  for (const record of records) {
    const existing = byId.get(record.external_id);
    if (existing) {
      merge(existing, record);
      stats.byId += 1;
    } else {
      byId.set(record.external_id, { ...record, categories: [...record.categories], sources: [record.source] });
    }
  }

  // --- pass 2: title similarity --------------------------------------------
  const items = [...byId.values()];
  const exact = new Map(); // normalized title -> item
  const survivors = [];

  for (const item of items) {
    const key = normalizeTitle(item.title);
    if (!key) {
      survivors.push(item);
      continue;
    }
    const hit = exact.get(key);
    if (hit) {
      merge(hit, item);
      stats.byTitle += 1;
      continue;
    }

    // Near-match against survivors of comparable length. Titles differing only
    // by a trailing period, a subtitle, or markup that one source stripped.
    const near = findNear(survivors, item, key, titleThreshold);
    if (near) {
      merge(near, item);
      stats.byTitle += 1;
      continue;
    }

    exact.set(key, item);
    survivors.push(item);
  }

  stats.output = survivors.length;
  stats.removed = stats.input - stats.output;
  return { items: survivors, stats };
}

/**
 * Jaccard similarity over title tokens, gated on comparable length so the scan
 * stays cheap and a short title cannot swallow a long one.
 */
function findNear(survivors, item, key, threshold) {
  const tokens = new Set(key.split(' '));
  if (tokens.size < 4) return null; // too short to match safely

  for (const candidate of survivors) {
    const otherKey = candidate._titleKey ?? normalizeTitle(candidate.title);
    candidate._titleKey = otherKey;
    if (!otherKey) continue;

    const otherTokens = otherKey.split(' ');
    const ratio = otherTokens.length / tokens.size;
    if (ratio < 0.6 || ratio > 1.6) continue;

    let shared = 0;
    for (const t of otherTokens) if (tokens.has(t)) shared += 1;
    const union = tokens.size + otherTokens.length - shared;
    if (union > 0 && shared / union >= threshold) return candidate;
  }
  return null;
}

/** Fold `extra` into `target`, keeping whichever side actually has the field. */
function merge(target, extra) {
  for (const c of extra.categories) {
    if (!target.categories.includes(c)) target.categories.push(c);
  }
  if (!target.sources) target.sources = [target.source];
  if (!target.sources.includes(extra.source)) target.sources.push(extra.source);

  // Prefer the longer abstract: PubMed's structured abstracts carry section
  // labels that Europe PMC's flattened copy drops.
  if ((extra.abstract?.length ?? 0) > (target.abstract?.length ?? 0)) target.abstract = extra.abstract;
  if (!target.doi && extra.doi) target.doi = extra.doi;
  if (!target.pmid && extra.pmid) target.pmid = extra.pmid;
  if (!target.venue && extra.venue) target.venue = extra.venue;
  if (!target.published && extra.published) target.published = extra.published;
  if (!target.url && extra.url) target.url = extra.url;
  if ((extra.authors?.length ?? 0) > (target.authors?.length ?? 0)) target.authors = extra.authors;
  // A record is a preprint only if every copy of it is.
  target.is_preprint = Boolean(target.is_preprint && extra.is_preprint);
}

/** Strip the internal memo field before anything is written to disk. */
export function clean(items) {
  return items.map(({ _titleKey, ...rest }) => rest);
}
