/**
 * Topics and feeds as editable data, and the one function that turns them
 * into the categories the pipeline runs on.
 *
 * `config/topics.json` is the source of truth for what the digest covers. It
 * is edited from the site (/digest/admin/topics, admins only), saved to
 * Supabase as a numbered version, and copied back into the repo at the start
 * of each monthly run by `scripts/sync-topics.mjs` — so the month, the
 * routine, and the deployed site all see the same file. Hand-editing the file
 * in git is still fine; see `pickNewer` for how the two are reconciled.
 *
 * A topic in the file is a *spec*, not a finished category. The differences:
 *
 *   rubric + mammalian_preference  -> scope   (the rubric, plus the shared
 *                                              expression-system paragraph)
 *   keywords + anchor              -> sources.pubmed.query / europepmc.query,
 *                                     unless the spec supplies its own query
 *
 * Browser-safe: no Node imports, so the editor validates with exactly the
 * code the pipeline runs.
 */

// ---------------------------------------------------------------------------
// The bioprocess anchor: what makes a hit ours rather than merely biological.
//
// Two attempts at "weight this toward mammalian" were tried and measured before
// settling here, and both failed in instructive ways:
//
//   1. Restricting the anchor to mammalian terms only. It dropped ~40% of the
//      catch, including genuinely relevant organism-agnostic methods work
//      ("Raman-guided sample subset selection ... in bioprocesses") that never
//      names a cell line.
//   2. Expanding the mammalian vocabulary (HEK293, Vero, hybridoma, ADC,
//      therapeutic protein) to compensate. Those terms are ubiquitous in
//      clinical literature, so it imported cancer imaging and photoimmunotherapy
//      papers — worse noise than the problem it set out to fix.
//
// So the inclusion list stays close to the bioprocess vocabulary, and the
// weighting toward mammalian systems is applied in the scoring rubric instead
// (see MAMMALIAN_PREFERENCE) — a model can read an abstract and judge
// transferability; a query can only match strings.
//
// Left exactly as first written. Widening it — even just adding plurals —
// was measured to import tissue-engineering and clinical-imaging work
// ("bioreactors" catches perfusion bioreactors for microvessels; "monoclonal
// antibodies" catches photoimmunotherapy). The exclusion below is the only
// change this list needed.
// ---------------------------------------------------------------------------
export const ANCHOR_TERMS = [
  '"CHO"', '"Chinese hamster ovary"', '"mammalian cell"',
  '"cell culture"', '"bioreactor"', '"biomanufacturing"',
  '"monoclonal antibody"',
];

// Off-target expression systems, matched on TITLE only. A paper *about* Pichia
// says so in its title; a CHO or PAT paper that mentions yeast once in its
// abstract as a model organism must survive — matching these on the abstract
// was measured to kill real PAT and modelling papers.
export const OFF_TARGET = [
  'Escherichia coli', 'Saccharomyces', 'Pichia', 'Komagataella',
  'microalgae', 'microalgal', 'cyanobacteria', 'yeast',
  'plant cell', 'insect cell', 'insect cells',
  'Bacillus', 'Streptomyces', 'Corynebacterium',
];

export const MAMMALIAN_ANCHOR =
  `(${ANCHOR_TERMS.map((t) => `${t}[tiab]`).join(' OR ')} OR bioprocess*[tiab]) ` +
  `NOT (${OFF_TARGET.map((t) => `"${t}"[ti]`).join(' OR ')})`;

export const epmcOr = (terms) => terms.join(' OR ').replace(/"CHO"/, 'CHO');
export const EPMC_OFF_TARGET = OFF_TARGET.map((t) => `TITLE:"${t}"`).join(' OR ');

export const EPMC_ANCHOR = `(${epmcOr(ANCHOR_TERMS)} OR bioprocess*) NOT (${EPMC_OFF_TARGET})`;

/**
 * Appended to a topic's rubric when `mammalian_preference` is on. The fetch
 * anchor is deliberately broad enough to keep organism-agnostic methods work
 * (see MAMMALIAN_ANCHOR); this is where the mammalian preference is actually
 * applied, because the scoring model can read an abstract and judge
 * transferability, whereas a query can only pattern-match strings.
 */
export const MAMMALIAN_PREFERENCE = `

EXPRESSION SYSTEM — this weights the score, it is not a separate criterion. The reader runs mammalian cell culture, CHO above all. Score work in CHO, HEK293, NS0, hybridoma, or other mammalian systems at full value. Work in microbial (E. coli, yeast, Pichia), algal, plant, or insect systems scores 0 unless the method itself transfers directly to mammalian culture and the abstract gives enough detail to see that it does — a shared piece of hardware or a generic chemometric trick is not enough on its own. Work that names no expression system (methods, chemometrics, modelling, hardware) is judged on whether an upstream CHO group could apply it as described.`;

export const ANCHORS = ['bioprocess', 'none'];

/** Sources a topic may configure. crossref is enrichment-only and global. */
export const TOPIC_SOURCES = ['pubmed', 'europepmc', 'biorxiv', 'arxiv', 'rss'];

const ID_RE = /^[a-z][a-z0-9_]*$/;
const FEED_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

export function pubmedQuery(keywords, anchor = 'bioprocess') {
  const terms = `(${keywords.map((k) => `"${k}"[tiab]`).join(' OR ')})`;
  return anchor === 'bioprocess' ? `${terms} AND ${MAMMALIAN_ANCHOR}` : terms;
}

/** Europe PMC wants phrases quoted and single words bare (wildcards included). */
export function europepmcQuery(keywords, anchor = 'bioprocess') {
  const term = (k) => (/[\s-]/.test(k) ? `"${k}"` : k);
  const terms = `(${keywords.map(term).join(' OR ')})`;
  return anchor === 'bioprocess' ? `${terms} AND ${EPMC_ANCHOR}` : terms;
}

/**
 * Topic spec -> the category object the pipeline runs on. A source's own
 * `query` always wins over the keyword-built one; that is the escape hatch for
 * a search the keyword form cannot express.
 */
export function buildCategory(topic) {
  const { rubric, mammalian_preference, keywords = [], anchor = 'bioprocess', sources = {}, notes, ...rest } = topic;
  void notes; // Editor-facing only; the pipeline has no use for it.

  const built = {};
  for (const [sid, settings] of Object.entries(sources)) built[sid] = { ...settings };

  if (keywords.length > 0) {
    if (!built.pubmed?.query) built.pubmed = { ...built.pubmed, query: pubmedQuery(keywords, anchor) };
    if (!built.europepmc?.query) built.europepmc = { ...built.europepmc, query: europepmcQuery(keywords, anchor) };
  }

  // Key order matches the hand-written config this replaced, so a diff of the
  // resolved config before and after is empty.
  const ordered = {};
  for (const sid of ['pubmed', 'europepmc', ...Object.keys(built)]) {
    if (built[sid] && !(sid in ordered)) ordered[sid] = built[sid];
  }

  return {
    ...rest,
    scope: mammalian_preference ? `${rubric}${MAMMALIAN_PREFERENCE}` : rubric,
    sources: ordered,
  };
}

/** Put a topics document into a base config: categories and RSS feeds replaced, everything else kept. */
export function applyTopics(baseConfig, doc) {
  return {
    ...baseConfig,
    categories: doc.topics.map(buildCategory),
    sources: {
      ...baseConfig.sources,
      rss: { ...baseConfig.sources?.rss, feeds: doc.feeds },
    },
  };
}

// ---------------------------------------------------------------------------
// Validation of the document's own shape. loadConfig (lib/config.js) then
// validates the built config the same way it always has.
// ---------------------------------------------------------------------------

export function topicsDocErrors(doc) {
  const errors = [];
  const at = (path, msg) => errors.push(`${path}: ${msg}`);

  if (!doc || typeof doc !== 'object') return ['document: expected an object with "topics" and "feeds"'];

  if (!Array.isArray(doc.topics) || doc.topics.length === 0) {
    at('topics', 'must be a non-empty array');
  } else {
    const ids = new Set();
    doc.topics.forEach((t, i) => {
      const path = `topics[${i}]${t?.id ? ` (${t.id})` : ''}`;
      errors.push(...topicErrors(t).map((e) => `${path}.${e}`));
      if (t?.id) {
        if (ids.has(t.id)) at(path, `duplicate topic id "${t.id}"`);
        ids.add(t.id);
      }
    });
  }

  if (!Array.isArray(doc.feeds)) {
    at('feeds', 'must be an array');
  } else {
    const ids = new Set();
    doc.feeds.forEach((f, i) => {
      const path = `feeds[${i}]${f?.id ? ` (${f.id})` : ''}`;
      errors.push(...feedErrors(f).map((e) => `${path}.${e}`));
      if (f?.id) {
        if (ids.has(f.id)) at(path, `duplicate feed id "${f.id}"`);
        ids.add(f.id);
      }
    });
  }

  return errors;
}

/** Problems with one topic spec, as `field: message` strings. */
export function topicErrors(t) {
  const errors = [];
  const at = (field, msg) => errors.push(`${field}: ${msg}`);
  if (!t || typeof t !== 'object') return ['topic: expected an object'];

  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) {
    at('id', 'must be lowercase letters, digits and underscores, starting with a letter (e.g. "media_dev")');
  }
  if (typeof t.name !== 'string' || !t.name.trim()) at('name', 'missing');
  if (!Number.isInteger(t.max_items) || t.max_items < 1 || t.max_items > 50) at('max_items', 'must be a whole number from 1 to 50');
  if (typeof t.rubric !== 'string' || t.rubric.trim().length < 40) {
    at('rubric', 'must be at least a few sentences — it is what the scoring model judges every paper against');
  }
  if (t.mammalian_preference !== undefined && typeof t.mammalian_preference !== 'boolean') {
    at('mammalian_preference', 'must be true or false');
  }
  if (t.keywords !== undefined) {
    if (!Array.isArray(t.keywords) || t.keywords.some((k) => typeof k !== 'string' || !k.trim())) {
      at('keywords', 'must be a list of non-empty strings');
    } else if (t.keywords.some((k) => k.includes('"'))) {
      at('keywords', 'must not contain double quotes — they are added when the query is built');
    }
  }
  if (t.anchor !== undefined && !ANCHORS.includes(t.anchor)) at('anchor', `must be one of ${ANCHORS.join(', ')}`);
  if (t.notes !== undefined && typeof t.notes !== 'string') at('notes', 'must be text');

  const sources = t.sources ?? {};
  if (typeof sources !== 'object' || Array.isArray(sources)) {
    at('sources', 'must be an object');
  } else {
    for (const [sid, s] of Object.entries(sources)) {
      if (!TOPIC_SOURCES.includes(sid)) {
        at(`sources.${sid}`, `unknown source; known sources are ${TOPIC_SOURCES.join(', ')}`);
        continue;
      }
      if (!s || typeof s !== 'object') at(`sources.${sid}`, 'must be an object');
      else {
        if (s.enabled !== undefined && typeof s.enabled !== 'boolean') at(`sources.${sid}.enabled`, 'must be true or false');
        for (const list of ['terms', 'tags', 'ids']) {
          if (s[list] !== undefined && (!Array.isArray(s[list]) || s[list].some((x) => typeof x !== 'string'))) {
            at(`sources.${sid}.${list}`, 'must be a list of strings');
          }
        }
        if (s.query !== undefined && (typeof s.query !== 'string' || !s.query.trim())) {
          at(`sources.${sid}.query`, 'must be a non-empty string, or left out to build it from keywords');
        }
      }
    }
  }

  // arXiv with neither a query nor terms searches its whole subject
  // categories (stat.ML, cs.LG, ...) unfiltered — hundreds of off-topic papers.
  const arxiv = sources.arxiv ?? {};
  if (arxiv.enabled === true && !arxiv.query && !(arxiv.terms?.length > 0)) {
    at('sources.arxiv', 'is on but has no query or terms — it would pull in whole arXiv subject areas');
  }

  // A literature source that is on but has neither keywords nor a query
  // searches for nothing. pubmed and europepmc are on unless switched off.
  const hasKeywords = Array.isArray(t.keywords) && t.keywords.length > 0;
  for (const sid of ['pubmed', 'europepmc']) {
    const s = sources[sid] ?? {};
    if (s.enabled !== false && !s.query && !hasKeywords) {
      at('keywords', `needed: ${sid} is on and has no custom query (or switch ${sid} off)`);
      break;
    }
  }
  return errors;
}

/** Problems with one RSS feed entry. */
export function feedErrors(f) {
  const errors = [];
  const at = (field, msg) => errors.push(`${field}: ${msg}`);
  if (!f || typeof f !== 'object') return ['feed: expected an object'];
  if (typeof f.id !== 'string' || !FEED_ID_RE.test(f.id)) at('id', 'must be lowercase letters, digits and hyphens (e.g. "bioprocess-intl")');
  if (typeof f.name !== 'string' || !f.name.trim()) at('name', 'missing');
  if (typeof f.url !== 'string' || !/^https?:\/\/\S+$/.test(f.url)) at('url', 'must be an http(s) URL to the RSS or Atom feed itself');
  if (f.tags !== undefined && (!Array.isArray(f.tags) || f.tags.some((x) => typeof x !== 'string' || !x.trim()))) {
    at('tags', 'must be a list of words');
  }
  if (f.enabled !== undefined && typeof f.enabled !== 'boolean') at('enabled', 'must be true or false');
  return errors;
}

/**
 * Which topics document is current: the newest saved version in Supabase, or
 * the file committed to the repo? Each records the version it came from
 * (`version`, the Supabase row id; null for a file never synced). The newer
 * wins and a tie goes to the file — so a hand edit to the committed file is
 * never silently overwritten by an older saved version, and an edit saved on
 * the site is applied at the next run.
 */
export function pickNewer(fileDoc, savedRow) {
  if (!savedRow) return { source: 'file', doc: fileDoc };
  const fileVersion = fileDoc?.version ?? 0;
  if (savedRow.id > fileVersion) {
    return { source: 'saved', doc: { ...savedRow.body, version: savedRow.id, updated_at: savedRow.created_at } };
  }
  return { source: 'file', doc: fileDoc };
}
