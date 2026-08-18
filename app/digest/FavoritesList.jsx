'use client';

import { Children, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { useSession } from './SessionProvider.jsx';
import SignInButtons from './SignInButtons.jsx';

/**
 * Filters the full, server-rendered archive down to the signed-in reader's
 * favorites, sorted most-recently-favorited first.
 *
 * Same shape as `SortableItemList`: the server renders every `<ItemRow>`
 * ever published, and this client leaf only ever hides or reorders the
 * elements it is handed — it never imports or renders `ItemRow` itself.
 * `itemIds` is a separate, index-aligned prop rather than read off each
 * child's props, for the same reason `SortableItemList` needs it: `ItemRow`
 * is a Server Component, so what crosses into this Client Component as
 * `children` is its already-rendered host output, not a `<ItemRow
 * item={...}>` element with `item` still attached.
 */
export default function FavoritesList({ itemIds, children }) {
  const supabase = useMemo(() => getSupabase(), []);
  const { enabled, ready, user } = useSession();
  const [favorites, setFavorites] = useState(null); // null = not loaded yet

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    supabase
      .from('favorites')
      .select('item_id, created_at')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (alive && data) setFavorites(data);
      });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  if (!enabled || !ready) return null;

  if (!user) {
    return (
      <p className="comments-cta">
        <SignInButtons compact /> to see your favorites.
      </p>
    );
  }

  if (favorites === null) return <p className="comments-empty">Loading…</p>;

  if (favorites.length === 0) {
    return (
      <p className="comments-empty">
        No favorites yet — the star on any paper adds it here.
      </p>
    );
  }

  const favoritedAt = new Map(favorites.map((f) => [f.item_id, f.created_at]));
  const items = Children.toArray(children);
  const matched = items
    .map((el, i) => ({ el, id: itemIds[i] }))
    .filter((p) => favoritedAt.has(p.id))
    .sort((a, b) => favoritedAt.get(b.id).localeCompare(favoritedAt.get(a.id)));

  return <ul className="item-list">{matched.map((p) => p.el)}</ul>;
}
