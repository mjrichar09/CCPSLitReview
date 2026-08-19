'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const MAX_RESULTS = 8;

/**
 * Site-wide search over every paper ever published. Client-side only — this
 * app has no runtime API routes — against a slim JSON index generated at
 * build time (scripts/build-search-index.mjs -> public/search-index.json)
 * and served as a plain static asset. Fetched once on mount rather than on
 * first interaction: at a few tens of KB, growing by a handful of papers a
 * month, there is no real cost to having it ready before the first
 * keystroke.
 */
export default function SearchBar() {
  const [index, setIndex] = useState(null); // null = not loaded yet
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/search-index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (alive) setIndex(data);
      })
      .catch(() => {
        if (alive) setIndex([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Close on an outside click or Escape, same convention as the notification
  // bell and every other dropdown in this app.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !index) return [];
    return index
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.venue?.toLowerCase().includes(q) ||
          p.authors.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, MAX_RESULTS);
  }, [query, index]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="search-bar" ref={containerRef}>
      <span className="search-icon" aria-hidden="true">
        🔍
      </span>
      <input
        type="search"
        className="search-input"
        placeholder="Search papers…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="Search papers"
      />
      {open && query.trim() && (
        <ul className="search-results">
          {index === null && <li className="search-empty">Loading…</li>}
          {index !== null && results.length === 0 && <li className="search-empty">No matches.</li>}
          {results.map((r) => (
            <li key={r.id}>
              <Link href={r.href} onClick={close}>
                <span className="search-result-title">{r.title}</span>
                <span className="search-result-meta">
                  {r.venue}
                  {r.venue && r.published ? ' · ' : ''}
                  {r.published}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
