import { dedupe, clean } from '../util/dedupe.js';
import { loadLedger, classify } from '../util/ledger.js';
import { log } from '../util/log.js';

/**
 * Stage 2 — collapse duplicates and drop what has already been reported.
 *
 * The ledger check is what makes the digest monthly rather than cumulative. An
 * item is dropped only when every category it matched has already carried it in
 * an earlier month; a paper first reported under upstream_pd that now also
 * matches product_quality is new to that category and runs again, flagged
 * recurring so the viewer can distinguish it from a first appearance.
 */
export async function normalize({ records, month, config, ledger }) {
  const entries = ledger ?? (await loadLedger());
  const { items, stats } = dedupe(records);

  const kept = [];
  const dropped = [];

  for (const item of clean(items)) {
    const verdict = classify(entries, item, month);
    switch (verdict.status) {
      case 'new':
        kept.push({ ...item, is_recurring: false });
        break;
      case 'recurring':
        kept.push({
          ...item,
          is_recurring: true,
          // Only the categories it has not been reported under before.
          categories: verdict.newCategories,
          previously_seen: verdict.entry.first_seen_month,
        });
        break;
      case 'same_month':
        // Re-run of a month already written. Not a duplicate to drop — the
        // month is being rebuilt, so treat it as present.
        kept.push({ ...item, is_recurring: false });
        break;
      default:
        dropped.push({ external_id: item.external_id, title: item.title, seen: verdict.entry.first_seen_month });
    }
  }

  const result = {
    month,
    stats: {
      ...stats,
      ledger_size: entries.size,
      dropped_as_seen: dropped.length,
      kept: kept.length,
      recurring: kept.filter((k) => k.is_recurring).length,
    },
    items: kept,
    dropped,
  };

  log.info('normalize complete', {
    in: stats.input,
    afterDedupe: stats.output,
    dropped: dropped.length,
    kept: kept.length,
  });

  if (config?.categories) assertCategoriesKnown(kept, config);
  return result;
}

/**
 * A record carrying a category id that is no longer in config would silently
 * vanish at report time. Halt instead — this is not adapter failure, it is a
 * config/data mismatch.
 */
function assertCategoriesKnown(items, config) {
  const known = new Set(config.categories.map((c) => c.id));
  const unknown = new Set();
  for (const item of items) {
    for (const c of item.categories) if (!known.has(c)) unknown.add(c);
  }
  if (unknown.size > 0) {
    throw new Error(
      `normalize: records reference categories missing from config: ${[...unknown].join(', ')}`,
    );
  }
}
