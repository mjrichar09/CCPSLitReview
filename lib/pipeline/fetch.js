import { runAdapter, crossref, SEARCH_SOURCES } from '../adapters/index.js';
import { resolveSource } from '../config.js';
import { createLimiterRegistry } from '../util/throttle.js';
import { log } from '../util/log.js';

/**
 * Stage 1 — run every enabled adapter for every category and collect raw
 * records.
 *
 * No deduplication, no scoring, no writes. Records may repeat across categories
 * and across sources; that is the normalize stage's problem, and keeping this
 * stage dumb is what lets it be re-run freely.
 */
export async function fetchAll({ config, window, categories = config.categories, env = process.env }) {
  const limiters = createLimiterRegistry();
  const jobs = [];

  for (const category of categories) {
    for (const sourceId of SEARCH_SOURCES) {
      const settings = resolveSource(config, category, sourceId);
      if (!settings.enabled) continue;
      jobs.push({ category, sourceId, settings });
    }
  }

  log.info('fetch starting', {
    categories: categories.length,
    jobs: jobs.length,
    from: window.from.toISOString().slice(0, 10),
    to: window.to.toISOString().slice(0, 10),
  });

  // Adapters are launched together; the per-host limiters do the pacing, so a
  // slow source never blocks a fast one.
  const results = await Promise.all(
    jobs.map(({ category, sourceId, settings }) =>
      runAdapter(sourceId, { category, settings, window, limiters, config, env }),
    ),
  );

  const records = results.flatMap((r) => r.records);
  const health = results.map((r) => r.health);

  const enrichment = await crossref.enrich(records, {
    settings: config.sources?.crossref,
    limiters,
  });
  if (enrichment.attempted > 0) {
    log.info('crossref enrichment', enrichment);
    health.push({
      source: 'crossref',
      category: '*',
      status: enrichment.failed > 0 ? 'degraded' : 'ok',
      fetched: enrichment.enriched,
      notes: [`patched ${enrichment.enriched} records from ${enrichment.attempted} DOI lookups`],
      ...(enrichment.failed > 0 ? { error: `${enrichment.failed} lookups failed` } : {}),
    });
  }

  return { records, health, enrichment };
}

/** fetched counts as a category × source grid, for the CLI summary. */
export function summarize(health, categories) {
  const bySource = new Map();
  for (const h of health) {
    if (h.category === '*') continue;
    if (!bySource.has(h.source)) bySource.set(h.source, new Map());
    bySource.get(h.source).set(h.category, h);
  }

  const sources = [...bySource.keys()].sort();
  const rows = categories.map((c) => {
    const cells = sources.map((s) => bySource.get(s)?.get(c.id) ?? null);
    return {
      category: c.id,
      cells,
      total: cells.reduce((sum, cell) => sum + (cell?.fetched ?? 0), 0),
    };
  });

  return { sources, rows, total: rows.reduce((s, r) => s + r.total, 0) };
}
