import { test } from 'node:test';
import assert from 'node:assert/strict';

import { score } from '../lib/pipeline/score.js';
import { createUsageLedger } from '../lib/util/usage.js';

const config = {
  relevance: { threshold: 3, batchSize: 2 },
  models: { score: { provider: 'stub', model: 'stub-1', rates: { input: 1, output: 5 } } },
  categories: [
    { id: 'upstream_pd', name: 'Upstream', max_items: 5, scope: 'x'.repeat(60) },
    { id: 'modeling_ml', name: 'Modeling', max_items: 5, scope: 'y'.repeat(60) },
  ],
};

const items = (n, category = 'upstream_pd') =>
  Array.from({ length: n }, (_, i) => ({
    external_id: `pmid:${i}`,
    title: `Paper ${i}`,
    abstract: 'An abstract.',
    categories: [category],
  }));

/** A provider that answers with whatever `respond` produces, and counts calls. */
function stubProvider(respond) {
  const calls = [];
  return {
    provider: 'stub',
    model: 'stub-1',
    rates: { input: 1, output: 5 },
    calls,
    async complete(args) {
      calls.push(args);
      return {
        text: JSON.stringify(respond(args, calls.length - 1)),
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    },
  };
}

const allScored = (value) => (args) => {
  const n = (args.user.match(/^\[\d+\]/gm) ?? []).length;
  return { scores: Array.from({ length: n }, (_, i) => ({ index: i, relevance: value, categories: [], rationale: 'r' })) };
};

test('batches according to relevance.batchSize', async () => {
  const provider = stubProvider(allScored(5));
  await score({ items: items(5), config, provider });

  assert.equal(provider.calls.length, 3, '5 items at batchSize 2 is three calls');
});

test('keeps at or above the threshold and drops below it', async () => {
  const provider = stubProvider((args, call) => {
    const n = (args.user.match(/^\[\d+\]/gm) ?? []).length;
    // First batch scores 3 (the bar), second scores 2 (just under).
    const value = call === 0 ? 3 : 2;
    return { scores: Array.from({ length: n }, (_, i) => ({ index: i, relevance: value, categories: [], rationale: 'r' })) };
  });

  const result = await score({ items: items(4), config, provider });

  assert.equal(result.stats.kept, 2, 'threshold is inclusive');
  assert.equal(result.stats.dropped, 2);
  assert.equal(result.items[0].relevance, 3);
  assert.equal(result.dropped[0].relevance, 2);
});

test('a missing verdict halts rather than silently dropping the item', async () => {
  // A dropped item and an item judged irrelevant look identical downstream, so
  // an incomplete response must not be tolerated.
  const provider = stubProvider(() => ({ scores: [{ index: 0, relevance: 5, categories: [], rationale: 'r' }] }));

  await assert.rejects(
    () => score({ items: items(2), config, provider }),
    /no verdict for 1 of 2 items/,
  );
});

test('clamps an out-of-range score instead of trusting it', async () => {
  const provider = stubProvider(() => ({ scores: [{ index: 0, relevance: 99, categories: [], rationale: 'r' }] }));
  const result = await score({ items: items(1), config, provider });
  assert.equal(result.items[0].relevance, 5);
});

test('a model-suggested extra category is merged, and the scored category is always present', async () => {
  const provider = stubProvider(() => ({
    scores: [{ index: 0, relevance: 4, categories: ['modeling_ml'], rationale: 'r' }],
  }));
  const result = await score({ items: items(1), config, provider });
  assert.deepEqual(result.items[0].categories.sort(), ['modeling_ml', 'upstream_pd']);
  assert.equal(result.items[0].scored_for, 'upstream_pd');
});

test('scores each category separately and reports per-category tallies', async () => {
  const provider = stubProvider(allScored(4));
  const mixed = [...items(2, 'upstream_pd'), ...items(1, 'modeling_ml')];
  const result = await score({ items: mixed, config, provider });

  assert.equal(result.stats.by_category.upstream_pd.seen, 2);
  assert.equal(result.stats.by_category.modeling_ml.seen, 1);
});

test('records token usage per call into the ledger', async () => {
  const usage = createUsageLedger();
  const provider = stubProvider(allScored(4));
  await score({ items: items(4), config, usage, provider });

  const totals = usage.totals();
  assert.equal(totals.calls, 2);
  assert.equal(totals.input, 200);
  assert.equal(totals.output, 40);
});

test('reader feedback appears in the system prompt for its category when injected', async () => {
  const provider = stubProvider(allScored(4));
  const feedback = {
    enabled: true,
    byCategory: new Map([
      ['upstream_pd', [{ title: 'Paper Z', up: 5, down: 0, net: 5 }]],
      // modeling_ml deliberately has no entries.
    ]),
  };
  const mixed = [...items(1, 'upstream_pd'), ...items(1, 'modeling_ml')];
  await score({ items: mixed, config, provider, feedback });

  const upstreamCall = provider.calls.find((c) => c.system.includes('CATEGORY: Upstream'));
  const modelingCall = provider.calls.find((c) => c.system.includes('CATEGORY: Modeling'));
  assert.match(upstreamCall.system, /READER FEEDBACK/);
  assert.match(upstreamCall.system, /Paper Z/);
  assert.doesNotMatch(modelingCall.system, /READER FEEDBACK/, 'a category with no feedback entries gets no block');
});

test('no feedback block when feedback is absent or disabled', async () => {
  const provider = stubProvider(allScored(4));
  await score({ items: items(1), config, provider, feedback: { enabled: false, byCategory: new Map() } });
  assert.doesNotMatch(provider.calls[0].system, /READER FEEDBACK/);
});

test('the rubric is sent as a cacheable system prompt, not repeated in the user turn', async () => {
  const provider = stubProvider(allScored(4));
  await score({ items: items(2), config, provider });

  const call = provider.calls[0];
  assert.match(call.system, /SCOPE/, 'the scope statement rides in the system prompt');
  assert.ok(call.schema, 'a JSON schema constrains the response');
  assert.doesNotMatch(call.user, /SCOPE/, 'and is not duplicated per batch');
});

/** A stub whose calls finish out of the order they were made in. */
function racingProvider(delayFor) {
  const started = [];
  return {
    provider: 'stub',
    model: 'stub-1',
    rates: { input: 1, output: 5 },
    started,
    async complete(args) {
      started.push({ user: args.user, system: args.system });
      const n = (args.user.match(/^\[\d+\]/gm) ?? []).length;
      await new Promise((r) => setTimeout(r, delayFor(args.user)));
      return {
        text: JSON.stringify({
          scores: Array.from({ length: n }, (_, i) => ({ index: i, relevance: 4, categories: [], rationale: 'r' })),
        }),
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    },
  };
}

test('results are applied in batch order even when the calls finish out of order', async () => {
  // Batches run concurrently, so completion order is not input order. The report
  // must still be reproducible from its inputs: a run that reorders items
  // depending on which API call happened to return first is not.
  const provider = racingProvider((user) => (user.includes('Paper 2') ? 40 : 1));
  const result = await score({ items: items(6), config, provider });

  assert.deepEqual(
    result.items.map((i) => i.title),
    ['Paper 0', 'Paper 1', 'Paper 2', 'Paper 3', 'Paper 4', 'Paper 5'],
  );
});

test('the first batch of every category is issued before any second batch, so the rubric cache is written once', async () => {
  // Firing same-category batches together would have each miss the cache and
  // re-write it, which is the whole saving on the highest-volume stage.
  const provider = racingProvider(() => 5);
  const mixed = [...items(4, 'upstream_pd'), ...items(4, 'modeling_ml')];
  await score({ items: mixed, config, provider });

  assert.equal(provider.started.length, 4, '4 items per category at batchSize 2 is two batches each');
  const firstWave = provider.started.slice(0, 2).map((c) => c.system);
  assert.equal(new Set(firstWave).size, 2, 'the opening calls carry two different rubrics — one cache write each');
});
