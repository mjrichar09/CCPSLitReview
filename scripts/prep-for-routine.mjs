#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../lib/config.js';
import { readStage } from '../lib/util/staging.js';
import { stagingDir } from '../lib/digestDir.js';
import { trimToCaps, dedupeToDistinctPapers } from '../lib/pipeline/summarize.js';
import { sortForReading } from '../lib/pipeline/synthesize.js';
import { loadHistory } from '../lib/util/history.js';

/**
 * Everything the routine-based generator needs to do the LLM-shaped part of
 * summarize+synthesize — and nothing else. All of this is deterministic
 * (cap trimming, dedup, category grouping, reading-order sort, cross-month
 * history) and already exists as tested pipeline code; re-deriving any of it
 * from a written spec inside the routine's own reasoning would just be a new
 * place for a transcription error. The routine's job is limited to the
 * creative fields: per-paper summary/why_it_matters/thin_abstract, per-category
 * narrative, the Top-N picks, and the overview paragraph — written to
 * routine-output.json and merged back deterministically by
 * scripts/finalize-routine-output.mjs.
 */

async function main() {
  const { values } = parseArgs({ options: { month: { type: 'string' } }, allowPositionals: false });
  if (!values.month) fail('usage: node scripts/prep-for-routine.mjs --month YYYY-MM');
  const month = values.month;

  const config = loadConfig();
  const scored = await readStage(month, 'scored');
  if (!scored) fail(`no staging/${month}/scored.json — run the Actions pipeline through --stage score first`);

  const kept = trimToCaps(scored.items, config);
  const papers = dedupeToDistinctPapers(kept).map((paper, index) => ({ index, ...paper }));

  const byCategory = new Map();
  for (const paper of papers) {
    for (const id of paper.scored_in) {
      if (!byCategory.has(id)) byCategory.set(id, []);
      byCategory.get(id).push(paper);
    }
  }
  const categories = config.categories.filter((c) => byCategory.has(c.id));
  const byCategoryIndices = Object.fromEntries(
    categories.map((c) => [c.id, sortForReading(byCategory.get(c.id)).map((p) => p.index)]),
  );

  const history = await loadHistory(month, config.history);

  const out = {
    month,
    top_items_wanted: config.top_items ?? 5,
    categories: categories.map((c) => ({ id: c.id, name: c.name, scope: c.scope })),
    by_category: byCategoryIndices,
    papers,
    history: {
      months: history.months,
      by_category: Object.fromEntries(history.byCategory),
      overviews: history.overviews,
    },
    health: scored.health,
  };

  const file = path.join(stagingDir(month), 'routine-input.json');
  await writeFile(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stderr.write(
    `routine input: ${papers.length} distinct papers across ${categories.length} categories -> ${file}\n`,
  );
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(`prep-for-routine failed: ${err.message}\n`);
  process.exit(1);
});
