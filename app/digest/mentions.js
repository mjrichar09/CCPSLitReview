const MAX_QUERY_LENGTH = 40;

/**
 * The partial "@name" immediately before the caret, if the caret sits inside
 * one — or `null` if it does not. Display names can hold spaces ("Jane
 * Doe"), so the query is everything after the nearest `@` back to the start
 * of the line, not just the current word; it is capped in length so a
 * paragraph typed after an unrelated `@` eventually stops being treated as a
 * mention in progress.
 */
export function activeMentionQuery(text, caretIndex) {
  const before = text.slice(0, caretIndex);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;

  // An email-shaped "name@domain" is not a mention: the `@` must open a
  // fresh token, not sit mid-word.
  const prev = before[at - 1];
  if (at > 0 && prev !== undefined && !/\s/.test(prev)) return null;

  const candidate = before.slice(at + 1);
  if (candidate.includes('\n') || candidate.length > MAX_QUERY_LENGTH) return null;
  return candidate;
}

/** Replace the active "@query" at the caret with a chosen display name. */
export function applyMention(text, caretIndex, displayName) {
  const before = text.slice(0, caretIndex);
  const after = text.slice(caretIndex);
  const at = before.lastIndexOf('@');
  if (at === -1) return { text, caretIndex };

  const newBefore = `${before.slice(0, at)}@${displayName} `;
  return { text: newBefore + after, caretIndex: newBefore.length };
}
