'use client';

import { useState } from 'react';
import { extractPptx } from '../../lib/pptx/extract.js';
import { extractCitations } from '../../lib/pptx/citations.js';
import { lookupDoi, searchByTitle } from '../../lib/crossref.js';
import { importPapers } from './importPapers.js';

const MAX_DECK_BYTES = 50 * 1024 * 1024;

/**
 * Import every paper a conference deck cites, with the presenter's commentary
 * attached to each as a comment.
 *
 * The deck is read in the browser and never uploaded — there is nowhere to
 * upload it to (this app has no API routes) and no reason to: the parse is
 * local, and only the DOIs and title lines it finds are sent to Crossref for
 * metadata.
 *
 * Two-stage by necessity rather than taste. A DOI resolves to exactly one
 * paper, so those are pre-selected. A title line resolves to Crossref's best
 * guess, which can be confidently wrong, so those start unselected and name
 * the paper they would import — a wrong paper carrying a presenter's remarks,
 * under a reader's name, in the shared section, is not a mistake worth
 * risking to save a click.
 */
export default function ConferenceImport({ supabase, user, onDone }) {
  const [stage, setStage] = useState('idle'); // idle | reading | review | importing
  const [deckTitle, setDeckTitle] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = () => {
    setStage('idle');
    setCandidates([]);
    setDeckTitle(null);
    setError(null);
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-picking the same file fires change again
    if (!file) return;

    setError(null);
    setResult(null);
    setCandidates([]);

    if (!file.name.toLowerCase().endsWith('.pptx')) {
      setError('That is not a .pptx file. Export the deck as PowerPoint and try again.');
      return;
    }
    if (file.size > MAX_DECK_BYTES) {
      setError('That deck is larger than 50 MB.');
      return;
    }

    setStage('reading');
    try {
      const { deckTitle: title, slides } = await extractPptx(await file.arrayBuffer(), {
        deckTitle: file.name.replace(/\.pptx$/i, ''),
      });
      setDeckTitle(title);

      const found = extractCitations(slides);
      if (!found.length) {
        setError('No citations found in that deck — no DOIs, and no lines that look like references.');
        setStage('idle');
        return;
      }

      setCandidates(await resolve(found));
      setStage('review');
    } catch (err) {
      setError(err.message);
      setStage('idle');
    }
  };

  const runImport = async () => {
    setStage('importing');
    setError(null);
    try {
      const entries = candidates
        .filter((c) => c.selected && c.paper)
        .map((c) => ({ paper: c.paper, commentary: c.commentary || null }));

      const outcome = await importPapers({ supabase, user, entries, source: 'conference', deckTitle });
      setResult(outcome);
      reset();
      await onDone();
    } catch (err) {
      setError(err.message);
      setStage('review');
    }
  };

  const toggle = (index) =>
    setCandidates((list) => list.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c)));

  const selectedCount = candidates.filter((c) => c.selected && c.paper).length;

  return (
    <section className="import-card">
      <h2>Import a conference deck</h2>
      <p className="import-hint">
        Upload a .pptx and every paper it cites is added, with your slide notes attached to each as a comment. The
        file is read in your browser and never uploaded.
      </p>

      <input type="file" accept=".pptx" onChange={onFile} disabled={stage === 'reading' || stage === 'importing'} />

      {stage === 'reading' && <p className="imports-empty">Reading the deck and looking up citations…</p>}
      {error && <p className="imports-error">{error}</p>}
      {result && (
        <p className="imports-ok">
          Imported {result.added} paper{result.added === 1 ? '' : 's'}
          {result.duplicates > 0 && `, ${result.duplicates} already there`}
          {result.failed.length > 0 && `, ${result.failed.length} could not be added`}.
        </p>
      )}

      {stage === 'review' && (
        <div className="import-review">
          <p className="import-review-head">
            {deckTitle && <strong>{deckTitle}</strong>} — {candidates.length} citation
            {candidates.length === 1 ? '' : 's'} found. Unverified title matches start unchecked; confirm each one
            before importing.
          </p>

          <ul className="import-candidates">
            {candidates.map((c, i) => (
              <li key={`${c.kind}-${i}`} className={c.paper ? '' : 'import-candidate-unresolved'}>
                <label>
                  <input type="checkbox" checked={c.selected} onChange={() => toggle(i)} disabled={!c.paper} />
                  <span className="import-candidate-title">{c.paper?.title ?? c.title ?? c.doi}</span>
                </label>
                <p className="import-candidate-meta">
                  {c.kind === 'doi' ? (
                    <span className="badge badge-import">DOI</span>
                  ) : (
                    <span className="badge badge-recurring">Title match — check this is right</span>
                  )}{' '}
                  slide{c.slides.length === 1 ? '' : 's'} {c.slides.join(', ')}
                  {c.paper?.venue ? ` · ${c.paper.venue}` : ''}
                  {c.paper?.published ? ` · ${c.paper.published}` : ''}
                  {!c.paper && ' · could not be resolved, nothing to import'}
                </p>
                {c.commentary && <p className="import-candidate-note">Comment: {c.commentary}</p>}
              </li>
            ))}
          </ul>

          <button type="button" onClick={runImport} disabled={selectedCount === 0}>
            Import {selectedCount} paper{selectedCount === 1 ? '' : 's'}
          </button>
          <button type="button" className="import-cancel" onClick={reset}>
            Cancel
          </button>
        </div>
      )}

      {stage === 'importing' && <p className="imports-empty">Importing…</p>}
    </section>
  );
}

/**
 * Turn citations into resolved papers, one Crossref request at a time.
 *
 * Sequential rather than parallel, deliberately: Crossref asks for courtesy
 * from unauthenticated clients, a deck is tens of citations at most, and a
 * burst of forty concurrent requests from a browser is exactly what gets a
 * polite-pool client throttled.
 *
 * A lookup that fails leaves the candidate unresolved rather than failing the
 * whole deck — the reader still gets the other thirty-nine papers, and the
 * unresolved one says so in the list.
 */
async function resolve(citations) {
  const out = [];
  for (const citation of citations) {
    try {
      if (citation.kind === 'doi') {
        const paper = await lookupDoi(citation.doi);
        out.push({
          ...citation,
          paper: paper ?? { doi: citation.doi, title: citation.doi, authors: [] },
          selected: true,
        });
        continue;
      }
      const [best] = await searchByTitle(citation.title);
      // Unchecked by default: this is Crossref's guess at a line of slide
      // text, and nothing has confirmed it is the paper the presenter meant.
      out.push({ ...citation, paper: best ?? null, selected: false });
    } catch {
      out.push({ ...citation, paper: null, selected: false });
    }
  }
  return out;
}
