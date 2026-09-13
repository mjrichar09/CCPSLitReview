import { findDois } from '../userPapers.js';

/**
 * Slides in, citation candidates out.
 *
 * Two kinds, and the difference matters at the UI layer:
 *
 * - `doi`   — a DOI was found in the slide or its notes. That is an exact
 *             identifier, so the paper it resolves to is not a guess and the
 *             importer may take it without asking.
 * - `title` — a line that reads like a citation but carries no DOI. Resolving
 *             it means a Crossref title search, which can confidently return
 *             the wrong paper. These are offered for confirmation and are
 *             never imported silently.
 *
 * Commentary is the speaker notes for the slide the citation was found on,
 * falling back to the slide's body text with the citation lines removed. That
 * matches how conference decks are actually written: the reference goes on the
 * slide, what the presenter thought about it goes in the notes.
 */

/** A line has to be at least this long to be a plausible paper title. */
const MIN_TITLE_LENGTH = 25;
const MAX_TITLE_LENGTH = 400;
const MAX_COMMENTARY = 2000;

/**
 * Marks of a reference line: "et al.", a parenthesized 4-digit year, a
 * "Journal, 12(3), 45-67" volume/issue run, or an explicit arXiv/bioRxiv id.
 * Any one is enough — real decks cite in all of these styles and none of them
 * appears in ordinary slide prose often enough to matter.
 */
const CITATION_MARKS = [
  /\bet\s+al\.?/i,
  /\((?:19|20)\d{2}[a-z]?\)/,
  /\b\d{1,4}\s*\(\s*\d{1,3}\s*\)\s*[,:]\s*\d/,
  /\b(?:arxiv|biorxiv|medrxiv)\b/i,
];

export function extractCitations(slides) {
  const byDoi = new Map();
  const titles = [];

  for (const slide of slides ?? []) {
    const slideText = slide.text ?? '';
    const notes = slide.notes ?? '';
    const dois = findDois(`${slideText}\n${notes}`);
    const commentary = commentaryFor(slide, dois);

    for (const doi of dois) {
      const existing = byDoi.get(doi);
      if (existing) {
        // The same paper cited on two slides: keep both presenters' remarks
        // rather than letting the later slide silently win.
        existing.slides.push(slide.number);
        if (commentary && !existing.commentary.includes(commentary)) {
          existing.commentary = clamp(`${existing.commentary}\n\n${commentary}`.trim(), MAX_COMMENTARY);
        }
        continue;
      }
      byDoi.set(doi, { kind: 'doi', doi, title: null, commentary, slides: [slide.number] });
    }

    // Only look for title citations on slides that produced no DOI —
    // otherwise the reference line that *contains* the DOI gets offered a
    // second time as an unverified title match for the same paper.
    if (dois.length === 0) {
      for (const line of titleCandidates(slideText)) {
        titles.push({ kind: 'title', doi: null, title: line, commentary, slides: [slide.number] });
      }
    }
  }

  return [...byDoi.values(), ...dedupeTitles(titles)];
}

/** Lines on a slide that read like a reference rather than like prose. */
export function titleCandidates(text) {
  const out = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (line.length < MIN_TITLE_LENGTH || line.length > MAX_TITLE_LENGTH) continue;
    if (!CITATION_MARKS.some((mark) => mark.test(line))) continue;
    out.push(line);
  }
  return out;
}

/**
 * What the presenter said about this slide.
 *
 * Notes win outright when present. Otherwise the slide's own text is used with
 * the reference lines stripped, so the commentary is the presenter's point
 * about the paper rather than a second copy of the citation.
 */
function commentaryFor(slide, dois) {
  const notes = (slide.notes ?? '').trim();
  if (notes) return clamp(notes, MAX_COMMENTARY);

  const kept = String(slide.text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !dois.some((doi) => line.toLowerCase().includes(doi)) && !CITATION_MARKS.some((m) => m.test(line)));

  return clamp(kept.join('\n').trim(), MAX_COMMENTARY);
}

/** One entry per distinct title line; a deck's running footer would repeat otherwise. */
function dedupeTitles(candidates) {
  const seen = new Map();
  for (const candidate of candidates) {
    const key = candidate.title.toLowerCase().replace(/\s+/g, ' ');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, candidate);
      continue;
    }
    existing.slides.push(...candidate.slides);
    if (candidate.commentary && !existing.commentary.includes(candidate.commentary)) {
      existing.commentary = clamp(`${existing.commentary}\n\n${candidate.commentary}`.trim(), MAX_COMMENTARY);
    }
  }
  return [...seen.values()];
}

function clamp(text, max) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
