'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 4; // px between the textarea and the dropdown
const MAX_HEIGHT = 240; // px; matches .mention-picker's max-height
const VIEWPORT_MARGIN = 8; // px kept clear of the window edge

/**
 * The @mention autocomplete dropdown under a comment textarea.
 *
 * Purely presentational: given the in-progress query and the page's
 * mentionable readers (`Engagement`'s `mentionable`, fetched once per page —
 * see Engagement.jsx), it filters and renders. `Comments.jsx` owns the
 * caret-tracking and the actual text replacement.
 *
 * Portaled to <body> and positioned `fixed` against the textarea (`anchorRef`)
 * rather than absolutely inside the comment form: the paper's `.item` card is
 * `overflow: hidden` for its rounded corners, which clipped the list to the
 * card and hid most of the readers. It opens upward when there is more room
 * above the textarea than below, and follows it on scroll and resize.
 */
// A soft cap, not a display limit — the box scrolls (see .mention-picker's
// max-height/overflow-y in globals.css) so this only exists to bound
// rendering if the reader list ever grows very large, not to hide anyone
// who matches the query.
const MAX_CANDIDATES = 50;

export default function MentionPicker({ query, candidates, onSelect, anchorRef }) {
  const matches =
    query === null
      ? []
      : candidates
          .filter((c) => c.display_name.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, MAX_CANDIDATES);
  const open = matches.length > 0;

  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
      const above = rect.top - GAP - VIEWPORT_MARGIN;
      const flip = below < Math.min(MAX_HEIGHT, 160) && above > below;
      setPosition({
        left: rect.left,
        minWidth: Math.min(rect.width, 320),
        maxHeight: Math.max(80, Math.min(MAX_HEIGHT, flip ? above : below)),
        ...(flip ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      });
    };
    place();
    // Capture phase so scrolling any ancestor, not just the window, re-places it.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef]);

  if (!open || !position) return null;

  return createPortal(
    <ul className="mention-picker" role="listbox" style={position}>
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
    </ul>,
    document.body,
  );
}
