'use client';

import { Children, useLayoutEffect, useMemo, useRef } from 'react';
import { useEngagement } from './Engagement.jsx';

const TRANSITION = 'transform 0.3s ease';

function net(tallies, itemId) {
  const t = tallies?.get(itemId);
  return t ? t.up - t.down : 0;
}

/**
 * Wraps a category's already-server-rendered `<ItemRow>` elements and
 * re-sorts them by net votes (up - down), live, as tallies load and change.
 *
 * A client leaf, not a client page: it never imports or renders `ItemRow`
 * itself, only reorders the elements it is handed as `children` — the same
 * "client wrapper around server content" shape `Engagement` already uses, so
 * `CategoryPage` and `ItemRow` both stay server components.
 *
 * `tallies` is an empty Map on the server and on first paint (Engagement's
 * fetch has not resolved yet), so the initial order is always the server's
 * relevance order — no hydration mismatch — and papers slide into vote order,
 * via a small FLIP animation rather than a jump, once tallies load or change.
 */
export default function SortableItemList({ children }) {
  const engagement = useEngagement();
  const tallies = engagement?.tallies;
  const containerRef = useRef(null);
  const rectsRef = useRef(new Map());

  const items = Children.toArray(children);
  const sorted = useMemo(
    () => [...items].sort((a, b) => net(tallies, b.key) - net(tallies, a.key)),
    [items, tallies],
  );

  // FLIP: capture each item's position from the previous render (keyed by the
  // stable slug id on ItemRow's <details>, not DOM order, since that is what
  // just changed), then after the reorder commits, slide each item from its
  // old spot to its new one instead of letting it jump.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previous = rectsRef.current;
    const next = new Map();

    for (const node of container.children) {
      const key = node.firstElementChild?.id ?? null;
      const rect = node.getBoundingClientRect();
      if (key) next.set(key, rect);

      const before = key && previous.get(key);
      if (!before) continue;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (!dx && !dy) continue;

      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      // Force layout so the browser commits the starting transform before the
      // transition below applies — otherwise there is no "from" state to
      // animate away from.
      void node.offsetHeight;
      node.style.transition = TRANSITION;
      node.style.transform = '';
    }
    rectsRef.current = next;
  });

  return (
    <ul className="item-list" ref={containerRef}>
      {sorted}
    </ul>
  );
}
