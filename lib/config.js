import rawConfig from '../config/digest.config.js';

const ID_RE = /^[a-z][a-z0-9_]*$/;
const KNOWN_SOURCES = ['pubmed', 'europepmc', 'biorxiv', 'arxiv', 'crossref', 'rss'];
const STAGES = ['score', 'summarize', 'synthesize'];

/**
 * Validate the config and return it. Throws on the first problem with a message
 * that names the offending path — a bad config should fail at startup with a
 * pointer, not halfway through a fetch with a TypeError.
 */
export function loadConfig(config = rawConfig) {
  const errors = [];
  const at = (path, msg) => errors.push(`${path}: ${msg}`);

  if (!config || typeof config !== 'object') {
    throw new Error('config: expected an object');
  }

  // --- relevance / window / ledger -----------------------------------------
  const threshold = config.relevance?.threshold;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 5) {
    at('relevance.threshold', `must be an integer 0-5, got ${JSON.stringify(threshold)}`);
  }
  const batchSize = config.relevance?.batchSize;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    at('relevance.batchSize', `must be a positive integer, got ${JSON.stringify(batchSize)}`);
  }
  const defaultDays = config.window?.defaultDays;
  if (!Number.isInteger(defaultDays) || defaultDays < 1) {
    at('window.defaultDays', `must be a positive integer, got ${JSON.stringify(defaultDays)}`);
  }
  const shardAfter = config.ledger?.shardAfter;
  if (!Number.isInteger(shardAfter) || shardAfter < 1) {
    at('ledger.shardAfter', `must be a positive integer, got ${JSON.stringify(shardAfter)}`);
  }

  // --- models ---------------------------------------------------------------
  for (const stage of STAGES) {
    const m = config.models?.[stage];
    const path = `models.${stage}`;
    if (!m || typeof m !== 'object') {
      at(path, 'missing');
      continue;
    }
    if (!m.provider) at(`${path}.provider`, 'missing');
    if (!m.model) at(`${path}.model`, 'missing');
    for (const kind of ['input', 'output']) {
      const rate = m.rates?.[kind];
      if (typeof rate !== 'number' || !(rate >= 0)) {
        at(`${path}.rates.${kind}`, `must be a non-negative number (USD per million tokens), got ${JSON.stringify(rate)}`);
      }
    }
  }

  // --- sources --------------------------------------------------------------
  for (const id of Object.keys(config.sources ?? {})) {
    if (!KNOWN_SOURCES.includes(id)) {
      at(`sources.${id}`, `unknown source; known sources are ${KNOWN_SOURCES.join(', ')}`);
    }
  }
  const feeds = config.sources?.rss?.feeds;
  if (!Array.isArray(feeds)) {
    at('sources.rss.feeds', 'must be an array');
  } else {
    const seen = new Set();
    feeds.forEach((f, i) => {
      const path = `sources.rss.feeds[${i}]`;
      if (!f?.id) at(path, 'missing id');
      else if (seen.has(f.id)) at(path, `duplicate feed id "${f.id}"`);
      else seen.add(f.id);
      if (!f?.url) at(path, 'missing url');
      if (f?.tags && !Array.isArray(f.tags)) at(`${path}.tags`, 'must be an array of strings');
    });
  }

  // --- categories -----------------------------------------------------------
  if (!Array.isArray(config.categories) || config.categories.length === 0) {
    at('categories', 'must be a non-empty array');
  } else {
    const seen = new Set();
    config.categories.forEach((c, i) => {
      const path = `categories[${i}]`;
      if (!c?.id) {
        at(path, 'missing id');
      } else {
        if (!ID_RE.test(c.id)) at(`${path}.id`, `must match ${ID_RE} (lowercase, digits, underscore), got "${c.id}"`);
        if (seen.has(c.id)) at(`${path}.id`, `duplicate category id "${c.id}"`);
        seen.add(c.id);
      }
      if (!c?.name) at(`${path}.name`, 'missing');
      if (typeof c?.scope !== 'string' || c.scope.trim().length < 40) {
        at(`${path}.scope`, 'must be a substantial string — it is the relevance rubric the scoring model sees');
      }
      if (!Number.isInteger(c?.max_items) || c.max_items < 1) {
        at(`${path}.max_items`, `must be a positive integer, got ${JSON.stringify(c?.max_items)}`);
      }
      for (const sid of Object.keys(c?.sources ?? {})) {
        if (!KNOWN_SOURCES.includes(sid)) {
          at(`${path}.sources.${sid}`, `unknown source; known sources are ${KNOWN_SOURCES.join(', ')}`);
        }
      }
      // A source that is enabled for this category but has no way to search is
      // a silent no-op at runtime — catch it here instead.
      for (const sid of ['pubmed', 'europepmc']) {
        const resolved = resolveSource(config, c, sid);
        if (resolved.enabled && !resolved.query) {
          at(`${path}.sources.${sid}.query`, 'enabled but has no query');
        }
      }
    });
  }

  if (errors.length > 0) {
    throw new Error(`Invalid digest config:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}

/**
 * Merge a source's global defaults with a category's overrides.
 * Returns `{ enabled, ...settings }`; callers check `enabled` first.
 */
export function resolveSource(config, category, sourceId) {
  const base = config.sources?.[sourceId] ?? {};
  const override = category?.sources?.[sourceId] ?? {};
  const merged = { ...base, ...override };
  // An override may enable a source that is off by default (biorxiv, arxiv) or
  // disable one that is on (pubmed for cmc_reg/industry).
  merged.enabled = override.enabled ?? base.enabled ?? false;
  return merged;
}

/**
 * Feeds selected for a category: by explicit ids, else by tag, else all.
 * A feed with `enabled: false` is skipped unless named explicitly by id.
 */
export function resolveFeeds(config, category) {
  const settings = resolveSource(config, category, 'rss');
  const all = config.sources?.rss?.feeds ?? [];
  if (Array.isArray(settings.ids) && settings.ids.length > 0) {
    return all.filter((f) => settings.ids.includes(f.id));
  }
  const live = all.filter((f) => f.enabled !== false);
  if (Array.isArray(settings.tags) && settings.tags.length > 0) {
    return live.filter((f) => (f.tags ?? []).some((t) => settings.tags.includes(t)));
  }
  return live;
}

export default loadConfig;
