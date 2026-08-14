import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tidyStrings } from '../lib/generate/index.js';

test('repairs a numeric range mangled into a newline plus "dash"', () => {
  // Observed live: "1.6\ndash7.4-fold" in the editorial overview.
  assert.equal(tidyStrings('titer rose 1.6\ndash7.4-fold overall'), 'titer rose 1.6–7.4-fold overall');
  assert.equal(tidyStrings('models approved 2012\ndash2025 show'), 'models approved 2012–2025 show');
});

test('a stray mid-sentence newline becomes a space, not an invented dash', () => {
  // Dropping punctuation the model may not have meant is safer than adding
  // punctuation it did not write.
  assert.equal(tidyStrings('which node\n galactosylation versus fucosylation\n and that decides'),
    'which node galactosylation versus fucosylation and that decides');
});

test('leaves clean prose untouched', () => {
  const clean = 'A 2-fold titer lift with charge variants shifting under 3%.';
  assert.equal(tidyStrings(clean), clean);
});

test('walks nested objects and arrays, and leaves non-strings alone', () => {
  const input = { summaries: [{ index: 0, summary: 'a\nb', thin_abstract: true }] };
  assert.deepEqual(tidyStrings(input), { summaries: [{ index: 0, summary: 'a b', thin_abstract: true }] });
});
