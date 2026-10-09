/**
 * Pipeline settings: sources, models, rates, thresholds.
 *
 * What the digest *covers* — the topics, their scoring rubrics and keywords,
 * and the RSS feed list — is not here. It lives in config/topics.json, which
 * admins edit from the site (/digest/admin/topics) and which is merged in at
 * the bottom of this file; see lib/topics.js for the format. Tuning the
 * relevance gate is still `relevance.threshold` below.
 */

import topicsDoc from './topics.json' with { type: 'json' };
import { applyTopics, topicsDocErrors } from '../lib/topics.js';

// ---------------------------------------------------------------------------
// Source defaults. Per-topic overrides live under each topic's `sources`.
// ---------------------------------------------------------------------------

const sources = {
  pubmed: {
    enabled: true,
    // NCBI allows 3 req/s unkeyed, 10 with NCBI_API_KEY. The adapter picks the
    // right bucket at runtime and records which one it used in source_health,
    // so a missing key shows up as a degraded note rather than silent slowness.
    rps: { keyed: 10, unkeyed: 3 },
    concurrency: 3,
    retmax: 200,
  },
  europepmc: {
    enabled: true,
    rps: 5,
    concurrency: 3,
    pageSize: 100,
    maxPages: 4,
  },
  biorxiv: {
    enabled: false, // opt-in per category (brief: 4 categories only)
    // 'europepmc-ppr' queries Europe PMC filtered to preprints, which supports
    // real query syntax. 'api' pages api.biorxiv.org's date-window dump and
    // keyword-filters client-side. See PLAN.md §11.1.
    mode: 'europepmc-ppr',
    servers: ['biorxiv', 'medrxiv'],
    rps: 2,
    concurrency: 2,
    maxPages: 20,
  },
  arxiv: {
    enabled: false, // opt-in per category (brief: modeling_ml only)
    // arXiv asks for one request every ~3s.
    rps: 0.34,
    concurrency: 1,
    // cs.LG and math.OC added after the first Phase 1 run returned only 2
    // records in 35 days: most hybrid-modelling and optimisation work for
    // bioprocess posts there rather than to stat.ML/eess.SY.
    categories: ['stat.ML', 'eess.SY', 'q-bio.QM', 'cs.LG', 'math.OC'],
    // Results are scanned newest-first and the scan stops at the window edge,
    // so this is a ceiling on how far back one request can reach, not a cap on
    // what is kept. Raised with the category list.
    maxResults: 300,
  },
  crossref: {
    // Enrichment only — DOI resolution, journal name, date normalisation.
    // Never a primary search source.
    enabled: true,
    rps: 5,
    concurrency: 4,
    mailto: 'mjrichar09@gmail.com', // Crossref's polite pool wants a contact
  },
  rss: {
    enabled: true,
    rps: 2,
    concurrency: 4,
    // The feed list lives in config/topics.json, edited from the site, and is
    // filled in below. A feed that starts 404ing fails soft: it is recorded in
    // source_health and the rest of the run continues, so check the footer
    // rather than trusting silence. Endpoints News stays listed but disabled:
    // its feed returns 403 to any non-browser client on every path tried.
    feeds: [],
  },
};

// ---------------------------------------------------------------------------

const config = {
  // Which generator implementation stages 4-5 use when they run in-process.
  // The scheduled path no longer does: Actions stops after score and a Claude
  // Code routine writes the month (docs/digest-routine-prompt.md). 'api' is
  // the manual fallback, a workflow dispatch with stage: all.
  generator: 'api',

  relevance: {
    // Items scoring below this are discarded. The brief's default is 3.
    threshold: 3,
    // Items per scoring call. Larger batches are cheaper but risk the model
    // losing track of indices.
    batchSize: 25,
  },

  window: {
    defaultDays: 35,
  },

  // Per-stage provider + model + rates. Rates are USD per million tokens and
  // live next to the model id so the cost estimate stays honest when either
  // changes. Switching a stage to Groq is an edit to one of these three blocks.
  models: {
    score: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      rates: { input: 1.0, output: 5.0 },
      // Scoring is ~40 calls of ~45s each. Sequentially that is over half an
      // hour and does not fit an Actions job; at 4 in flight it is under ten
      // minutes. 0.75 rps sustains 45 requests/minute, just under the lowest
      // Anthropic tier's 50 rpm, so the concurrency cap is what binds rather
      // than a 429.
      concurrency: 4,
      rps: 0.75,
    },
    summarize: {
      provider: 'anthropic',
      model: 'claude-opus-5',
      rates: { input: 5.0, output: 25.0 },
      concurrency: 4,
      rps: 0.75,
    },
    synthesize: {
      provider: 'anthropic',
      model: 'claude-opus-5',
      rates: { input: 5.0, output: 25.0 },
      concurrency: 4,
      rps: 0.75,
    },
  },

  // Known alternatives, for reference when editing `models` above. Not used
  // unless a stage names one. Rates verified 2026-08-13.
  knownModels: {
    'claude-haiku-4-5': { provider: 'anthropic', rates: { input: 1.0, output: 5.0 } },
    'claude-sonnet-5': { provider: 'anthropic', rates: { input: 3.0, output: 15.0 } },
    'claude-opus-5': { provider: 'anthropic', rates: { input: 5.0, output: 25.0 } },
    'openai/gpt-oss-20b': { provider: 'groq', rates: { input: 0.075, output: 0.3 } },
    'openai/gpt-oss-120b': { provider: 'groq', rates: { input: 0.15, output: 0.6 } },
    'llama-3.3-70b-versatile': { provider: 'groq', rates: { input: 0.59, output: 0.79 } },
  },

  // Items per summarisation call. Smaller than the scoring batch on purpose:
  // summaries are generated text rather than a number and a line, so a large
  // batch both risks the token ceiling and measurably flattens the later ones.
  summarize: {
    batchSize: 6,
  },

  // Size of the cross-category Top N.
  top_items: 5,

  ledger: {
    // Past this many entries the ledger shards by year (index/articles-YYYY.json).
    shardAfter: 5000,
  },

  history: {
    // How many previous months of narratives the synthesize stage may see, so a
    // category can say "this reverses July" rather than starting cold each month.
    // A quarter is enough for a trend and short enough to stay cheap; 0 disables
    // cross-month context entirely and restores the memoryless behaviour.
    back: 3,
  },

  sources,
};

// Topics (categories) and RSS feeds come from config/topics.json — the file the
// site's topic editor writes to, by way of scripts/sync-topics.mjs. A broken
// file fails here, at import, with the offending topic or feed named.
const docErrors = topicsDocErrors(topicsDoc);
if (docErrors.length > 0) {
  throw new Error(`Invalid config/topics.json:\n  - ${docErrors.join('\n  - ')}`);
}

export default applyTopics(config, topicsDoc);
