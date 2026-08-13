import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createUsageLedger } from '../lib/util/usage.js';

const RATES = { input: 1, output: 5 }; // USD per million tokens

test('costs input and output at their own rates', () => {
  const u = createUsageLedger();
  u.record({
    stage: 'score', provider: 'anthropic', model: 'm', rates: RATES,
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
  });
  assert.equal(u.totals().cost, 6);
});

test('cache reads bill at a tenth of the input rate and writes at 1.25x', () => {
  // Scoring sends the same rubric with every batch, so this multiplier is the
  // dominant term in that stage — getting it wrong misreports the whole bill.
  const u = createUsageLedger();
  u.record({
    stage: 'score', provider: 'anthropic', model: 'm', rates: RATES,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
  });
  assert.equal(u.totals().cost, 0.1);

  const w = createUsageLedger();
  w.record({
    stage: 'score', provider: 'anthropic', model: 'm', rates: RATES,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
  });
  assert.equal(w.totals().cost, 1.25);
});

test('accumulates repeated calls into one row per stage and model', () => {
  const u = createUsageLedger();
  for (let i = 0; i < 3; i++) {
    u.record({ stage: 'score', provider: 'anthropic', model: 'm', rates: RATES, usage: { input_tokens: 10, output_tokens: 2 } });
  }
  assert.equal(u.rows().length, 1);
  assert.equal(u.rows()[0].calls, 3);
  assert.equal(u.totals().calls, 3);
});

test('keeps stages and models on separate rows', () => {
  const u = createUsageLedger();
  u.record({ stage: 'score', provider: 'groq', model: 'a', rates: RATES, usage: { input_tokens: 1, output_tokens: 1 } });
  u.record({ stage: 'summarize', provider: 'anthropic', model: 'b', rates: RATES, usage: { input_tokens: 1, output_tokens: 1 } });
  u.record({ stage: 'summarize', provider: 'anthropic', model: 'c', rates: RATES, usage: { input_tokens: 1, output_tokens: 1 } });
  assert.equal(u.rows().length, 3);
});

test('totals count cached tokens as input', () => {
  const u = createUsageLedger();
  u.record({
    stage: 'score', provider: 'anthropic', model: 'm', rates: RATES,
    usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
  });
  assert.equal(u.totals().input, 17);
  assert.equal(u.totals().output, 1);
});

test('serialises a run_stats shape broken out by stage', () => {
  const u = createUsageLedger();
  u.record({ stage: 'score', provider: 'anthropic', model: 'm', rates: RATES, usage: { input_tokens: 1_000_000, output_tokens: 0 } });
  const json = u.toJSON({ month: '2026-08' });

  assert.equal(json.month, '2026-08');
  assert.equal(json.total_cost_usd, 1);
  assert.equal(json.by_stage.length, 1);
  assert.equal(json.by_stage[0].stage, 'score');
  assert.equal(json.by_stage[0].cost_usd, 1);
});

test('a zero-rate model costs nothing rather than NaN', () => {
  const u = createUsageLedger();
  u.record({ stage: 'score', provider: 'x', model: 'm', rates: undefined, usage: { input_tokens: 100, output_tokens: 100 } });
  assert.equal(u.totals().cost, 0);
});
