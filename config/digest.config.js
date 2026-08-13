/**
 * The one file you edit to change what the digest covers.
 *
 * Adding a ninth category is a config edit only — append an entry to
 * `categories` and nothing else changes. Adding an RSS feed is one entry in
 * `sources.rss.feeds`. Tuning the relevance gate is `relevance.threshold`.
 * See README.md for the walkthroughs.
 *
 * `scope` is not documentation — it is the verbatim rubric the scoring model
 * judges each item against. Write it for the model.
 */

// ---------------------------------------------------------------------------
// Source defaults. Per-category overrides live under each category's `sources`.
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
    categories: ['stat.ML', 'eess.SY', 'q-bio.QM'],
    maxResults: 120,
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
    // All five URLs verified against a live fetch on 2026-08-13. A feed that
    // starts 404ing fails soft: it is recorded in source_health and the rest of
    // the run continues, so check the footer rather than trusting silence.
    feeds: [
      { id: 'bpi', name: 'BioProcess International', url: 'https://bioprocessintl.com/rss.xml', tags: ['trade', 'manufacturing'] },
      { id: 'gen', name: 'GEN', url: 'https://www.genengnews.com/feed/', tags: ['trade'] },
      { id: 'fierce-pharma', name: 'Fierce Pharma', url: 'https://www.fiercepharma.com/rss/xml', tags: ['trade', 'industry'] },
      { id: 'fda-cber', name: 'FDA biologics guidance', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/biologics/rss.xml', tags: ['regulatory'] },
      // Endpoints serves its public feed to browser user-agents but returns 403
      // to ours. Reading it would mean misrepresenting the client, so it is off
      // by default — flip `enabled` if you decide otherwise.
      { id: 'endpoints', name: 'Endpoints News', url: 'https://endpts.com/feed/', tags: ['trade', 'industry'], enabled: false },
    ],
  },
};

// ---------------------------------------------------------------------------
// Reusable query fragments. PubMed and Europe PMC share vocabulary; keeping the
// bioprocess anchor in one place stops the eight queries drifting apart.
// ---------------------------------------------------------------------------

/**
 * The bioprocess anchor: what makes a hit ours rather than merely biological.
 *
 * Two attempts at "weight this toward mammalian" were tried and measured before
 * settling here, and both failed in instructive ways:
 *
 *   1. Restricting the anchor to mammalian terms only. It dropped ~40% of the
 *      catch, including genuinely relevant organism-agnostic methods work
 *      ("Raman-guided sample subset selection ... in bioprocesses") that never
 *      names a cell line.
 *   2. Expanding the mammalian vocabulary (HEK293, Vero, hybridoma, ADC,
 *      therapeutic protein) to compensate. Those terms are ubiquitous in
 *      clinical literature, so it imported cancer imaging and photoimmunotherapy
 *      papers — worse noise than the problem it set out to fix.
 *
 * So the inclusion list stays close to the bioprocess vocabulary, and the
 * weighting toward mammalian systems is applied in the scoring rubric instead
 * (see MAMMALIAN_PREFERENCE) — a model can read an abstract and judge
 * transferability; a query can only match strings.
 */
// Left exactly as first written. Widening it — even just adding plurals —
// was measured to import tissue-engineering and clinical-imaging work
// ("bioreactors" catches perfusion bioreactors for microvessels; "monoclonal
// antibodies" catches photoimmunotherapy). The exclusion below is the only
// change this list needed.
const ANCHOR_TERMS = [
  '"CHO"', '"Chinese hamster ovary"', '"mammalian cell"',
  '"cell culture"', '"bioreactor"', '"biomanufacturing"',
  '"monoclonal antibody"',
];

// Off-target expression systems, matched on TITLE only. A paper *about* Pichia
// says so in its title; a CHO or PAT paper that mentions yeast once in its
// abstract as a model organism must survive — matching these on the abstract
// was measured to kill real PAT and modelling papers.
const OFF_TARGET = [
  'Escherichia coli', 'Saccharomyces', 'Pichia', 'Komagataella',
  'microalgae', 'microalgal', 'cyanobacteria', 'yeast',
  'plant cell', 'insect cell', 'insect cells',
  'Bacillus', 'Streptomyces', 'Corynebacterium',
];

const MAMMALIAN_ANCHOR =
  `(${ANCHOR_TERMS.map((t) => `${t}[tiab]`).join(' OR ')} OR bioprocess*[tiab]) ` +
  `NOT (${OFF_TARGET.map((t) => `"${t}"[ti]`).join(' OR ')})`;

const epmcOr = (terms) => terms.join(' OR ').replace(/"CHO"/, 'CHO');
const EPMC_OFF_TARGET = OFF_TARGET.map((t) => `TITLE:"${t}"`).join(' OR ');

const EPMC_ANCHOR =
  `(${epmcOr(ANCHOR_TERMS)} OR bioprocess*) NOT (${EPMC_OFF_TARGET})`;

/**
 * Appended to every science category's rubric. The fetch anchor is deliberately
 * broad enough to keep organism-agnostic methods work (see MAMMALIAN_ANCHOR);
 * this is where the mammalian preference is actually applied, because the
 * scoring model can read an abstract and judge transferability, whereas a query
 * can only pattern-match strings.
 */
const MAMMALIAN_PREFERENCE = `

EXPRESSION SYSTEM — this weights the score, it is not a separate criterion. The reader runs mammalian cell culture, CHO above all. Score work in CHO, HEK293, NS0, hybridoma, or other mammalian systems at full value. Work in microbial (E. coli, yeast, Pichia), algal, plant, or insect systems scores 0 unless the method itself transfers directly to mammalian culture and the abstract gives enough detail to see that it does — a shared piece of hardware or a generic chemometric trick is not enough on its own. Work that names no expression system (methods, chemometrics, modelling, hardware) is judged on whether an upstream CHO group could apply it as described.`;

// ---------------------------------------------------------------------------

const categories = [
  {
    id: 'pat_control',
    name: 'PAT & Spectroscopic Process Control',
    max_items: 12,
    scope: `Raman, NIR, dielectric/capacitance spectroscopy; chemometrics and PLS modeling; soft sensors; calibration transfer and chemometric model lifecycle; in-line/on-line feedback control loops and control law design; MPC as *implemented* on a bioreactor. Boundary with modeling_ml: if the novelty is the measurement or the closed loop, it belongs here; if the novelty is the model itself — its structure, training, or inference — it belongs in modeling_ml. Items may legitimately carry both.${MAMMALIAN_PREFERENCE}`,
    sources: {
      pubmed: {
        query: `("Raman"[tiab] OR "near-infrared"[tiab] OR "NIR spectroscopy"[tiab] OR "dielectric spectroscopy"[tiab] OR "capacitance"[tiab] OR "process analytical technology"[tiab] OR "chemometric*"[tiab] OR "soft sensor*"[tiab] OR "calibration transfer"[tiab] OR "partial least squares"[tiab] OR "model predictive control"[tiab] OR "feedback control"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
      },
      europepmc: {
        query: `(Raman OR "near-infrared" OR "NIR spectroscopy" OR "dielectric spectroscopy" OR capacitance OR "process analytical technology" OR chemometric* OR "soft sensor" OR "calibration transfer" OR "partial least squares" OR "model predictive control") AND ${EPMC_ANCHOR}`,
      },
      biorxiv: {
        enabled: true,
        terms: ['raman', 'spectroscopy', 'chemometric', 'soft sensor', 'process analytical', 'capacitance'],
      },
      // Trade press carries real PAT content, but an unfiltered feed pull would
      // hand the scoring stage every article these outlets published. Terms keep
      // it to the on-topic slice.
      rss: {
        terms: ['raman', 'spectroscop', 'process analytical', 'pat ', 'chemometric', 'soft sensor', 'in-line', 'inline monitoring', 'real-time release'],
      },
    },
  },

  {
    id: 'upstream_pd',
    name: 'Upstream Process Development',
    max_items: 12,
    scope: `Fed-batch and perfusion operation; feeding strategies; metabolic control; scale-up and scale-down model qualification; bioreactor engineering, kLa, mixing, sparging, shear; temperature/pH/DO strategy.${MAMMALIAN_PREFERENCE}`,
    sources: {
      pubmed: {
        query: `("fed-batch"[tiab] OR "perfusion"[tiab] OR "feeding strategy"[tiab] OR "feed strategy"[tiab] OR "metabolic control"[tiab] OR "scale-down model"[tiab] OR "scale-up"[tiab] OR "kLa"[tiab] OR "mixing time"[tiab] OR "sparging"[tiab] OR "hydrodynamic shear"[tiab] OR "dissolved oxygen"[tiab] OR "lactate"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
      },
      europepmc: {
        query: `("fed-batch" OR perfusion OR "feeding strategy" OR "scale-down model" OR "scale-up" OR kLa OR "mixing time" OR sparging OR shear OR "dissolved oxygen") AND ${EPMC_ANCHOR}`,
      },
      biorxiv: {
        enabled: true,
        terms: ['fed-batch', 'perfusion', 'bioreactor', 'cho cell', 'cell culture process'],
      },
      rss: {
        terms: ['fed-batch', 'perfusion', 'bioreactor', 'cell culture', 'upstream', 'cho ', 'titer', 'scale-up', 'scale-down'],
      },
    },
  },

  {
    id: 'harvest_dsp',
    name: 'Harvest, Clarification & DSP Interface',
    max_items: 10,
    scope: `Centrifugation, depth and tangential flow filtration, flocculation and precipitation at harvest; harvest turbidity and cell lysis; HCP/DNA/impurity clearance through capture; harvest impact on downstream performance.${MAMMALIAN_PREFERENCE}`,
    sources: {
      pubmed: {
        query: `("harvest"[tiab] OR "clarification"[tiab] OR "centrifugation"[tiab] OR "depth filtration"[tiab] OR "tangential flow filtration"[tiab] OR "flocculation"[tiab] OR "precipitation"[tiab] OR "turbidity"[tiab] OR "cell lysis"[tiab] OR "host cell protein*"[tiab] OR "impurity clearance"[tiab] OR "capture chromatography"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
      },
      europepmc: {
        query: `(harvest OR clarification OR centrifugation OR "depth filtration" OR "tangential flow filtration" OR flocculation OR turbidity OR "host cell protein" OR "impurity clearance") AND ${EPMC_ANCHOR}`,
      },
      rss: {
        terms: ['harvest', 'clarification', 'depth filt', 'centrifug', 'tangential flow', 'downstream', 'host cell protein', 'capture chromatography'],
      },
    },
  },

  {
    id: 'media_dev',
    name: 'Media & Feed Development',
    max_items: 10,
    scope: `Chemically defined media and feed design; amino acid and trace metal strategies; raw material variability and lot-to-lot control; media stability, photodegradation, and preparation; hydrolysate replacement.${MAMMALIAN_PREFERENCE}`,
    sources: {
      pubmed: {
        query: `("chemically defined medium"[tiab] OR "chemically defined media"[tiab] OR "cell culture medium"[tiab] OR "feed medium"[tiab] OR "amino acid"[tiab] OR "trace metal*"[tiab] OR "trace element*"[tiab] OR "hydrolysate"[tiab] OR "raw material variability"[tiab] OR "lot-to-lot"[tiab] OR "media stability"[tiab] OR "photodegradation"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
      },
      europepmc: {
        query: `("chemically defined medium" OR "cell culture medium" OR "feed medium" OR "trace metal" OR hydrolysate OR "raw material variability" OR "lot-to-lot" OR "media stability" OR photodegradation) AND ${EPMC_ANCHOR}`,
      },
      rss: {
        terms: ['cell culture media', 'culture medium', 'chemically defined', 'feed supplement', 'raw material', 'hydrolysate', 'single-use media'],
      },
    },
  },

  {
    id: 'intensification',
    name: 'Process Intensification & Continuous Manufacturing',
    max_items: 12,
    scope: `N-1 and N-stage perfusion; high inoculation density fed-batch; seed train intensification; connected and continuous processing; space-time yield and facility throughput; ATF/TFF perfusion hardware.${MAMMALIAN_PREFERENCE}`,
    sources: {
      pubmed: {
        query: `("process intensification"[tiab] OR "intensified"[tiab] OR "N-1 perfusion"[tiab] OR "seed train"[tiab] OR "high inoculation density"[tiab] OR "high seeding density"[tiab] OR "continuous manufacturing"[tiab] OR "continuous bioprocessing"[tiab] OR "integrated continuous"[tiab] OR "alternating tangential flow"[tiab] OR "space-time yield"[tiab] OR "perfusion"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
      },
      europepmc: {
        query: `("process intensification" OR "N-1 perfusion" OR "seed train" OR "high inoculation density" OR "continuous manufacturing" OR "continuous bioprocessing" OR "alternating tangential flow" OR "space-time yield") AND ${EPMC_ANCHOR}`,
      },
      biorxiv: {
        enabled: true,
        terms: ['perfusion', 'intensification', 'continuous bioprocess', 'seed train'],
      },
      rss: {
        terms: ['intensification', 'intensified', 'continuous manufactur', 'continuous bioprocess', 'perfusion', 'seed train', 'connected process', 'facility throughput'],
      },
    },
  },

  {
    id: 'modeling_ml',
    name: 'Process Modeling, Digital Twins & Statistical Learning',
    max_items: 15,
    // Deliberately the strictest rubric in the set: this category's queries reach
    // into chemical engineering, control theory, and applied statistics venues,
    // where most hits are generic ML with no bioprocess content at all.
    scope: `Mechanistic, hybrid (mechanistic + ML), and data-driven models of cell culture and bioprocess unit operations; digital twins and their qualification; Bayesian methods including hierarchical models, Bayesian DOE/optimal design, Bayesian scale-down model equivalence, and uncertainty quantification; machine learning applied to process development, clone/condition screening, and CQA prediction; kinetic and metabolic flux models used predictively; model validation, transferability, and lifecycle.

REQUIRED: the work must have an actual bioprocess, cell culture, or biomanufacturing application — not merely a mention, a motivating sentence, or a dataset borrowed from biology. A methods paper that names bioprocessing only in its introduction does not qualify. If the application domain is generic tabular data, chemistry, or another industry, score 0.${MAMMALIAN_PREFERENCE}`,
    sources: {
      // Broader than the other categories on purpose: relevant work here appears
      // outside the bioprocess journals, and Europe PMC + preprints index those
      // better than PubMed does.
      pubmed: {
        query: `("digital twin"[tiab] OR "hybrid model*"[tiab] OR "mechanistic model*"[tiab] OR "machine learning"[tiab] OR "deep learning"[tiab] OR "Bayesian"[tiab] OR "Gaussian process"[tiab] OR "metabolic flux"[tiab] OR "kinetic model*"[tiab] OR "design of experiments"[tiab] OR "uncertainty quantification"[tiab] OR "surrogate model*"[tiab] OR "transfer learning"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
      },
      europepmc: {
        // Broader than the shared anchor — this category has to reach chemical
        // engineering and applied statistics venues — but still mammalian-first,
        // with CMC vocabulary rather than the organism-agnostic terms that were
        // pulling in microbial fermentation modelling.
        query: `("digital twin" OR "hybrid model" OR "mechanistic model" OR "machine learning" OR "deep learning" OR Bayesian OR "Gaussian process" OR "metabolic flux" OR "kinetic model" OR "design of experiments" OR "uncertainty quantification" OR "surrogate model") AND (${epmcOr(ANCHOR_TERMS)} OR bioprocess* OR "critical quality attribute" OR "process development") NOT (${EPMC_OFF_TARGET})`,
        pageSize: 100,
        maxPages: 6,
      },
      biorxiv: {
        enabled: true,
        terms: ['digital twin', 'hybrid model', 'machine learning', 'bayesian', 'metabolic flux', 'bioprocess'],
      },
      arxiv: {
        enabled: true,
        // arXiv has no title-only NOT, so precision comes from the terms alone:
        // mammalian-specific, with "fermentation" dropped as the main microbial
        // magnet. Terms are OR'd and AND'd against the configured categories.
        query: '"cell culture" OR "mammalian cell" OR CHO OR bioreactor OR "monoclonal antibody" OR biomanufacturing OR "bioprocess"',
      },
      // Brief: modeling_ml skips trade press.
      rss: { enabled: false },
    },
  },

  {
    id: 'cmc_reg',
    name: 'CMC Regulatory & Guidance',
    max_items: 10,
    scope: `ICH guidelines (Q2(R2), Q5A, Q8–Q14) and their implementation; FDA and EMA guidance, draft guidance, and warning letter trends relevant to biologics CMC; PDA and BioPhorum technical reports; comparability and post-approval change management.`,
    sources: {
      // Brief: skip PubMed entirely, lean on RSS.
      pubmed: { enabled: false },
      europepmc: {
        query: `(ICH OR "post-approval change" OR comparability OR "regulatory guidance" OR "process validation" OR "control strategy" OR "quality by design") AND (biologic* OR biopharmaceutic* OR "monoclonal antibody" OR CMC OR "drug substance")`,
      },
      rss: { enabled: true, tags: ['regulatory', 'trade'] },
    },
  },

  {
    id: 'industry',
    name: 'Biopharma Industry News',
    max_items: 10,
    scope: `Manufacturing capacity and facility investment; CDMO landscape; biosimilar entry and its manufacturing implications; COGS, pricing and supply chain; approvals with notable manufacturing or modality angles.

REQUIRED: manufacturing relevance. Exclude pure clinical readouts, financial and market news with no manufacturing angle, and personnel announcements.`,
    sources: {
      // Brief: skip PubMed entirely, lean on RSS.
      pubmed: { enabled: false },
      europepmc: { enabled: false },
      rss: { enabled: true, tags: ['industry', 'trade', 'manufacturing'] },
    },
  },
];

// ---------------------------------------------------------------------------

const config = {
  // Which generator implementation stages 4-5 use. 'api' is the only one that
  // exists; a routine-based generator would add 'routine' here and nothing else.
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
    },
    summarize: {
      provider: 'anthropic',
      model: 'claude-opus-5',
      rates: { input: 5.0, output: 25.0 },
    },
    synthesize: {
      provider: 'anthropic',
      model: 'claude-opus-5',
      rates: { input: 5.0, output: 25.0 },
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

  ledger: {
    // Past this many entries the ledger shards by year (index/articles-YYYY.json).
    shardAfter: 5000,
  },

  sources,
  categories,
};

export default config;
