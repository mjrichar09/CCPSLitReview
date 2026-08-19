'use client';

import { Children, useLayoutEffect, useMemo, useRef } from 'react';
import { useEngagement } from './Engagement.jsx';

const TRANSITION = 'transform 0.6s ease';

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
 * `itemIds` is a separate, plain prop rather than something read off each
 * child's props — `ItemRow` is itself a Server Component, so what actually
 * reaches this Client Component as `children` is its already-rendered host
 * output (`<li><details>...`), not a `<ItemRow item={...}>` element with
 * `item` still attached; the RSC boundary strips it. `itemIds` is
 * index-aligned with `children` (both come from the same `cat.items` array
 * in `CategoryPage`), which is what lets each rendered element be paired back
 * up with the real id its votes are stored under.
 *
 * `tallies` is an empty Map on the server and on first paint (Engagement's
 * fetch has not resolved yet), so the initial order is always the server's
 * relevance order — no hydration mismatch — and papers slide into vote order,
 * via a small FLIP animation rather than a jump, once tallies load or change.
 */
export default function SortableItemList({ itemIds, children }) {
  const engagement = useEngagement();
  const tallies = engagement?.tallies;
  const containerRef = useRef(null);
  const rectsRef = useRef(new Map());

  const items = Children.toArray(children);
  const sorted = useMemo(() => {
    const paired = items.map((el, i) => ({ el, id: itemIds[i] }));
    paired.sort((a, b) => net(tallies, b.id) - net(tallies, a.id));
    return paired.map((p) => p.el);
  }, [items, itemIds, tallies]);

  // The actual vote-driven order, as a plain string — stable across renders
  // that don't change it, unlike `sorted` itself (a fresh array every
  // render, since `items` is recomputed from `Children.toArray` every time).
  // Marking a paper read or favoriting it changes Engagement's context value
  // too, which re-renders this component same as a vote does; without this,
  // the FLIP effect below re-measured and "animated" on every one of those,
  // even though nothing had actually reordered — a stray sub-pixel reflow
  // from a button's text changing width was enough to trigger a visible
  // flicker across the whole list.
  const orderKey = useMemo(
    () => [...itemIds].sort((a, b) => net(tallies, b) - net(tallies, a)).join('|'),
    [itemIds, tallies],
  );

  // FLIP: capture each item's position from the previous render (keyed by the
  // stable slug id on ItemRow's <details>, not DOM order, since that is what
  // just changed), then after the reorder commits, slide each item from its
  // old spot to its new one instead of letting it jump. Keyed on `orderKey`
  // so it only runs when the order itself actually changed.
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
  }, [orderKey]);

  return (
    <ul className="item-list" ref={containerRef}>
      {sorted}
    </ul>
  );
}
