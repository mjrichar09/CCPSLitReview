#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readStage, writeStage } from '../lib/util/staging.js';
import { stagingDir } from '../lib/digestDir.js';
import { reconcileTopPicks } from '../lib/pipeline/synthesize.js';
import { log } from '../lib/util/log.js';

/**
 * The deterministic half of the routine-based generator: takes the routine's
 * own reasoning (routine-output.json — summaries, narratives, top picks, an
 * overview, and nothing else) and merges it against routine-input.json's
 * already-known paper/category data to produce exactly the summarized.json and
 * synthesized.json shapes the deterministic `write` stage expects
 * (lib/pipeline/write.js, via `--stage write --from-stage write`).
 *
 * This is where the "a missing verdict halts the run" invariant gets enforced
 * for the routine's output — the same standard score.js and summarize.js hold
 * their own API-schema-constrained output to. The routine's reasoning has no
 * equivalent of the Anthropic/Groq provider's JSON-schema enforcement, so
 * nothing here trusts routine-output.json's shape without checking it first.
 */

async function main() {
  const { values } = parseArgs({ options: { month: { type: 'string' } }, allowPositionals: false });
  if (!values.month) fail('usage: node scripts/finalize-routine-output.mjs --month YYYY-MM');
  const month = values.month;

  const scored = await readStage(month, 'scored');
  if (!scored) fail(`no staging/${month}/scored.json`);
  const input = await readStage(month, 'routine-input');
  if (!input) fail(`no staging/${month}/routine-input.json — run scripts/prep-for-routine.mjs first`);

  const outputFile = path.join(stagingDir(month), 'routine-output.json');
  let output;
  try {
    output = JSON.parse(await readFile(outputFile, 'utf8'));
  } catch (err) {
    fail(`cannot read ${outputFile}: ${err.message}`);
  }

  // --- summaries: every paper index must have one ---------------------------
  const byIndex = new Map((output.summaries ?? []).map((s) => [s.index, s]));
  const missingSummaries = input.papers.map((p) => p.index).filter((i) => !byIndex.has(i));
  if (missingSummaries.length > 0) {
    fail(
      `routine-output: no summary for ${missingSummaries.length} of ${input.papers.length} papers ` +
        `(indices ${missingSummaries.slice(0, 10).join(', ')})`,
    );
  }
  for (const s of output.summaries) {
    for (const field of ['summary', 'why_it_matters']) {
      if (typeof s[field] !== 'string' || s[field].trim() === '') {
        fail(`routine-output: paper index ${s.index} has an empty or missing "${field}"`);
      }
    }
  }

  const papers = input.papers.map(({ index, ...paper }) => {
    const s = byIndex.get(index);
    return { ...paper, summary: s.summary, why_it_matters: s.why_it_matters, thin_abstract: Boolean(s.thin_abstract) };
  });
  const paperByIndex = new Map(input.papers.map((p, i) => [p.index, papers[i]]));

  const summarizedOut = {
    items: papers,
    stats: {
      scored_keeps: scored.items.length,
      after_cap: input.papers.length,
      distinct_papers: papers.length,
      thin_abstracts: papers.filter((p) => p.thin_abstract).length,
    },
    health: scored.health,
  };
  await writeStage(month, 'summarized', summarizedOut);

  // --- narratives: every category with papers must have one -----------------
  const narrativeById = new Map((output.narratives ?? []).map((n) => [n.id, n]));
  const missingNarratives = input.categories.map((c) => c.id).filter((id) => !narrativeById.has(id));
  if (missingNarratives.length > 0) {
    fail(`routine-output: no narrative for category ids: ${missingNarratives.join(', ')}`);
  }
  const narratives = input.categories.map((c) => {
    const n = narrativeById.get(c.id);
    if (typeof n.synthesis !== 'string' || n.synthesis.trim() === '') {
      fail(`routine-output: category "${c.id}" has an empty or missing "synthesis"`);
    }
    const categoryPapers = input.by_category[c.id].map((i) => paperByIndex.get(i));
    return { id: c.id, synthesis: n.synthesis, papers: categoryPapers };
  });

  // --- top picks: same hallucination guard the real synthesize.js uses ------
  if (!Array.isArray(output.top)) fail('routine-output: "top" is missing or not an array');
  const topItems = reconcileTopPicks({ items: papers, picks: output.top, want: input.top_items_wanted });

  // --- overview ---------------------------------------------------------------
  if (typeof output.overview !== 'string' || output.overview.trim() === '') {
    fail('routine-output: "overview" is missing or empty');
  }

  const synthesizedOut = {
    items: papers,
    narratives,
    top_items: topItems,
    summary: output.overview,
    stats: { categories: narratives.length, top_items: topItems.length },
    health: scored.health,
  };
  await writeStage(month, 'synthesized', synthesizedOut);

  log.info('finalize-routine-output complete', {
    month,
    papers: papers.length,
    categories: narratives.length,
    top_items: topItems.length,
  });
  process.stderr.write(
    `finalized: ${papers.length} papers, ${narratives.length} narratives, ${topItems.length} top items -> staging/${month}/{summarized,synthesized}.json\n`,
  );
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`finalize-routine-output failed: ${err.message}\n`);
  process.exit(1);
});
