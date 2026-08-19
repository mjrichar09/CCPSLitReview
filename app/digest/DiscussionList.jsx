'use client';

import { Children, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';

/**
 * Filters the full, server-rendered archive down to papers that have at
 * least one comment, sorted most-discussed first.
 *
 * Same shape as `SortableItemList`/`FavoritesList`: the server renders every
 * `<ItemRow>` ever published, and this client leaf only ever hides or
 * reorders the elements it is handed. `comment_counts` is public (anyone can
 * read it, same as the comments themselves), so this needs no sign-in.
 *
 * `comment_counts` is grouped by (item_id, month) — a paper that recurred
 * across two months and was commented on in both would have two rows — so
 * counts are summed per item id here rather than trusted as one row each.
 */
export default function DiscussionList({ itemIds, children }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [totals, setTotals] = useState(null); // null = not loaded yet

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase
      .from('comment_counts')
      .select('item_id, total')
      .then(({ data }) => {
        if (!alive || !data) return;
        const summed = new Map();
        for (const row of data) {
          summed.set(row.item_id, (summed.get(row.item_id) ?? 0) + Number(row.total));
        }
        setTotals(summed);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (totals === null) return <p className="comments-empty">Loading…</p>;

  const items = Children.toArray(children);
  const matched = items
    .map((el, i) => ({ el, id: itemIds[i], total: totals.get(itemIds[i]) ?? 0 }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  if (matched.length === 0) {
    return <p className="comments-empty">No discussions yet — comment on a paper to start one.</p>;
  }

  return <ul className="item-list">{matched.map((p) => p.el)}</ul>;
}
