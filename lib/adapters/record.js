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

/**
 * Strip markup, decode entities, normalize punctuation, collapse whitespace.
 * Abstracts arrive with inline tags; titles, abstracts and author names all
 * arrive with entities, and both numeric forms are common — PubMed emits hex
 * (`&#x2011;`, `&#x3b1;`, accented author names) and RSS emits decimal
 * (`&#8217;` for a curly apostrophe). Anything left undecoded is rendered
 * literally by the viewer, which is how `What&#8217;s` reached the site.
 */
export function cleanText(value) {
  if (value == null) return '';
  const stripped = String(value).replace(/<\/?[^>]+>/g, ' ');
  // Markup that arrived entity-encoded (`&lt;sup&gt;`) only becomes a tag once
  // decoded, i.e. after the strip above has already run — that is how a literal
  // `<sup>` reached a stored title. Re-strip, but only the known inline tags, so
  // that a decoded comparison such as "p < 0.05 ... q > 1" cannot be eaten as if
  // it were a tag.
  return normalizePunctuation(decodeEntities(stripped))
    .replace(/<\/?(?:i|b|u|em|strong|sub|sup|span|p|br|small)\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The named entities that actually turn up; numeric forms are handled generically. */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', deg: '°',
  times: '×', plusmn: '±', micro: 'µ', alpha: 'α',
  beta: 'β', gamma: 'γ', kappa: 'κ', lambda: 'λ',
  mu: 'μ', le: '≤', ge: '≥', minus: '−', shy: '\u00ad',
};

/**
 * One pass decodes every entity at once, so no substitution can cascade into
 * the next — decoding `&amp;` first (as this used to) would turn a literal
 * `&amp;#8217;` into a live `&#8217;`. The bounded repeat handles genuinely
 * double-encoded input without risking a loop.
 */
function decodeEntities(text) {
  let out = text;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = out.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
        return codePointToChar(code) ?? match;
      }
      return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Reject anything String.fromCodePoint would throw on, or that would corrupt the text. */
function codePointToChar(code) {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null; // lone surrogate half
  return String.fromCodePoint(code);
}

/**
 * Fold typographic punctuation to ASCII. Letters are left alone — accented
 * author names must survive intact — but curly quotes, the dash family and the
 * invisible spacing characters are the ones that render inconsistently or
 * arrive mis-encoded, and the generated prose is already held to plain ASCII.
 */
function normalizePunctuation(text) {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/—/g, ' - ')
    .replace(/[‐‑‒–―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\u00ad/g, '')
    .replace(/[\u00a0\u2007\u202f\u200b\ufeff]/g, ' ');
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
