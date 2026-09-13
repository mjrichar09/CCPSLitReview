/**
 * Reader-imported papers — the shared, environment-neutral half.
 *
 * Imported both by client islands (the import forms) and by Node (the
 * pipeline's `lib/importedPapers.js`), so this module must stay browser-safe:
 * no `node:` imports, no Next, no Supabase. That rules out reusing
 * `lib/util/identity.js` wholesale — it pulls in `node:crypto` for
 * `titleHash` — so the DOI half of the identity rule is restated here, and
 * deliberately kept byte-identical in behavior to `normalizeDoi` there.
 * `test/userPapers.test.js` pins the two against each other so they cannot
 * drift.
 */

/**
 * Every imported paper is scored 5.
 *
 * Not a guess at what the rubric would say — a statement that a human picked
 * this one out by hand, which is a stronger signal than the filter was ever
 * meant to produce. The scoring model never sees these papers (it runs in the
 * pipeline, against the month's candidates), so there is no second opinion
 * for this number to disagree with.
 */
export const IMPORTED_SCORE = 5;

/** The category segment imported papers render under, for comment deep links. */
export const IMPORTS_CATEGORY = 'imports';

/** Lowercase DOI with any resolver prefix stripped. Mirrors lib/util/identity.js. */
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
 * A DOI as it appears in running text. Deliberately not anchored — it has to
 * find DOIs mid-sentence in a slide — and stops before trailing sentence
 * punctuation, which `normalizeDoi` then strips anyway.
 *
 * The `10.\d{4,9}/` prefix is the registrant form every real DOI takes; the
 * suffix accepts the printable ASCII DOIs actually use. Case-insensitive
 * because decks capitalize inconsistently.
 */
export const DOI_PATTERN = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]*[a-z0-9]/gi;

/** Every distinct DOI in a blob of text, normalized, in order of appearance. */
export function findDois(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const match of String(text).matchAll(DOI_PATTERN)) {
    const doi = normalizeDoi(match[0]);
    if (!doi || seen.has(doi)) continue;
    seen.add(doi);
    out.push(doi);
  }
  return out;
}

/**
 * The item id for an imported paper.
 *
 * A DOI import takes the digest's own `doi:` namespace, so that if the
 * pipeline later publishes the same paper in a month, both refer to one
 * item_id and any comments written here already belong to it.
 *
 * A title-only import cannot make that claim — we have not verified it is the
 * same paper as anything — so it gets its own `user:` namespace rather than
 * borrowing `title:`, which the dedupe stage treats as a real identity.
 */
export function importedItemId({ doi, uuid }) {
  const d = normalizeDoi(doi);
  if (d) return `doi:${d}`;
  if (!uuid) throw new Error('importedItemId: a title-only import needs a uuid');
  return `user:${uuid}`;
}

/** True for an id minted by a title-only import. */
export function isTitleOnlyImport(itemId) {
  return typeof itemId === 'string' && itemId.startsWith('user:');
}

const MAX_TITLE = 500;
const MAX_ABSTRACT = 4000;

function trimTo(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Shape an import candidate into the row `user_papers` accepts, or explain why
 * it cannot be one.
 *
 * Returns `{ ok: true, row }` or `{ ok: false, reason }` rather than throwing:
 * a conference deck produces many candidates at once and one bad line must not
 * take the rest of the deck down with it — the importer reports the rejects
 * alongside the successes.
 */
export function buildImportRow({ title, authors, venue, published, doi, url, abstract, source = 'manual', deckTitle, userId, uuid }) {
  const cleanTitle = trimTo(title, MAX_TITLE);
  if (!cleanTitle) return { ok: false, reason: 'no title' };
  if (!userId) return { ok: false, reason: 'not signed in' };

  const normalizedDoi = normalizeDoi(doi);
  if (!normalizedDoi && !uuid) return { ok: false, reason: 'no DOI and no generated id' };

  return {
    ok: true,
    row: {
      item_id: importedItemId({ doi: normalizedDoi, uuid }),
      user_id: userId,
      title: cleanTitle,
      authors: Array.isArray(authors) ? authors.map((a) => trimTo(a, 200)).filter(Boolean).slice(0, 25) : [],
      venue: trimTo(venue, 300),
      published: trimTo(published, 40),
      doi: normalizedDoi,
      // Always a resolver URL when we have a DOI: it is stable, and it keeps
      // us off publisher landing pages we would otherwise have to guess at.
      url: normalizedDoi ? `https://doi.org/${normalizedDoi}` : trimTo(url, 2000),
      abstract: trimTo(abstract, MAX_ABSTRACT),
      source,
      deck_title: trimTo(deckTitle, 300),
    },
  };
}

/**
 * Render a stored row the way the viewer's `ItemRow` expects a paper.
 *
 * The section reuses the existing row component rather than growing a second
 * one, so the fields it reads have to be present — including the ones an
 * import has no basis for (`is_recurring`, `thin_abstract`), which are set to
 * their honest values rather than left undefined.
 */
export function toDisplayItem(row) {
  return {
    id: row.item_id,
    title: row.title,
    authors: row.authors ?? [],
    venue: row.venue ?? null,
    published: row.published ?? null,
    url: row.url ?? (row.doi ? `https://doi.org/${row.doi}` : null),
    doi: row.doi ?? null,
    abstract: row.abstract ?? null,
    summary: null,
    why_it_matters: null,
    is_preprint: false,
    is_recurring: false,
    previously_seen: null,
    thin_abstract: !row.abstract,
    relevance_score: IMPORTED_SCORE,
    sources: [{ source: row.source === 'conference' ? 'conference import' : 'manual import' }],
  };
}
