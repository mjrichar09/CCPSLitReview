'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from './SessionProvider.jsx';
import { mergeOrder, readStoredOrder, writeStoredOrder } from './categoryOrder.js';

/**
 * The section banner: every category as a pill, linking to its section page,
 * with an item-count badge. It lives in the site header now, so it is visible
 * from anywhere in a month rather than only at the top of a page.
 *
 * The active section is read from the pathname rather than passed down. The
 * banner is rendered once by the layout, which does not know which category
 * segment is showing beneath it; deriving it here keeps the pages from having
 * to thread a `current` prop up into chrome they no longer render.
 *
 * Pills are drag-reorderable (desktop pointer only — HTML5 drag-and-drop has
 * no touch equivalent), and the order is remembered per reader: in their
 * profile when signed in, in localStorage otherwise.
 */
export default function CategoryNav({ month, categories }) {
  const pathname = usePathname();
  const { user, categoryOrder, setCategoryOrder } = useSession();
  const current = pathname?.startsWith(`/digest/${month}/`)
    ? pathname.slice(`/digest/${month}/`.length).split('/')[0]
    : null;

  // Starts as the report order — the same thing the server rendered — and is
  // corrected in an effect once a saved order is available. The server has no
  // session and no localStorage to read, so folding either in before the
  // first client render would be a hydration mismatch.
  const [order, setOrder] = useState(categories);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  useEffect(() => {
    // Deferred a tick, matching how every other effect in this app that
    // reads an external source (Supabase's `.then()` calls) only sets state
    // from a callback rather than synchronously in the effect body.
    queueMicrotask(() => {
      if (user) {
        if (categoryOrder) setOrder(mergeOrder(categories, categoryOrder));
      } else {
        const stored = readStoredOrder();
        if (stored) setOrder(mergeOrder(categories, stored));
      }
    });
  }, [categories, user, categoryOrder]);

  if (categories.length === 0) return null;

  const persist = (next) => {
    setOrder(next);
    const ids = next.map((c) => c.id);
    if (user) setCategoryOrder(ids);
    else writeStoredOrder(ids);
  };

  const handleDrop = (targetId) => {
    const sourceId = draggingId;
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const next = [...order];
    const from = next.findIndex((c) => c.id === sourceId);
    const to = next.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  };

  return (
    <nav className="section-nav" aria-label="Sections">
      {order.map((c) => (
        <Link
          key={c.id}
          href={`/digest/${month}/${c.id}`}
          className={[
            'section-nav-link',
            c.id === current && 'active',
            c.id === draggingId && 'dragging',
            c.id === dragOverId && c.id !== draggingId && 'drag-over',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-current={c.id === current ? 'page' : undefined}
          draggable
          onDragStart={(e) => {
            setDraggingId(c.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragOverId !== c.id) setDragOverId(c.id);
          }}
          onDragLeave={() => setDragOverId((id) => (id === c.id ? null : id))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(c.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
          }}
        >
          {c.name}
          <span className="section-nav-count">{c.items.length}</span>
        </Link>
      ))}
    </nav>
  );
}
