import * as pubmed from './pubmed.js';
import * as europepmc from './europepmc.js';
import * as biorxiv from './biorxiv.js';
import * as arxiv from './arxiv.js';
import * as rss from './rss.js';
import * as crossref from './crossref.js';
import { log } from '../util/log.js';

/**
 * Search adapters, keyed by the id used in config. Crossref is deliberately not
 * here — it enriches, it does not search.
 */
export const adapters = {
  pubmed,
  europepmc,
  biorxiv,
  arxiv,
  rss,
};

export { crossref };

export const SEARCH_SOURCES = Object.keys(adapters);

/**
 * Run one adapter for one category, converting any failure into a health entry
 * rather than an exception.
 *
 * This is the brief's fail-soft rule in one place: if a source errors or times
 * out we log it, mark it degraded or failed in source_health, and continue. The
 * only thing that must never happen is a silent catch — every failure here ends
 * up in the returned health record, which is written into the report.
 */
export async function runAdapter(sourceId, ctx) {
  const adapter = adapters[sourceId];
  const category = ctx.category.id;
  const started = Date.now();

  if (!adapter) {
    return {
      records: [],
      health: {
        source: sourceId, category, status: 'failed', fetched: 0,
        error: `no adapter registered for "${sourceId}"`, ms: 0,
      },
    };
  }

  try {
    const result = await adapter.fetchCategory(ctx);
    const records = result?.records ?? [];
    const status = result?.degraded ? 'degraded' : 'ok';
    const health = {
      source: sourceId,
      category,
      status,
      fetched: records.length,
      ms: Date.now() - started,
    };
    if (result?.notes?.length) health.notes = result.notes;
    if (result?.failedFeeds) {
      health.error = `${result.failedFeeds} of ${result.totalFeeds} feeds failed`;
    }

    log[status === 'ok' ? 'info' : 'warn']('fetched', {
      source: sourceId, category, n: records.length, status, ms: health.ms,
    });
    return { records, health };
  } catch (err) {
    log.error('adapter failed', { source: sourceId, category, error: err.message });
    return {
      records: [],
      health: {
        source: sourceId,
        category,
        status: 'failed',
        fetched: 0,
        error: err.message,
        ms: Date.now() - started,
      },
    };
  }
}
