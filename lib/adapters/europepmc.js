import { fetchJson } from '../util/http.js';
import { toDay } from '../util/window.js';
import { makeRecord } from './record.js';

const SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

export const id = 'europepmc';

/**
 * Europe PMC REST search. Catches material PubMed misses and — with SRC:PPR —
 * indexes bioRxiv/medRxiv preprints with real query syntax, which the bioRxiv
 * API itself does not support.
 */
export async function fetchCategory({ category, settings, window, limiters, extraFilter = null, source = 'europepmc' }) {
  const limiter = limiters.for('europepmc', {
    rps: settings.rps ?? 5,
    concurrency: settings.concurrency ?? 3,
  });

  const base = settings.query ?? category.sources?.europepmc?.query;
  if (!base) return { records: [], notes: ['no query configured'] };

  const dateFilter = `(FIRST_PDATE:[${toDay(window.from)} TO ${toDay(window.to)}])`;
  const query = [`(${base})`, dateFilter, extraFilter].filter(Boolean).join(' AND ');

  const pageSize = settings.pageSize ?? 100;
  const maxPages = settings.maxPages ?? 4;
  const notes = [];
  const records = [];

  let cursor = '*';
  let hitCount = null;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      query,
      format: 'json',
      resultType: 'core',
      pageSize: String(pageSize),
      cursorMark: cursor,
    });
    const data = await limiter.schedule(() => fetchJson(`${SEARCH}?${params}`));

    if (hitCount === null) hitCount = Number(data?.hitCount ?? 0);
    const results = data?.resultList?.result ?? [];
    for (const r of results) {
      const record = toRecord(r, category.id, source);
      if (record) records.push(record);
    }

    const next = data?.nextCursorMark;
    if (!next || next === cursor || results.length === 0) break;
    cursor = next;

    if (page === maxPages - 1 && hitCount > records.length) {
      notes.push(`${hitCount} hits, capped at ${maxPages} pages of ${pageSize}`);
    }
  }

  return { records, notes };
}

/** Exported for tests: map one Europe PMC result object to a record. */
export function toRecord(r, categoryId, source = 'europepmc') {
  const isPreprint = r?.source === 'PPR';
  const url = r?.doi
    ? `https://doi.org/${r.doi}`
    : r?.source && r?.id
      ? `https://europepmc.org/article/${r.source}/${r.id}`
      : null;

  return makeRecord({
    source,
    categoryId,
    title: r?.title,
    abstract: r?.abstractText,
    authors: splitAuthors(r?.authorString),
    venue: r?.journalTitle || r?.bookOrReportDetails?.publisher || (isPreprint ? 'Preprint' : null),
    published: r?.firstPublicationDate || (r?.pubYear ? `${r.pubYear}-01-01` : null),
    url,
    doi: r?.doi ?? null,
    pmid: r?.pmid ?? null,
    isPreprint,
  });
}

function splitAuthors(authorString) {
  if (!authorString) return [];
  return String(authorString)
    .replace(/\.$/, '')
    .split(/,\s*/)
    .map((a) => a.trim())
    .filter(Boolean);
}
