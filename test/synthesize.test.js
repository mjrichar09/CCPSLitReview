import { test } from 'node:test';
import assert from 'node:assert/strict';

import { synthesize } from '../lib/pipeline/synthesize.js';

const config = {
  models: { synthesize: { provider: 'stub', model: 'stub-1', rates: { input: 5, output: 25 } } },
  top_items: 3,
  // Off by default here so these tests never read the repo's real month files;
  // the cross-month tests below inject a history explicitly instead.
  history: { back: 0 },
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

// --- cross-month memory ----------------------------------------------------

/** Records every prompt the stage sends, keyed by which call it was. */
function recordingGenerator() {
  const calls = { narrative: [], top: [], overview: [] };
  return {
    calls,
    async generate({ schema, system, user }) {
      if (schema.properties.synthesis) {
        calls.narrative.push({ system, user });
        return { synthesis: 'a narrative' };
      }
      if (schema.properties.summary) {
        calls.overview.push({ system, user });
        return { summary: 'an overview' };
      }
      calls.top.push({ system, user });
      return { top: [] };
    },
  };
}

const history = {
  months: ['2026-07', '2026-06'],
  byCategory: new Map([
    [
      'upstream_pd',
      [
        { month: '2026-07', synthesis: 'july said perfusion media held titer' },
        { month: '2026-06', synthesis: 'june said nothing moved' },
      ],
    ],
  ]),
  overviews: [
    { month: '2026-07', summary: 'july overview', top: [{ title: 'July Paper', reason: 'because' }] },
    { month: '2026-06', summary: 'june overview', top: [] },
  ],
};

test('prior narratives reach the category prompt, oldest first', async () => {
  const generator = recordingGenerator();
  await synthesize({ items: [paper('a')], config, month: '2026-08', generator, history });

  const { system } = generator.calls.narrative[0];
  assert.match(system, /PREVIOUS MONTHS IN THIS CATEGORY/);
  assert.ok(
    system.indexOf('june said nothing moved') < system.indexOf('july said perfusion media held titer'),
    'oldest first, so the model reads the months in the order they happened',
  );
});

test('every prompt carrying history also carries the no-invented-continuity guard', async () => {
  const generator = recordingGenerator();
  await synthesize({ items: [paper('a')], config, month: '2026-08', generator, history });

  for (const [kind, calls] of Object.entries(generator.calls)) {
    assert.match(calls[0].system, /context for contrast and continuity only/, `${kind} prompt is unfenced`);
  }
});

test('the Top-N and overview prompts see what the reader was shown last month', async () => {
  const generator = recordingGenerator();
  await synthesize({ items: [paper('a')], config, month: '2026-08', generator, history });

  assert.match(generator.calls.top[0].system, /July Paper/);
  assert.match(generator.calls.overview[0].system, /july overview/);
});

test('a category with no prior narrative gets no empty heading', async () => {
  // modeling_ml has papers this month but no history: the block must be absent
  // entirely rather than an empty section the model might try to fill.
  const generator = recordingGenerator();
  await synthesize({
    items: [paper('a', { scored_in: ['modeling_ml'] })],
    config,
    month: '2026-08',
    generator,
    history,
  });
  assert.doesNotMatch(generator.calls.narrative[0].system, /PREVIOUS MONTHS/);
});

test('the first-ever month sends prompts with no history section at all', async () => {
  const generator = recordingGenerator();
  const empty = { months: [], byCategory: new Map(), overviews: [] };
  await synthesize({ items: [paper('a')], config, month: '2026-08', generator, history: empty });

  for (const calls of Object.values(generator.calls)) {
    assert.doesNotMatch(calls[0].system, /PREVIOUS MONTH|RECENTLY HIGHLIGHTED|continuity only/);
  }
});
