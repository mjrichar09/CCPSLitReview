import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanKeyFigures, extractKeyFigures, figuresFor } from '../lib/keyFigures.js';
import { topicColor } from '../lib/topicColors.js';
import { TOPIC_COLORS, topicErrors } from '../lib/topics.js';
import { getCategoryTrend } from '../lib/digest.js';

test('cleanKeyFigures drops any figure whose numbers are not in the source text', () => {
  const source = 'On the test set it reached R2 = 0.991 and RMSE 1.09 g/L at 2,000 L scale.';
  assert.deepEqual(cleanKeyFigures(['R2 0.991', 'RMSE 1.09 g/L', 'Titer 9.9 g/L'], source), ['R2 0.991', 'RMSE 1.09 g/L']);
  // Thousands separators match either way.
  assert.deepEqual(cleanKeyFigures(['2000 L scale'], source), ['2000 L scale']);
  // No number, too long, duplicate, non-string: all dropped. At most three kept.
  assert.deepEqual(cleanKeyFigures(['fast', 'x'.repeat(40) + ' 0.991', 'R2 0.991', 'r2 0.991', 7], source), ['R2 0.991']);
  assert.equal(cleanKeyFigures(['R2 0.991', 'RMSE 1.09', '2,000 L', '1.09 g/L'], source).length, 3);
  assert.deepEqual(cleanKeyFigures(undefined, source), []);
});

test('extractKeyFigures lifts model fit, fold change, labelled absolute figures and scale', () => {
  assert.deepEqual(extractKeyFigures('On the test set it reached R2 = 0.991, RMSE 1.09 g/L and MAE 0.89 g/L.'), [
    'R² 0.991',
    'RMSE 1.09 g/L',
  ]);
  assert.deepEqual(extractKeyFigures('giving ~2-fold higher titer (1.2 g/L) with markedly lower lactate'), ['2-fold', 'Titer 1.2 g/L']);
  assert.deepEqual(extractKeyFigures('In-line Raman spectra from four distinct 1500-L commercial CHO fed-batch runs'), ['1500 L scale']);
  assert.deepEqual(extractKeyFigures('raised pool productivity 2- to 2.5-fold over separate-promoter vectors'), ['2.5-fold']);
});

test('extractKeyFigures refuses the ambiguous cases found in published summaries', () => {
  // Each of these produced a wrong chip under the first, looser patterns.
  assert.deepEqual(extractKeyFigures('held target VCD and mAb titer with ~31% loss in specific growth rate'), []);
  assert.deepEqual(extractKeyFigures('reaching up to 108.94% higher qP and 190.36% higher daily volumetric productivity'), []);
  assert.deepEqual(extractKeyFigures('raising QM7 viability in both 80% reduced-serum and trypsin conditions'), []);
  // Small volumes are not a manufacturing scale.
  assert.deepEqual(extractKeyFigures('in 15 mL ambr vessels and 2 L bioreactors'), []);
});

test('figuresFor prefers the model figures, even an empty list, over extraction', () => {
  const summary = 'reached R2 = 0.991';
  assert.deepEqual(figuresFor({ summary, key_figures: ['RMSE 1.09 g/L'] }), ['RMSE 1.09 g/L']);
  assert.deepEqual(figuresFor({ summary, key_figures: [] }), []);
  assert.deepEqual(figuresFor({ summary }), ['R² 0.991']);
});

test('topic colors: configured where set, a stable valid hue otherwise', () => {
  assert.equal(topicColor('pat_control'), 'blue');
  const removed = topicColor('a_topic_that_no_longer_exists');
  assert.ok(TOPIC_COLORS.includes(removed));
  assert.equal(topicColor('a_topic_that_no_longer_exists'), removed);
  const base = {
    id: 'x_topic',
    name: 'X',
    max_items: 5,
    rubric: 'A rubric long enough to pass the forty character minimum easily.',
    keywords: ['x'],
  };
  assert.deepEqual(topicErrors({ ...base, color: 'green' }), []);
  assert.match(topicErrors({ ...base, color: 'chartreuse' }).join(), /color/);
});

test('getCategoryTrend: oldest first, relevant from scoring stats, shown from the month', async () => {
  const trend = await getCategoryTrend('upstream_pd');
  assert.ok(trend.length >= 2);
  const months = trend.map((t) => t.month);
  assert.deepEqual(months, [...months].sort());
  for (const t of trend) {
    assert.ok(Number.isInteger(t.shown) && Number.isInteger(t.relevant));
    assert.ok(t.relevant >= t.shown, `${t.month}: relevant ${t.relevant} < shown ${t.shown}`);
  }
  assert.deepEqual(await getCategoryTrend('no_such_topic'), []);
});
