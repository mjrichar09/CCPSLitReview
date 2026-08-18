'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { useSession } from './SessionProvider.jsx';

/**
 * Vote tallies and comment counts for every paper on one page.
 *
 * Deliberately page-level rather than per-item: a section can carry thirty
 * papers, and thirty components each fetching their own counts is thirty round
 * trips for data that two queries answer. Comment *bodies* are not fetched here
 * - those load per paper, when a reader actually expands one.
 *
 * Reads are anonymous-friendly (the select policies allow it), so counts appear
 * whether or not anyone is signed in.
 */

const EngagementContext = createContext(null);

/** Stable empty map/set, so a signed-out render does not churn a new one each time. */
const EMPTY = new Map();
const EMPTY_SET = new Set();

export const useEngagement = () => useContext(EngagementContext);

export default function Engagement({ itemMonths, itemIds, children }) {
  const supabase = useMemo(() => getSupabase(), []);
  const { user, approved } = useSession();
  const [tallies, setTallies] = useState(() => new Map());
  const [counts, setCounts] = useState(() => new Map());
  const [mineFor, setMine] = useState({ id: null, map: EMPTY });
  const [mentionable, setMentionable] = useState(() => []);
  const [readFor, setRead] = useState({ id: null, set: EMPTY_SET });
  const [favoriteFor, setFavorite] = useState({ id: null, set: EMPTY_SET });

  // itemIds is a fresh array each render; join it so the effects below key on
  // the contents rather than the identity and do not refetch on every render.
  const key = useMemo(() => itemIds.join(' '), [itemIds]);

  useEffect(() => {
    if (!supabase) return undefined;
    const ids = key ? key.split(' ') : [];
    if (ids.length === 0) return undefined;
    let alive = true;

    supabase
      .from('vote_tallies')
      .select('item_id, up, down')
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setTallies(new Map(data.map((r) => [r.item_id, { up: r.up, down: r.down }])));
      });

    supabase
      .from('comment_counts')
      .select('item_id, total')
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setCounts(new Map(data.map((r) => [r.item_id, Number(r.total)])));
      });

    return () => {
      alive = false;
    };
  }, [supabase, key]);

  /**
   * Every approved reader's display name, for the @mention picker.
   *
   * Fetched once per page mount rather than keyed to `itemIds`: unlike
   * tallies and counts, this list does not vary per paper, so there is
   * nothing to refetch as the page's item set changes. Reuses the existing
   * `profiles_select_approved` read policy — no new policy needed.
   */
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('approved', true)
      .then(({ data }) => {
        if (alive && data) setMentionable(data);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);

  /**
   * Which of these papers the current reader has already voted on.
   *
   * Held together with the user id it belongs to, and derived below, for the
   * same reason as the profile in SessionProvider: clearing it on sign-out via
   * an effect would be a synchronous setState in an effect body. Pairing it
   * with the id also means one reader's votes can never flash up under another
   * reader's session.
   */
  useEffect(() => {
    if (!supabase || !user) return undefined;
    const ids = key ? key.split(' ') : [];
    if (ids.length === 0) return undefined;
    let alive = true;
    supabase
      .from('votes')
      .select('item_id, value')
      .eq('user_id', user.id)
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setMine({ id: user.id, map: new Map(data.map((r) => [r.item_id, r.value])) });
      });
    return () => {
      alive = false;
    };
  }, [supabase, user, key]);

  /**
   * Which of these papers the current reader has marked read or favorited.
   *
   * Same id-paired shape as `mine` above, and for the same reason: derived
   * rather than cleared on sign-out, so one reader's marks never flash under
   * another's session. Two separate queries/effects (not combined into one)
   * for the same reason tallies and counts are separate — each is its own
   * table with its own shape.
   */
  useEffect(() => {
    if (!supabase || !user) return undefined;
    const ids = key ? key.split(' ') : [];
    if (ids.length === 0) return undefined;
    let alive = true;
    supabase
      .from('reads')
      .select('item_id')
      .eq('user_id', user.id)
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setRead({ id: user.id, set: new Set(data.map((r) => r.item_id)) });
      });
    return () => {
      alive = false;
    };
  }, [supabase, user, key]);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    const ids = key ? key.split(' ') : [];
    if (ids.length === 0) return undefined;
    let alive = true;
    supabase
      .from('favorites')
      .select('item_id')
      .eq('user_id', user.id)
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setFavorite({ id: user.id, set: new Set(data.map((r) => r.item_id)) });
      });
    return () => {
      alive = false;
    };
  }, [supabase, user, key]);

  const mine = user && mineFor.id === user.id ? mineFor.map : EMPTY;
  const readIds = user && readFor.id === user.id ? readFor.set : EMPTY_SET;
  const favoriteIds = user && favoriteFor.id === user.id ? favoriteFor.set : EMPTY_SET;

  /**
   * Cast, change, or retract a vote. Clicking the button you already chose
   * retracts it, which is the behaviour a two-button control implies.
   *
   * Optimistic, with a rollback on failure: an approval revoked server-side
   * must not leave the UI showing a vote the database rejected.
   */
  const castVote = useCallback(
    async (itemId, value) => {
      if (!supabase || !user || !approved) return;

      const previous = mine.get(itemId) ?? 0;
      const next = previous === value ? 0 : value;

      const applyLocal = (from, to) => {
        setMine((m) => {
          const copy = new Map(m.map);
          if (to === 0) copy.delete(itemId);
          else copy.set(itemId, to);
          return { id: user.id, map: copy };
        });
        setTallies((t) => {
          const copy = new Map(t);
          const cur = copy.get(itemId) ?? { up: 0, down: 0 };
          const adjusted = { ...cur };
          if (from === 1) adjusted.up -= 1;
          if (from === -1) adjusted.down -= 1;
          if (to === 1) adjusted.up += 1;
          if (to === -1) adjusted.down += 1;
          copy.set(itemId, adjusted);
          return copy;
        });
      };

      applyLocal(previous, next);

      const { error } =
        next === 0
          ? await supabase.from('votes').delete().eq('user_id', user.id).eq('item_id', itemId)
          : await supabase
              .from('votes')
              .upsert(
                { user_id: user.id, item_id: itemId, month: itemMonths[itemId], value: next },
                { onConflict: 'user_id,item_id' },
              );

      if (error) applyLocal(next, previous);
    },
    [supabase, user, approved, mine, itemMonths],
  );

  /** Keep the collapsed row's count in step when a thread gains or loses one. */
  const adjustCommentCount = useCallback((itemId, delta) => {
    setCounts((c) => {
      const copy = new Map(c);
      copy.set(itemId, Math.max(0, (copy.get(itemId) ?? 0) + delta));
      return copy;
    });
  }, []);

  /**
   * Toggle read/favorite are a simple presence flip each — no value to
   * change, unlike a vote, so unmark is always just "the mark I already had."
   * Manual only (not set automatically on expand): a reader who opens a card
   * to skim it has not necessarily read it.
   */
  const toggleRead = useCallback(
    async (itemId) => {
      if (!supabase || !user || !approved) return;
      const wasRead = readIds.has(itemId);
      const applyLocal = (mark) => {
        setRead((r) => {
          const copy = new Set(r.set);
          if (mark) copy.add(itemId);
          else copy.delete(itemId);
          return { id: user.id, set: copy };
        });
      };
      applyLocal(!wasRead);
      const { error } = wasRead
        ? await supabase.from('reads').delete().eq('user_id', user.id).eq('item_id', itemId)
        : await supabase.from('reads').insert({ user_id: user.id, item_id: itemId });
      if (error) applyLocal(wasRead);
    },
    [supabase, user, approved, readIds],
  );

  const toggleFavorite = useCallback(
    async (itemId) => {
      if (!supabase || !user || !approved) return;
      const wasFavorite = favoriteIds.has(itemId);
      const applyLocal = (mark) => {
        setFavorite((f) => {
          const copy = new Set(f.set);
          if (mark) copy.add(itemId);
          else copy.delete(itemId);
          return { id: user.id, set: copy };
        });
      };
      applyLocal(!wasFavorite);
      const { error } = wasFavorite
        ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('item_id', itemId)
        : await supabase.from('favorites').insert({ user_id: user.id, item_id: itemId });
      if (error) applyLocal(wasFavorite);
    },
    [supabase, user, approved, favoriteIds],
  );

  const value = useMemo(
    () => ({
      itemMonths,
      tallies,
      counts,
      mine,
      castVote,
      adjustCommentCount,
      mentionable,
      readIds,
      favoriteIds,
      toggleRead,
      toggleFavorite,
    }),
    [
      itemMonths,
      tallies,
      counts,
      mine,
      castVote,
      adjustCommentCount,
      mentionable,
      readIds,
      favoriteIds,
      toggleRead,
      toggleFavorite,
    ],
  );

  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}
