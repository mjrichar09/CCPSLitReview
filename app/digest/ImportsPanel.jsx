'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { useSession } from './SessionProvider.jsx';
import SignInButtons from './SignInButtons.jsx';
import Engagement from './Engagement.jsx';
import ImportedPaper from './ImportedPaper.jsx';
import { findDois } from '../../lib/userPapers.js';
import { lookupDoi } from '../../lib/crossref.js';
import ConferenceImport from './ConferenceImport.jsx';
import { importMonth, importPapers } from './importPapers.js';

/**
 * The whole user-added section: the imported papers, and the two forms that
 * add to them.
 *
 * Laid out like a month page rather than like a tool — the papers are the
 * content and get the main column, the import forms sit in a sidebar beside
 * them. The sidebar is sticky, so adding a second paper does not mean
 * scrolling back past everything already imported.
 *
 * Everything here is browser-side — Supabase reads and writes under row-level
 * security, exactly like votes and comments. There is no API route and no
 * server involved, which is what keeps the invariant in CLAUDE.md intact while
 * still letting readers add content.
 */
export default function ImportsPanel() {
  const supabase = useMemo(() => getSupabase(), []);
  const { enabled, user, approved } = useSession();

  const [rows, setRows] = useState(null); // null = not loaded yet
  const [names, setNames] = useState({});
  const [error, setError] = useState(null);
  // Bumped by each successful import; the effect below re-reads on change.
  // A counter rather than calling a loader directly from the effect body,
  // which would set state synchronously during the effect.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;

    fetchImports(supabase).then(
      ({ rows: loaded, names: byId }) => {
        if (!alive) return;
        setRows(loaded);
        setNames(byId);
      },
      (err) => {
        if (!alive) return;
        setError(err.message);
        setRows([]);
      }
    );

    return () => {
      alive = false;
    };
  }, [supabase, tick]);

  const itemMonths = useMemo(
    () => Object.fromEntries((rows ?? []).map((r) => [r.item_id, importMonth(r.created_at)])),
    [rows]
  );
  const itemIds = useMemo(() => (rows ?? []).map((r) => r.item_id), [rows]);

  // The gate states render in the same main column as the papers would, so
  // the page keeps one <main> whatever it is showing.
  if (!enabled) {
    return (
      <main className="col-main">
        <p className="imports-empty">Imports need Supabase configured; this deployment has no reader features.</p>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="col-main imports-signin">
        <p>Sign in to see and add imported papers.</p>
        <SignInButtons />
      </main>
    );
  }
  if (!approved) {
    return (
      <main className="col-main">
        <p className="imports-empty">Your account is awaiting approval.</p>
      </main>
    );
  }

  return (
    <div className="imports-grid">
      <main className="col-main">
        <section className="imports-list">
          <h2>
            {rows?.length ? `${rows.length} paper${rows.length === 1 ? '' : 's'}` : 'Papers'}
          </h2>
          {error && <p className="imports-error">Could not load imports: {error}</p>}
          {rows === null && <p className="imports-empty">Loading…</p>}
          {rows?.length === 0 && (
            <p className="imports-empty">
              Nothing imported yet. Add a paper by DOI, or bring in a whole conference deck, from the panel beside
              this one.
            </p>
          )}
          {rows?.length > 0 && (
            <Engagement itemMonths={itemMonths} itemIds={itemIds}>
              <ul className="item-list">
                {rows.map((row) => (
                  <ImportedPaper key={row.id} row={row} importerName={names[row.user_id]} />
                ))}
              </ul>
            </Engagement>
          )}
        </section>
      </main>

      <aside className="col-side imports-side" aria-label="Add papers">
        <ManualImport supabase={supabase} user={user} onDone={reload} />
        <ConferenceImport supabase={supabase} user={user} onDone={reload} />
      </aside>
    </div>
  );
}

/**
 * Import one paper by DOI, with an optional comment.
 *
 * Two steps on purpose: look up, then confirm. A DOI is easy to paste wrong,
 * and the metadata Crossref returns is the only chance to notice before the
 * paper is in the shared section under someone's name.
 */
function ManualImport({ supabase, user, onDone }) {
  const [raw, setRaw] = useState('');
  const [comment, setComment] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const look = async (event) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    setFound(null);

    // Accept a bare DOI, a doi.org URL, or a line of text with one in it —
    // all three are how a DOI actually arrives when someone sends you a paper.
    const [doi] = findDois(raw);
    if (!doi) {
      setError('No DOI found in that. Paste a DOI or a doi.org link.');
      return;
    }

    setBusy(true);
    try {
      const paper = await lookupDoi(doi);
      if (!paper) setError(`Crossref has no record of ${doi}.`);
      else setFound(paper);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await importPapers({
        supabase,
        user,
        entries: [{ paper: found, commentary: comment.trim() || null }],
        source: 'manual',
      });
      setDone(found.title);
      setFound(null);
      setRaw('');
      setComment('');
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="import-card">
      <h2>Add a paper</h2>
      <form onSubmit={look} className="import-form">
        <label htmlFor="import-doi">DOI or link</label>
        <input
          id="import-doi"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="10.1016/j.ymben.2026.102543"
          disabled={busy}
        />
        <label htmlFor="import-comment">Comment (optional)</label>
        <textarea
          id="import-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Why this one is worth reading"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !raw.trim()}>
          {busy ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {error && <p className="imports-error">{error}</p>}
      {done && <p className="imports-ok">Added “{done}”.</p>}

      {found && (
        <div className="import-preview">
          <p className="import-preview-title">{found.title}</p>
          <p className="import-preview-meta">
            {[found.venue, found.published, found.authors.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
          </p>
          <button type="button" onClick={add} disabled={busy}>
            {busy ? 'Adding…' : 'Add this paper'}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Every import, plus the display name of whoever added each one.
 *
 * Outside the component so the effect can set state from its promise callback
 * rather than calling a loader in the effect body.
 */
async function fetchImports(supabase) {
  const { data, error } = await supabase
    .from('user_papers')
    .select('id, item_id, user_id, title, authors, venue, published, doi, url, abstract, source, deck_title, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (!ids.length) return { rows, names: {} };

  // Best effort: a missing byline is cosmetic, and must not cost the reader
  // the imports themselves.
  const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  return { rows, names: Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name])) };
}
