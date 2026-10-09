'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { readGuestCookie } from '../../lib/guest.js';
import { useSession } from './SessionProvider.jsx';

/**
 * Month-wide reader data, for the things that have to see the whole month at
 * once rather than one section page:
 *
 *   - per-topic reading progress on the section pills ("4/12 read"), from the
 *     reader's own `reads`
 *   - "Most discussed" and "Readers' pick" badges, which rank a paper against
 *     every other paper in the month, from `comment_counts` and `vote_tallies`
 *
 * `Engagement` stays per section page (it drives the controls); this sits in
 * the month layout around the header and the page, and is told about read
 * toggles so the pills move as soon as a paper is marked.
 *
 * Nothing is loaded for a guest: every number here is reader feedback.
 */

const MonthStatsContext = createContext(null);
export const useMonthStats = () => useContext(MonthStatsContext);

// A badge has to mean something: two comments is a conversation, two net
// votes is more than one enthusiastic reader. Top three each, at most.
const MIN_COMMENTS = 2;
const MIN_NET_VOTES = 2;
const BADGE_SLOTS = 3;

function topIds(entries, min) {
  return new Set(
    entries
      .filter(([, n]) => n >= min)
      .sort((a, b) => b[1] - a[1])
      .slice(0, BADGE_SLOTS)
      .map(([id]) => id),
  );
}

export default function MonthStats({ itemsByCategory, children }) {
  const supabase = useMemo(() => getSupabase(), []);
  const { user, approved } = useSession();
  const isGuest = !approved && readGuestCookie();

  const allIds = useMemo(() => [...new Set(Object.values(itemsByCategory).flat())].sort(), [itemsByCategory]);
  const key = allIds.join(' ');

  const [counts, setCounts] = useState(() => new Map());
  const [tallies, setTallies] = useState(() => new Map());
  const [readFor, setReadFor] = useState({ id: null, set: new Set() });

  useEffect(() => {
    if (!supabase || isGuest || !key) return undefined;
    const ids = key.split(' ');
    let alive = true;
    supabase
      .from('comment_counts')
      .select('item_id, total')
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setCounts(new Map(data.map((r) => [r.item_id, Number(r.total)])));
      });
    supabase
      .from('vote_tallies')
      .select('item_id, up, down')
      .in('item_id', ids)
      .then(({ data }) => {
        if (alive && data) setTallies(new Map(data.map((r) => [r.item_id, r.up - r.down])));
      });
    return () => {
      alive = false;
    };
  }, [supabase, isGuest, key]);

  useEffect(() => {
    if (!supabase || !user || !key) return undefined;
    let alive = true;
    supabase
      .from('reads')
      .select('item_id')
      .eq('user_id', user.id)
      .in('item_id', key.split(' '))
      .then(({ data }) => {
        if (alive && data) setReadFor({ id: user.id, set: new Set(data.map((r) => r.item_id)) });
      });
    return () => {
      alive = false;
    };
  }, [supabase, user, key]);

  const readIds = user && readFor.id === user.id ? readFor.set : null;

  /** Called by Engagement when the reader marks or unmarks a paper. */
  const setRead = useCallback(
    (itemId, isRead) => {
      if (!user) return;
      setReadFor((r) => {
        const set = new Set(r.id === user.id ? r.set : []);
        if (isRead) set.add(itemId);
        else set.delete(itemId);
        return { id: user.id, set };
      });
    },
    [user],
  );

  const value = useMemo(() => {
    const mostDiscussed = topIds([...counts], MIN_COMMENTS);
    const readersPick = topIds([...tallies], MIN_NET_VOTES);
    return {
      enabled: !isGuest,
      /** `{ read, total }` for a topic, or null when there is no reader to track. */
      progress: (categoryId) => {
        if (!readIds || !approved) return null;
        const ids = itemsByCategory[categoryId] ?? [];
        return { read: ids.filter((id) => readIds.has(id)).length, total: ids.length };
      },
      badgesFor: (itemId) => ({
        mostDiscussed: mostDiscussed.has(itemId) ? counts.get(itemId) : null,
        readersPick: readersPick.has(itemId) ? tallies.get(itemId) : null,
      }),
      setRead,
    };
  }, [counts, tallies, readIds, approved, isGuest, itemsByCategory, setRead]);

  return <MonthStatsContext.Provider value={value}>{children}</MonthStatsContext.Provider>;
}
