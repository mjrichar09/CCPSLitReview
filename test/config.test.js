import { test } from 'node:test';
import assert from 'node:assert/strict';

import realConfig from '../config/digest.config.js';
import { loadConfig, resolveSource, resolveFeeds } from '../lib/config.js';

/** A minimal valid config, cloned per test so mutations do not leak. */
function baseConfig() {
  return structuredClone({
    generator: 'api',
    relevance: { threshold: 3, batchSize: 25 },
    window: { defaultDays: 35 },
    ledger: { shardAfter: 5000 },
    models: {
      score: { provider: 'anthropic', model: 'm', rates: { input: 1, output: 5 } },
      summarize: { provider: 'anthropic', model: 'm', rates: { input: 5, output: 25 } },
      synthesize: { provider: 'anthropic', model: 'm', rates: { input: 5, output: 25 } },
    },
    sources: {
      pubmed: { enabled: true, query: 'default' },
      rss: { enabled: true, feeds: [{ id: 'a', name: 'A', url: 'https://a/feed', tags: ['trade'] }] },
    },
    categories: [
      {
        id: 'alpha',
        name: 'Alpha',
        max_items: 10,
        scope: 'A sufficiently long scope statement that acts as the relevance rubric for scoring.',
        sources: {},
      },
    ],
  });
}

test('the real config is valid', () => {
  assert.doesNotThrow(() => loadConfig(realConfig));
});

test('the real config matches the brief\'s per-source rules', () => {
  const c = loadConfig(realConfig);
  const on = (catId, source) =>
    resolveSource(c, c.categories.find((x) => x.id === catId), source).enabled;

  // cmc_reg and industry skip PubMed entirely.
  assert.equal(on('cmc_reg', 'pubmed'), false);
  assert.equal(on('industry', 'pubmed'), false);
  // modeling_ml skips trade press.
  assert.equal(on('modeling_ml', 'rss'), false);
  // bioRxiv/medRxiv only for the four named categories.
  for (const id of ['pat_control', 'upstream_pd', 'intensification', 'modeling_ml']) {
    assert.equal(on(id, 'biorxiv'), true, `${id} should search preprints`);
  }
  for (const id of ['harvest_dsp', 'media_dev', 'cmc_reg', 'industry']) {
    assert.equal(on(id, 'biorxiv'), false, `${id} should not search preprints`);
  }
  // arXiv is modeling_ml only.
  assert.equal(on('modeling_ml', 'arxiv'), true);
  assert.equal(on('upstream_pd', 'arxiv'), false);
});

test('every category has a unique id and a substantial scope', () => {
  const c = loadConfig(realConfig);
  assert.equal(new Set(c.categories.map((x) => x.id)).size, c.categories.length);
  for (const cat of c.categories) {
    assert.ok(cat.scope.length > 100, `${cat.id} scope is too thin to act as a rubric`);
  }
});

test('rejects a threshold outside 0-5', () => {
  const c = baseConfig();
  c.relevance.threshold = 9;
  assert.throws(() => loadConfig(c), /relevance\.threshold/);
});

test('rejects a missing model rate', () => {
  const c = baseConfig();
  delete c.models.score.rates.output;
  assert.throws(() => loadConfig(c), /models\.score\.rates\.output/);
});

test('rejects duplicate category ids', () => {
  const c = baseConfig();
  c.categories.push({ ...c.categories[0] });
  assert.throws(() => loadConfig(c), /duplicate category id/);
});

test('rejects an unknown source name', () => {
  const c = baseConfig();
  c.categories[0].sources.scopus = { enabled: true };
  assert.throws(() => loadConfig(c), /unknown source/);
});

test('rejects a thin scope statement', () => {
  const c = baseConfig();
  c.categories[0].scope = 'too short';
  assert.throws(() => loadConfig(c), /scope/);
});

test('rejects a source that is enabled but has no query', () => {
  const c = baseConfig();
  c.sources.pubmed.query = undefined;
  assert.throws(() => loadConfig(c), /sources\.pubmed\.query.*no query/s);
});

test('rejects duplicate feed ids', () => {
  const c = baseConfig();
  c.sources.rss.feeds.push({ id: 'a', name: 'Dup', url: 'https://b/feed' });
  assert.throws(() => loadConfig(c), /duplicate feed id/);
});

test('a category override can disable a globally enabled source', () => {
  const c = baseConfig();
  c.categories[0].sources.pubmed = { enabled: false };
  const resolved = resolveSource(c, c.categories[0], 'pubmed');
  assert.equal(resolved.enabled, false);
});

test('a category override can enable a globally disabled source and inherit defaults', () => {
  const c = baseConfig();
  c.sources.biorxiv = { enabled: false, mode: 'europepmc-ppr', rps: 2 };
  c.categories[0].sources.biorxiv = { enabled: true, terms: ['perfusion'] };
  const resolved = resolveSource(c, c.categories[0], 'biorxiv');
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.mode, 'europepmc-ppr', 'unspecified keys fall through to the global default');
  assert.deepEqual(resolved.terms, ['perfusion']);
});

test('feeds are selected by tag, and disabled feeds are skipped', () => {
  const c = baseConfig();
  c.sources.rss.feeds = [
    { id: 'trade1', name: 'T', url: 'https://t/feed', tags: ['trade'] },
    { id: 'reg1', name: 'R', url: 'https://r/feed', tags: ['regulatory'] },
    { id: 'off', name: 'O', url: 'https://o/feed', tags: ['trade'], enabled: false },
  ];
  c.categories[0].sources.rss = { enabled: true, tags: ['trade'] };

  const selected = resolveFeeds(c, c.categories[0]).map((f) => f.id);
  assert.deepEqual(selected, ['trade1'], 'tag filters, and enabled:false is excluded');
});

test('naming a disabled feed by id still selects it', () => {
  const c = baseConfig();
  c.sources.rss.feeds = [{ id: 'off', name: 'O', url: 'https://o/feed', enabled: false }];
  c.categories[0].sources.rss = { enabled: true, ids: ['off'] };
  assert.deepEqual(resolveFeeds(c, c.categories[0]).map((f) => f.id), ['off']);
});
