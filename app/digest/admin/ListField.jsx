'use client';

import { useState } from 'react';

/**
 * A list of strings edited as text — one per line, or comma-separated.
 *
 * Keeps its own text so typing a newline or a trailing comma is not
 * immediately normalised away; the parent gets the parsed list. The parent
 * re-keys this component when the list is replaced wholesale (switching
 * topic, loading a version), which is what resets the text — no effect
 * syncing state from props.
 *
 * `keepTrailingSpace` exists for the trade-press filter terms, where a
 * trailing space is deliberate: "pat " matches the word PAT without matching
 * inside "patent" or "patient".
 */
export default function ListField({
  id,
  value = [],
  onChange,
  separator = 'line',
  keepTrailingSpace = false,
  rows = 6,
  placeholder,
  disabled,
}) {
  const joiner = separator === 'line' ? '\n' : ', ';
  const [text, setText] = useState(() => value.join(joiner));

  const parse = (raw) =>
    raw
      .split(separator === 'line' ? '\n' : ',')
      .map((s) => (keepTrailingSpace ? s.trimStart() : s.trim()))
      .filter((s) => s.trim().length > 0);

  const onText = (e) => {
    setText(e.target.value);
    onChange(parse(e.target.value));
  };

  const props = { id, value: text, onChange: onText, placeholder, disabled, spellCheck: false };
  return separator === 'line' ? <textarea {...props} rows={rows} /> : <input type="text" {...props} />;
}
