'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '../../lib/supabase/client.js';
import { useSession } from './SessionProvider.jsx';
import { itemSlug } from './shared.js';

const LIMIT = 20;

/**
 * The @mention notification bell in the header.
 *
 * Fetches on mount and each time the dropdown opens — the same
 * fetch-once-per-load pattern the rest of the app's engagement data already
 * follows, rather than a live subscription (nothing here uses Supabase
 * Realtime).
 */
export default function Notifications() {
  const supabase = useMemo(() => getSupabase(), []);
  const { enabled, user } = useSession();
  const [items, setItems] = useState(null); // null = not loaded yet
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, item_id, category_id, month, created_at, read_at, actor:actor_id(display_name)')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (data) setItems(data);
  }, [supabase, user]);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  // Close on an outside click, same convention as any dropdown menu.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (!next || !supabase || !items) return;
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    // Optimistic: the badge clears the moment the panel opens.
    setItems((list) => list.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
  }, [open, supabase, items]);

  if (!enabled || !user) return null;

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="notif" ref={panelRef}>
      <button
        type="button"
        className="notif-bell"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <span aria-hidden="true">&#128276;</span>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          {(items ?? []).length === 0 && <p className="notif-empty">No mentions yet.</p>}
          {(items ?? []).length > 0 && (
            <ul className="notif-list">
              {items.map((n) => {
                const href = n.category_id ? `/digest/${n.month}/${n.category_id}#${itemSlug(n.item_id)}` : `/digest/${n.month}`;
                return (
                  <li key={n.id} className={`notif-item${n.read_at ? '' : ' notif-unread'}`}>
                    <Link href={href} onClick={() => setOpen(false)}>
                      <strong>{n.actor?.display_name ?? 'Someone'}</strong> mentioned you
                      <time dateTime={n.created_at}> · {new Date(n.created_at).toLocaleDateString()}</time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
