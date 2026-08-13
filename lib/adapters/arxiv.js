import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../util/http.js';
import { makeRecord, xmlText, asArray } from './record.js';

const QUERY_URL = 'https://export.arxiv.org/api/query';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

export const id = 'arxiv';

/**
 * arXiv Atom API, for modeling_ml only.
 *
 * A meaningful share of hybrid-modeling and Bayesian-methods work appears here
 * first and never reaches PubMed. arXiv's date filtering is unreliable inside
 * search_query, so we sort by submission date descending and stop once results
 * fall out of the window.
 */
export async function fetchCategory({ category, settings, window, limiters }) {
  const limiter = limiters.for('arxiv', {
    rps: settings.rps ?? 0.34, // arXiv asks for ~1 request every 3 seconds
    concurrency: 1,
  });

  const cats = (settings.categories ?? []).map((c) => `cat:${c}`).join(' OR ');
  const terms = termList(category.sources?.arxiv ?? settings)
    .map((t) => (t.includes(' ') ? `abs:"${t}"` : `abs:${t}`))
    .join(' OR ');

  if (!cats && !terms) return { records: [], notes: ['no categories or terms configured'] };
  const searchQuery = [cats && `(${cats})`, terms && `(${terms})`].filter(Boolean).join(' AND ');

  const params = new URLSearchParams({
    search_query: searchQuery,
    start: '0',
    max_results: String(settings.maxResults ?? 120),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });

  const xml = await limiter.schedule(() => fetchText(`${QUERY_URL}?${params}`, { accept: 'application/atom+xml' }));
  const { records, examined, returned, oldestSeen } = parseFeed(xml, category.id, window);

  const notes = [];
  if (returned > 0 && examined === returned) {
    // Never reached an out-of-window entry, so the window may extend past what
    // one request can reach and results are being truncated.
    notes.push(`all ${returned} returned results were in-window — raise maxResults`);
  } else if (oldestSeen) {
    notes.push(`examined ${examined} of ${returned} results before reaching ${oldestSeen}`);
  }

  return { records, notes };
}

/** Exported for tests: parse an arXiv Atom feed, keeping only in-window entries. */
export function parseFeed(xml, categoryId, window) {
  const doc = parser.parse(xml);
  const entries = asArray(doc?.feed?.entry);
  const records = [];
  let oldestSeen = null;
  let examined = 0;

  for (const entry of entries) {
    examined += 1;
    const published = (xmlText(entry?.published) || '').slice(0, 10);
    if (published) oldestSeen = published;
    if (window && published) {
      const t = Date.parse(`${published}T00:00:00Z`);
      // Sorted newest-first, so anything older than the window ends the scan.
      if (Number.isFinite(t) && t < window.from.getTime()) break;
      if (Number.isFinite(t) && t > window.to.getTime()) continue;
    }

    const absUrl = asArray(entry?.link).find((l) => l?.['@_rel'] === 'alternate')?.['@_href']
      ?? xmlText(entry?.id);

    const record = makeRecord({
      source: 'arxiv',
      categoryId,
      title: xmlText(entry?.title),
      abstract: xmlText(entry?.summary),
      authors: asArray(entry?.author).map((a) => xmlText(a?.name)),
      venue: 'arXiv',
      published: published || null,
      url: absUrl || null,
      doi: xmlText(entry?.['arxiv:doi']) || null,
      isPreprint: true,
    });
    if (record) records.push(record);
  }

  // `examined` is how many entries the scan actually looked at before breaking
  // at the window edge; `returned` is how many arXiv sent. Reporting the latter
  // as if it were the former overstated the search depth by ~50x.
  return { records, examined, returned: entries.length, oldestSeen };
}

function termList(source) {
  if (Array.isArray(source?.terms) && source.terms.length > 0) return source.terms;
  if (typeof source?.query === 'string') {
    return source.query
      .split(/\s+OR\s+/i)
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return [];
}
