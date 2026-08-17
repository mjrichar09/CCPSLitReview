import { test } from 'node:test';
import assert from 'node:assert/strict';

import { activeMentionQuery, applyMention } from '../app/digest/mentions.js';

test('no @ before the caret yields no active query', () => {
  assert.equal(activeMentionQuery('hello there', 5), null);
});

test('typing right after @ yields an empty query', () => {
  assert.equal(activeMentionQuery('hi @', 4), '');
});

test('the query is the text from @ to the caret', () => {
  assert.equal(activeMentionQuery('hi @Jan', 7), 'Jan');
});

test('a multi-word display name stays active across the space', () => {
  assert.equal(activeMentionQuery('hi @Jane Do', 11), 'Jane Do');
});

test('an email-shaped token is not a mention', () => {
  assert.equal(activeMentionQuery('reach me at name@example.com', 20), null);
});

test('a newline ends the mention', () => {
  assert.equal(activeMentionQuery('@Jane\nDoe', 9), null);
});

test('a very long run after @ is no longer treated as an in-progress mention', () => {
  const text = `@${'x'.repeat(41)}`;
  assert.equal(activeMentionQuery(text, text.length), null);
});

test('a second @ starts a fresh query, ignoring the earlier one', () => {
  assert.equal(activeMentionQuery('hi @old and @Jan', 16), 'Jan');
});

test('applyMention replaces the active token with the chosen name and a trailing space', () => {
  const result = applyMention('hi @Jan', 7, 'Jane Doe');
  assert.equal(result.text, 'hi @Jane Doe ');
  assert.equal(result.caretIndex, 13);
});

test('applyMention preserves text after the caret', () => {
  const result = applyMention('hi @Jan, welcome', 7, 'Jane Doe');
  assert.equal(result.text, 'hi @Jane Doe , welcome');
});

test('applyMention is a no-op with no active @ token', () => {
  const result = applyMention('hello there', 5, 'Jane Doe');
  assert.deepEqual(result, { text: 'hello there', caretIndex: 5 });
});
