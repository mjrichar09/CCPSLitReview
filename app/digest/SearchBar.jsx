'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const MAX_RESULTS = 8;

/** How much of a body-text snippet to show around the first match. */
const SNIPPET_RADIUS = 60;

/**
 * Site-wide search over every paper ever published. Client-side only — this
 * app has no runtime API routes — against a slim JSON index generated at
 * build time (scripts/build-search-index.mjs -> public/search-index.json)
 * and served as a plain static asset. Fetched once on mount rather than on
 * first interaction: at a few tens of KB, growing by a handful of papers a
 * month, there is no real cost to having it ready before the first
 * keystroke.
 *
 * Matches title/authors/venue first (a title hit is a stronger signal than
 * a buried mention) and falls back to the generated summary/why_it_matters —
 * the closest this app gets to "full text" search, since no raw abstract or
 * article body is ever stored past scoring. A body-only match shows a
 * snippet around the hit so the reader can see why it surfaced.
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

    const matched = [];
    for (const p of index) {
      const strongHit =
        p.title.toLowerCase().includes(q) ||
        p.venue?.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q));
      if (strongHit) {
        matched.push({ ...p, snippet: null });
        continue;
      }
      const snippet = firstSnippet([p.summary, p.why_it_matters], q);
      if (snippet) matched.push({ ...p, snippet });
    }
    // Array.prototype.sort is stable, so title/author/venue hits (snippet ===
    // null) move before body-only hits while each group keeps index's
    // original newest-first order.
    matched.sort((a, b) => (a.snippet === null ? 0 : 1) - (b.snippet === null ? 0 : 1));
    return matched.slice(0, MAX_RESULTS);
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
                {r.snippet && <span className="search-result-snippet">{r.snippet}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** First case-insensitive match of `q` across `texts`, as an ellipsized snippet, or null. */
function firstSnippet(texts, q) {
  for (const text of texts) {
    if (!text) continue;
    const at = text.toLowerCase().indexOf(q);
    if (at === -1) continue;
    const start = Math.max(0, at - SNIPPET_RADIUS);
    const end = Math.min(text.length, at + q.length + SNIPPET_RADIUS);
    const snippet = text.slice(start, end).trim();
    return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`;
  }
  return null;
}
