'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { readGuestCookie, endGuestSession } from '../../lib/guest.js';

/**
 * Who is reading, and may they write?
 *
 * Three states the UI has to tell apart, because collapsing any two of them
 * produces a confusing page:
 *
 *   signed out      -> counts and threads render; the controls invite sign-in
 *   signed in, not approved -> "awaiting approval", controls disabled
 *   approved        -> full write access
 *
 * Plus a fourth, `guest`: someone who chose "View as guest" on the landing
 * page and is not an approved reader. The feedback islands render nothing at
 * all for a guest — no counts, no threads, no controls (see lib/guest.js).
 *
 * `approved` here is only ever a hint for rendering. The database decides:
 * every insert is re-checked by row-level security, so a stale or forged
 * `approved: true` in this context buys nothing.
 */

const SessionContext = createContext({
  enabled: false,
  ready: true,
  user: null,
  profile: null,
  approved: false,
  guest: false,
  categoryOrder: null,
  setCategoryOrder: () => {},
  signIn: () => {},
  signOut: () => {},
});

export const useSession = () => useContext(SessionContext);

// The cookie only changes through a full navigation (the landing page sets
// it, approval clears it below), so there is nothing to subscribe to. The
// server snapshot is false so hydration matches the static HTML; the real
// value takes over on the very next render.
const noSubscribe = () => () => {};
const serverGuest = () => false;

export default function SessionProvider({ children }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // With no Supabase configured there is nothing to wait for; the page is ready.
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  /**
   * The profile is stored *with* the id it was fetched for, and the value the
   * app sees is derived from that pairing rather than cleared by an effect on
   * sign-out. Clearing it imperatively would mean a synchronous setState in an
   * effect body — a cascading render, and the one thing React's
   * `set-state-in-effect` rule exists to catch. Deriving it also closes the
   * window where a stale profile from the previous user is briefly live.
   */
  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    supabase
      .from('profiles')
      .select('display_name, approved, category_order')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfile({ id: user.id, data: data ?? null });
      });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  const currentProfile = user && profile?.id === user.id ? profile.data : null;
  const approved = Boolean(currentProfile?.approved);

  const guestCookie = useSyncExternalStore(noSubscribe, readGuestCookie, serverGuest);
  const guest = guestCookie && !approved;

  // An approved reader who once browsed as a guest should not keep the
  // guest flag (and its pre-paint hiding) on every later visit.
  useEffect(() => {
    if (approved && guestCookie) endGuestSession();
  }, [approved, guestCookie]);

  /**
   * Sign in with an identity the reader already has.
   *
   * Provider is a parameter rather than a constant because the readership is
   * not technical: Google is the default path, GitHub is there for those who
   * prefer it. Both land in the same `profiles` row and the same approval
   * queue - nothing downstream knows or cares which was used.
   *
   * Deliberately no email/password: that would mean confirmation mail, password
   * resets, and an SMTP provider to keep working, all to end up at the same
   * `auth.uid()`.
   */
  const signIn = useCallback(
    (provider = 'google') => {
      // Back to the exact paper the reader was looking at, not the site root.
      supabase?.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.href },
      });
    },
    [supabase],
  );

  const signOut = useCallback(() => {
    supabase?.auth.signOut();
  }, [supabase]);

  /**
   * Save a reader's category pill order.
   *
   * Any signed-in user may set this, approved or not — it is a personal
   * display preference, not content, so it is not gated behind `approved`
   * the way votes and comments are. Optimistic, same shape as `castVote`:
   * update local state immediately, and let a failed write simply not
   * persist rather than rolling back a visible reorder.
   */
  const setCategoryOrder = useCallback(
    async (order) => {
      if (!supabase || !user) return;
      setProfile((p) => ({ id: user.id, data: { ...(p?.id === user.id ? p.data : null), category_order: order } }));
      await supabase.from('profiles').update({ category_order: order }).eq('id', user.id);
    },
    [supabase, user],
  );

  const value = useMemo(
    () => ({
      enabled: Boolean(supabase),
      ready,
      user,
      profile: currentProfile,
      approved,
      guest,
      categoryOrder: currentProfile?.category_order ?? null,
      setCategoryOrder,
      signIn,
      signOut,
    }),
    [supabase, ready, user, currentProfile, approved, guest, setCategoryOrder, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
