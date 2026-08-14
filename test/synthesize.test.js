import { test } from 'node:test';
import assert from 'node:assert/strict';

import { synthesize } from '../lib/pipeline/synthesize.js';

const config = {
  models: { synthesize: { provider: 'stub', model: 'stub-1', rates: { input: 5, output: 25 } } },
  top_items: 3,
  categories: [
    { id: 'upstream_pd', name: 'Upstream', max_items: 5, scope: 'x'.repeat(60) },
    { id: 'modeling_ml', name: 'Modeling', max_items: 5, scope: 'y'.repeat(60) },
  ],
};

const paper = (id, over = {}) => ({
  external_id: `doi:${id}`,
  title: `Paper ${id}`,
  summary: `summary ${id}`,
  why_it_matters: `matters ${id}`,
  relevance: 4,
  published: '2026-08-01',
  scored_in: ['upstream_pd'],
  ...over,
});

/** Routes each generate() call by the shape of the schema it was given. */
function stubGenerator({ top } = {}) {
  return {
    async generate({ schema }) {
      if (schema.properties.synthesis) return { synthesis: 'a narrative' };
      if (schema.properties.summary) return { summary: 'an overview' };
      return { top: top ?? [] };
    },
  };
}

test('writes one narrative per category that actually has papers', async () => {
  const result = await synthesize({
    items: [paper('a'), paper('b')],
    config,
    month: '2026-08',
    generator: stubGenerator(),
  });

  assert.equal(result.narratives.length, 1, 'modeling_ml had no papers and gets no empty section');
  assert.equal(result.narratives[0].id, 'upstream_pd');
  assert.equal(result.summary, 'an overview');
});

test('a paper in two categories appears in both narratives', async () => {
  const result = await synthesize({
    items: [paper('shared', { scored_in: ['upstream_pd', 'modeling_ml'] })],
    config,
    month: '2026-08',
    generator: stubGenerator(),
  });
  assert.deepEqual(result.narratives.map((n) => n.id).sort(), ['modeling_ml', 'upstream_pd']);
});

test('an invented Top-5 id is discarded and the slot backfilled', async () => {
  // A hallucinated id would render as a missing entry in the most prominent
  // section of the report, so the list is constrained to ids that exist.
  const items = [paper('a', { relevance: 5 }), paper('b', { relevance: 4 }), paper('c', { relevance: 3 })];
  const generator = stubGenerator({
    top: [
      { id: 'doi:b', reason: 'real' },
      { id: 'doi:does-not-exist', reason: 'invented' },
    ],
  });

  const result = await synthesize({ items, config, month: '2026-08', generator });

  const ids = result.top_items.map((t) => t.id);
  assert.equal(ids.length, 3, 'backfilled to top_items');
  assert.ok(!ids.includes('doi:does-not-exist'));
  assert.equal(ids[0], 'doi:b', 'the model\'s real pick keeps its ranking');
  assert.deepEqual(ids.slice(1), ['doi:a', 'doi:c'], 'backfill runs highest relevance first');
});

test('a duplicated id in the model response is not given two slots', async () => {
  const items = [paper('a'), paper('b')];
  const generator = stubGenerator({
    top: [{ id: 'doi:a', reason: 'one' }, { id: 'doi:a', reason: 'again' }],
  });
  const result = await synthesize({ items, config, month: '2026-08', generator });
  assert.deepEqual(result.top_items.map((t) => t.id), ['doi:a', 'doi:b']);
});
