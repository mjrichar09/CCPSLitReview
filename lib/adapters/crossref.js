import { fetchJson } from '../util/http.js';
import { cleanText } from './record.js';

const WORKS = 'https://api.crossref.org/works';

export const id = 'crossref';

/**
 * Enrichment only — never a primary search source, per the brief.
 *
 * Fills in journal name and normalises publication date for records that have a
 * DOI but arrived thin (common for preprints and for Europe PMC entries that
 * predate journal indexing). Every failure is per-record and non-fatal: an
 * unenriched record is still a perfectly good record.
 */
export async function enrich(records, { settings, limiters }) {
  if (settings?.enabled === false) return { enriched: 0, attempted: 0, failed: 0 };

  const limiter = limiters.for('crossref', {
    rps: settings?.rps ?? 5,
    concurrency: settings?.concurrency ?? 4,
  });

  // Only records that would actually gain something, and only one lookup per
  // DOI even when the same paper turned up under several categories.
  const needed = new Map();
  for (const r of records) {
    if (!r.doi) continue;
    if (r.venue && r.published) continue;
    if (!needed.has(r.doi)) needed.set(r.doi, []);
    needed.get(r.doi).push(r);
  }
  if (needed.size === 0) return { enriched: 0, attempted: 0, failed: 0 };

  // `attempted` counts DOI lookups; `enriched` counts records patched. The two
  // differ because one DOI can back several records (the same paper found under
  // more than one category), so enriched > attempted is normal.
  let enriched = 0;
  let failed = 0;
  const mailto = settings?.mailto;

  await Promise.all(
    [...needed.entries()].map(async ([doi, targets]) => {
      try {
        const url = `${WORKS}/${encodeURIComponent(doi)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`;
        const data = await limiter.schedule(() => fetchJson(url));
        const patch = toPatch(data?.message);
        if (!patch) return;
        for (const r of targets) {
          if (!r.venue && patch.venue) r.venue = patch.venue;
          if (!r.published && patch.published) r.published = patch.published;
          enriched += 1;
        }
      } catch {
        failed += 1; // enrichment is best-effort by design
      }
    }),
  );

  return { enriched, attempted: needed.size, failed };
}

/** Exported for tests: extract the fields we care about from a Crossref work. */
export function toPatch(message) {
  if (!message) return null;
  const venue = cleanText(
    (Array.isArray(message['container-title']) ? message['container-title'][0] : message['container-title']) ||
      message.publisher ||
      '',
  );
  const parts =
    message.issued?.['date-parts']?.[0] ||
    message['published-print']?.['date-parts']?.[0] ||
    message['published-online']?.['date-parts']?.[0];

  let published = null;
  if (Array.isArray(parts) && parts[0]) {
    const [y, m = 1, d = 1] = parts;
    published = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  if (!venue && !published) return null;
  return { venue: venue || null, published };
}
