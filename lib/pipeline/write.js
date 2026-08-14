import { writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { DIGEST_DIR } from '../digestDir.js';
import { loadLedger, saveLedger, record } from '../util/ledger.js';
import { log } from '../util/log.js';

/**
 * Stage 6 — assemble the month's JSON and advance the ledger.
 *
 * Months are append-only: writing one that already exists is refused unless
 * `--force`. This is the deliberate inverse of TrendTracker's `writeReport`,
 * which overwrites by design — see CLAUDE.md. A digest is a record of what was
 * new *that month*, so silently rewriting it would make the ledger lie about
 * when a paper was first seen.
 */
export async function write({ items, narratives, top_items, summary, month, config, health, run_stats, dry, force }) {
  const file = path.join(DIGEST_DIR, `${month}.json`);

  if (!dry && !force && (await exists(file))) {
    throw new Error(
      `write: ${month}.json already exists and months are append-only — pass --force to overwrite it deliberately`,
    );
  }

  const names = new Map(config.categories.map((c) => [c.id, c.name]));

  const report = {
    month_of: `${month}-01`,
    generated_at: new Date().toISOString(),
    summary,
    top_items: top_items.map((t) => ({ id: t.id, reason: t.reason })),
    categories: narratives.map((n) => ({
      id: n.id,
      name: names.get(n.id) ?? n.id,
      synthesis: n.synthesis,
      items: n.papers.map(renderItem),
    })),
    source_health: health ?? [],
    run_stats: run_stats ?? null,
  };

  // The ledger advances only on a real write. A dry run that moved it would
  // make the next run treat this month's items as already reported.
  let ledgerSize = null;
  if (!dry) {
    const entries = await loadLedger();
    for (const paper of items) record(entries, { ...paper, categories: paper.scored_in }, month);
    await saveLedger(entries, { shardAfter: config.ledger.shardAfter });
    ledgerSize = entries.size;

    await mkdir(DIGEST_DIR, { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    log.info('wrote month', { month, file, items: items.length, ledger: ledgerSize });
  }

  return {
    report,
    stats: {
      month,
      papers: items.length,
      categories: report.categories.length,
      category_slots: report.categories.reduce((n, c) => n + c.items.length, 0),
      top_items: report.top_items.length,
      ledger_size: ledgerSize,
      written: !dry,
    },
  };
}

/**
 * `is_recurring` passes straight through, and that is already per-category.
 *
 * `normalize` replaces a recurring item's `categories` with *only* the ones it
 * has not been reported under (lib/pipeline/normalize.js), and drops items whose
 * categories were all covered before. So an item reaching here with
 * `is_recurring: true` is, by construction, new to every section it appears in —
 * it means "you have seen this paper, but not in this context", which is exactly
 * what the reader needs the badge to say. No further adjustment is correct here;
 * an earlier version of this function tried to make one and was reading a field
 * nothing sets.
 */
function renderItem(paper) {
  return {
    id: paper.external_id,
    title: paper.title,
    authors: paper.authors ?? [],
    venue: paper.venue ?? null,
    published: paper.published ?? null,
    url: paper.url ?? null,
    doi: paper.doi ?? null,
    is_preprint: Boolean(paper.is_preprint),
    summary: paper.summary,
    why_it_matters: paper.why_it_matters,
    thin_abstract: Boolean(paper.thin_abstract),
    relevance_score: paper.relevance,
    is_recurring: Boolean(paper.is_recurring),
    previously_seen: paper.previously_seen ?? null,
    sources: paper.sources ?? [paper.source].filter(Boolean),
  };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
