import { externalId, normalizeDoi } from '../util/identity.js';

/**
 * The normalized record every adapter returns. Keeping the shape in one factory
 * means the normalize stage has nothing source-specific left to reconcile.
 *
 * Per the brief we store title, abstract, metadata and link only — never
 * article bodies.
 */
export function makeRecord({
  source,
  categoryId,
  title,
  abstract = null,
  authors = [],
  venue = null,
  published = null,
  url,
  doi = null,
  pmid = null,
  isPreprint = false,
  extra = {},
}) {
  const cleanTitle = cleanText(title);
  if (!cleanTitle) return null; // untitled items are unusable downstream
  const cleanDoi = normalizeDoi(doi);

  return {
    source,
    categories: [categoryId],
    external_id: externalId({ doi: cleanDoi, pmid, title: cleanTitle }),
    doi: cleanDoi,
    pmid: pmid ? String(pmid) : null,
    title: cleanTitle,
    abstract: cleanText(abstract) || null,
    authors: authors.filter(Boolean).map((a) => cleanText(a)).filter(Boolean),
    venue: cleanText(venue) || null,
    published: published || null,
    url: url || (cleanDoi ? `https://doi.org/${cleanDoi}` : null),
    is_preprint: Boolean(isPreprint),
    ...extra,
  };
}

/** Strip markup and collapse whitespace. Abstracts arrive with inline tags. */
export function cleanText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * fast-xml-parser hands back a string, a number, an object with a text node, or
 * an array of those depending on whether the element had attributes or repeated.
 * Every adapter needs this, so it lives here.
 */
export function xmlText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(xmlText).filter(Boolean).join(' ');
  if (typeof node === 'object') {
    // Flatten every non-attribute child, including `#text`. Adapters strip
    // known inline tags before parsing (see pubmed.js) because mixed content
    // loses its ordering here; this branch is the fallback for an unexpected
    // inline tag, and it keeps the words rather than dropping them.
    return Object.entries(node)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, v]) => xmlText(v))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/** Always an array, whether the parser gave one, none, or a bare object. */
export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Build YYYY-MM-DD from loose year/month/day parts, tolerating month names. */
export function isoDate(year, month, day) {
  const y = Number(String(year ?? '').slice(0, 4));
  if (!Number.isFinite(y) || y < 1900) return null;
  const m = monthNumber(month);
  const d = Number(day);
  const mm = String(m ?? 1).padStart(2, '0');
  const dd = String(Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthNumber(month) {
  if (month == null) return null;
  const n = Number(month);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  const key = String(month).slice(0, 3).toLowerCase();
  return MONTHS[key] ?? null;
}
