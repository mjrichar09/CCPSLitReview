import { fetchJson } from '../util/http.js';
import { toDay } from '../util/window.js';
import { makeRecord } from './record.js';
import * as europepmc from './europepmc.js';

const DETAILS = 'https://api.biorxiv.org/details';
const PAGE = 100;

export const id = 'biorxiv';

/**
 * Preprints, two ways.
 *
 * api.biorxiv.org has no keyword search — its only listing endpoint is
 * /details/{server}/{from}/{to}/{cursor}, a paginated dump of everything posted
 * in a date window across all subject areas. So:
 *
 *   mode 'europepmc-ppr' (default) — search Europe PMC restricted to preprints
 *     (SRC:PPR), reusing the category's Europe PMC query. Real query syntax,
 *     one request, no client-side filtering.
 *   mode 'api' — page the bioRxiv/medRxiv window and keyword-filter locally.
 *     Faithful to the brief's literal wording; several thousand records a month
 *     and cruder matching.
 *
 * See PLAN.md §11.1.
 */
export async function fetchCategory(ctx) {
  const mode = ctx.settings.mode ?? 'europepmc-ppr';
  if (mode === 'europepmc-ppr') return viaEuropePmc(ctx);
  if (mode === 'api') return viaBiorxivApi(ctx);
  throw new Error(`biorxiv: unknown mode "${mode}" (expected 'europepmc-ppr' or 'api')`);
}

async function viaEuropePmc({ category, settings, window, limiters, config }) {
  const query = category.sources?.europepmc?.query ?? config?.sources?.europepmc?.query;
  if (!query) {
    return { records: [], notes: ['europepmc-ppr mode needs a europepmc query on the category'] };
  }
  const result = await europepmc.fetchCategory({
    category,
    settings: {
      ...config?.sources?.europepmc,
      query,
      maxPages: settings.maxPages ?? 3,
    },
    window,
    limiters,
    extraFilter: '(SRC:PPR)',
    source: 'biorxiv',
  });
  return { ...result, notes: [...(result.notes ?? []), 'preprints via Europe PMC SRC:PPR'] };
}

async function viaBiorxivApi({ category, settings, window, limiters }) {
  const limiter = limiters.for('biorxiv', {
    rps: settings.rps ?? 2,
    concurrency: settings.concurrency ?? 2,
  });
  const terms = (category.sources?.biorxiv?.terms ?? []).map((t) => t.toLowerCase());
  const servers = settings.servers ?? ['biorxiv'];
  const maxPages = settings.maxPages ?? 20;

  const records = [];
  const notes = [];
  let scanned = 0;

  for (const server of servers) {
    let cursor = 0;
    for (let page = 0; page < maxPages; page++) {
      const url = `${DETAILS}/${server}/${toDay(window.from)}/${toDay(window.to)}/${cursor}`;
      const data = await limiter.schedule(() => fetchJson(url));
      const collection = data?.collection ?? [];
      scanned += collection.length;

      for (const item of collection) {
        if (!matchesTerms(item, terms)) continue;
        const record = toRecord(item, category.id, server);
        if (record) records.push(record);
      }

      const total = Number(data?.messages?.[0]?.total ?? 0);
      cursor += PAGE;
      if (collection.length < PAGE || cursor >= total) break;
      if (page === maxPages - 1 && cursor < total) {
        notes.push(`${server}: stopped at ${cursor}/${total} (maxPages=${maxPages})`);
      }
    }
  }

  notes.push(`scanned ${scanned} preprints, kept ${records.length} on ${terms.length} terms`);
  return { records, notes };
}

/** Exported for tests: map one bioRxiv API collection entry to a record. */
export function toRecord(item, categoryId, server = 'biorxiv') {
  return makeRecord({
    source: 'biorxiv',
    categoryId,
    title: item?.title,
    abstract: item?.abstract,
    authors: splitAuthors(item?.authors),
    venue: server === 'medrxiv' ? 'medRxiv' : 'bioRxiv',
    published: item?.date ?? null,
    url: item?.doi ? `https://doi.org/${item.doi}` : null,
    doi: item?.doi ?? null,
    isPreprint: true,
  });
}

function matchesTerms(item, terms) {
  if (terms.length === 0) return true;
  const haystack = `${item?.title ?? ''} ${item?.abstract ?? ''}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

function splitAuthors(authors) {
  if (!authors) return [];
  return String(authors)
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean);
}
