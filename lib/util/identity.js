import { createHash } from 'node:crypto';

/**
 * Identity rules shared by the adapters (which stamp `external_id`) and the
 * dedupe stage (which matches on it, then falls back to fuzzy title matching).
 * Both must agree, so they live in one place.
 */

/** Lowercase DOI with any resolver prefix stripped. */
export function normalizeDoi(doi) {
  if (!doi) return null;
  const cleaned = String(doi)
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;]+$/, '');
  return cleaned ? cleaned.toLowerCase() : null;
}

/**
 * Title reduced to comparable form: lowercase, accents folded, punctuation and
 * whitespace collapsed. This is what catches the same paper arriving from
 * PubMed and Europe PMC with different identifiers and different markup.
 */
export function normalizeTitle(title) {
  if (!title) return '';
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function titleHash(title) {
  return createHash('sha1').update(normalizeTitle(title)).digest('hex').slice(0, 16);
}

/**
 * Stable id for an item: DOI where available, else PMID, else a normalized
 * title hash. Namespaced so the three kinds can never collide.
 */
export function externalId({ doi, pmid, title }) {
  const d = normalizeDoi(doi);
  if (d) return `doi:${d}`;
  if (pmid) return `pmid:${String(pmid).trim()}`;
  return `title:${titleHash(title)}`;
}
