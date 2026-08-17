'use client';

/**
 * The @mention autocomplete dropdown under a comment textarea.
 *
 * Purely presentational: given the in-progress query and the page's
 * mentionable readers (`Engagement`'s `mentionable`, fetched once per page —
 * see Engagement.jsx), it filters and renders. `Comments.jsx` owns the
 * caret-tracking and the actual text replacement.
 */
export default function MentionPicker({ query, candidates, onSelect }) {
  if (query === null) return null;

  const matches = candidates.filter((c) => c.display_name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6);
  if (matches.length === 0) return null;

  return (
    <ul className="mention-picker" role="listbox">
      {matches.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className="mention-picker-item"
            role="option"
            aria-selected="false"
            // A textarea loses focus on mousedown before a click handler
            // fires; preventing default on mousedown keeps focus (and the
            // caret position the replacement needs) in the textarea.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(c.display_name)}
          >
            {c.display_name}
          </button>
        </li>
      ))}
    </ul>
  );
}
