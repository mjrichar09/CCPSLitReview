import { normalizeDoi } from './userPapers.js';

/**
 * Crossref metadata lookup, for the import forms.
 *
 * Runs in the browser — this app has no API routes to proxy through (see
 * CLAUDE.md), and Crossref's REST API sends permissive CORS headers, so the
 * reader's own browser asks it directly. That also keeps the uploaded deck on
 * the reader's machine: only the DOIs and title lines extracted from it are
 * ever sent anywhere.
 *
 * Title/abstract/metadata only, per the project's standing rule — Crossref is
 * an official metadata API and nothing here scrapes a publisher page.
 *
 * `mailto` is Crossref's documented way to reach their polite pool. The
 * browser forbids setting User-Agent, so the query parameter is the only
 * lever available.
 */

const BASE = 'https://api.crossref.org/works';
const MAILTO = 'ccpslitreview@users.noreply.github.com';
const TIMEOUT_MS = 15000;

/** Metadata for one DOI, or null when Crossref has no record of it. */
export async function lookupDoi(doi, { fetchImpl = fetch } = {}) {
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;

  const url = `${BASE}/${encodeURIComponent(normalized)}?mailto=${encodeURIComponent(MAILTO)}`;
  const response = await request(url, fetchImpl);
  if (response === null) return null;
  return toPaper(response.message);
}

/**
 * Best title matches for a citation line, most likely first.
 *
 * Returns candidates rather than picking one on purpose: a bibliographic
 * query can return a confidently wrong paper, and an import that silently
 * attached the wrong DOI to a presenter's commentary would be worse than one
 * that asks. The caller confirms before anything is written.
 */
export async function searchByTitle(query, { rows = 3, fetchImpl = fetch } = {}) {
  const trimmed = String(query ?? '').trim();
  if (trimmed.length < 10) return [];

  const url = `${BASE}?query.bibliographic=${encodeURIComponent(trimmed)}&rows=${rows}&select=DOI,title,author,container-title,issued,abstract,URL&mailto=${encodeURIComponent(MAILTO)}`;
  const response = await request(url, fetchImpl);
  if (response === null) return [];
  return (response.message?.items ?? []).map(toPaper).filter(Boolean);
}

async function request(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    // 404 is a real answer from Crossref — "no such DOI" — not a failure to
    // report. Every other non-OK status is a failure the caller should see.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Crossref returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Crossref timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** One Crossref work in this app's paper shape. */
export function toPaper(work) {
  if (!work?.DOI) return null;
  return {
    doi: normalizeDoi(work.DOI),
    title: firstString(work.title),
    authors: (work.author ?? [])
      .map((a) => [a.given, a.family].filter(Boolean).join(' ').trim() || a.name || null)
      .filter(Boolean),
    venue: firstString(work['container-title']),
    published: issuedDate(work.issued),
    url: work.DOI ? `https://doi.org/${normalizeDoi(work.DOI)}` : (work.URL ?? null),
    // Crossref abstracts arrive as JATS XML when they arrive at all. Tags are
    // stripped rather than rendered; the text is all the import needs.
    abstract: work.abstract ? stripJats(work.abstract) : null,
  };
}

function firstString(value) {
  if (Array.isArray(value)) return value.find((v) => typeof v === 'string' && v.trim()) ?? null;
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * `issued.date-parts` is `[[year, month, day]]` with month and day optional,
 * so the result is as precise as the record and no more.
 */
function issuedDate(issued) {
  const parts = issued?.['date-parts']?.[0];
  if (!Array.isArray(parts) || !parts[0]) return null;
  const [year, month, day] = parts;
  if (!month) return String(year);
  if (!day) return `${year}-${pad(month)}`;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const pad = (n) => String(n).padStart(2, '0');

function stripJats(xml) {
  return String(xml)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*Abstract\s*/i, '')
    .trim();
}
