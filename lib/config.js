import rawConfig from '../config/digest.config.js';

const ID_RE = /^[a-z][a-z0-9_]*$/;
const KNOWN_SOURCES = ['pubmed', 'europepmc', 'biorxiv', 'arxiv', 'crossref', 'rss'];
const STAGES = ['score', 'summarize', 'synthesize'];

/**
 * Validate the config and return it. Throws on the first problem with a message
 * that names the offending path — a bad config should fail at startup with a
 * pointer, not halfway through a fetch with a TypeError.
 */
export function loadConfig(config = rawConfig, { env = process.env } = {}) {
  const errors = [];
  const at = (path, msg) => errors.push(`${path}: ${msg}`);

  if (!config || typeof config !== 'object') {
    throw new Error('config: expected an object');
  }

  config = applyModelOverrides(config, env, at);
  config = applyBatchSizeOverride(config, env, at);

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
 * `DIGEST_MODEL_SCORE=openai/gpt-oss-120b` swaps one stage's model for one run.
 *
 * This exists so a comparison run — the same month scored on Haiku and on Groq —
 * is a workflow input rather than a config edit and a commit. The value must name
 * an entry in `knownModels`, which is what carries the provider and the rates:
 * a free-text model name would silently cost-account at the wrong price, and a
 * wrong cost table is worse than no cost table.
 */
function applyModelOverrides(config, env, at) {
  const overrides = {};
  for (const stage of STAGES) {
    const name = env?.[`DIGEST_MODEL_${stage.toUpperCase()}`]?.trim();
    if (!name) continue;
    const known = config.knownModels?.[name];
    if (!known) {
      at(
        `DIGEST_MODEL_${stage.toUpperCase()}`,
        `"${name}" is not in knownModels — add it there (with its provider and rates) before naming it`,
      );
      continue;
    }
    overrides[stage] = { ...config.models?.[stage], ...known, model: name };
  }
  if (Object.keys(overrides).length === 0) return config;
  return { ...config, models: { ...config.models, ...overrides } };
}

/**
 * `DIGEST_BATCH_SIZE=8` changes how many items go in one scoring call.
 *
 * This exists because batch size is a *provider* constraint, not a preference:
 * Groq answered a 25-item batch with `413 Payload Too Large`, so comparing it
 * against Haiku on the same month means sending Groq smaller batches. Keeping
 * that as a run-scoped override rather than a config edit is what stops a
 * provider experiment from quietly re-batching the Anthropic baseline too.
 */
function applyBatchSizeOverride(config, env, at) {
  const raw = env?.DIGEST_BATCH_SIZE?.trim();
  if (!raw) return config;
  const size = Number(raw);
  if (!Number.isInteger(size) || size < 1) {
    at('DIGEST_BATCH_SIZE', `must be a positive integer, got ${JSON.stringify(raw)}`);
    return config;
  }
  return { ...config, relevance: { ...config.relevance, batchSize: size } };
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
