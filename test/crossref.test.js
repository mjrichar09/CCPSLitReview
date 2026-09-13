import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { lookupDoi, searchByTitle, toPaper } from '../lib/crossref.js';
import { extractPptx } from '../lib/pptx/extract.js';
import { extractCitations } from '../lib/pptx/citations.js';
import { buildImportRow } from '../lib/userPapers.js';

const WORK = {
  DOI: '10.1016/J.YMBEN.2026.102543',
  title: ['TPT1 overexpression extends CHO culture longevity'],
  author: [{ given: 'A.', family: 'Han' }, { name: 'Consortium X' }],
  'container-title': ['Metabolic Engineering'],
  issued: { 'date-parts': [[2026, 8, 14]] },
  abstract: '<jats:p>Abstract We show that TPT1 raises titer.</jats:p>',
};

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('a Crossref work maps into this app’s paper shape', () => {
  const paper = toPaper(WORK);
  assert.equal(paper.doi, '10.1016/j.ymben.2026.102543'); // normalized, not as returned
  assert.equal(paper.title, 'TPT1 overexpression extends CHO culture longevity');
  assert.deepEqual(paper.authors, ['A. Han', 'Consortium X']);
  assert.equal(paper.venue, 'Metabolic Engineering');
  assert.equal(paper.published, '2026-08-14');
  assert.equal(paper.url, 'https://doi.org/10.1016/j.ymben.2026.102543');
  // JATS tags stripped and the redundant leading "Abstract" removed.
  assert.equal(paper.abstract, 'We show that TPT1 raises titer.');
});

test('a partial issued date stays as precise as the record and no more', () => {
  assert.equal(toPaper({ ...WORK, issued: { 'date-parts': [[2026]] } }).published, '2026');
  assert.equal(toPaper({ ...WORK, issued: { 'date-parts': [[2026, 3]] } }).published, '2026-03');
  assert.equal(toPaper({ ...WORK, issued: {} }).published, null);
});

test('an unknown DOI is a null answer, not a failure', async () => {
  const paper = await lookupDoi('10.1/nope', { fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(paper, null);
});

test('a Crossref outage is an error the caller can report', async () => {
  await assert.rejects(
    () => lookupDoi('10.1/a', { fetchImpl: async () => ({ ok: false, status: 500 }) }),
    /Crossref returned 500/
  );
});

test('the lookup URL carries a mailto, for the polite pool', async () => {
  let seen = null;
  await lookupDoi('10.1/a', {
    fetchImpl: async (url) => {
      seen = url;
      return okResponse({ message: WORK });
    },
  });
  assert.match(seen, /mailto=/);
  assert.match(seen, /10\.1%2Fa/); // the DOI's slash is encoded, not a path split
});

test('a too-short title is not sent to Crossref at all', async () => {
  const results = await searchByTitle('short', {
    fetchImpl: async () => {
      throw new Error('should not have been called');
    },
  });
  assert.deepEqual(results, []);
});

test('a deck becomes import rows end to end', async () => {
  // The whole chain the conference importer runs, with Crossref stubbed:
  // unzip -> slide text -> citations -> metadata -> the row that gets written.
  const buffer = await readFile(new URL('./fixtures/pptx/conference-deck.pptx', import.meta.url));
  const { slides, deckTitle } = await extractPptx(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );

  const citations = extractCitations(slides).filter((c) => c.kind === 'doi');
  const fetchImpl = async (url) => {
    const doi = decodeURIComponent(url.split('/works/')[1].split('?')[0]);
    return okResponse({ message: { ...WORK, DOI: doi } });
  };

  const rows = [];
  for (const citation of citations) {
    const paper = await lookupDoi(citation.doi, { fetchImpl });
    const built = buildImportRow({ ...paper, source: 'conference', deckTitle, userId: 'u1' });
    assert.equal(built.ok, true, citation.doi);
    rows.push(built.row);
  }

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.item_id).sort(),
    ['doi:10.1002/bit.70359', 'doi:10.1016/j.jbiotec.2026.08.008', 'doi:10.1016/j.ymben.2026.102543']
  );
  assert.ok(rows.every((r) => r.source === 'conference'));
  assert.ok(rows.every((r) => r.deck_title === 'Cell Culture Symposium 2026 — highlights'));
  assert.ok(rows.every((r) => r.url.startsWith('https://doi.org/')));

  // The TPT1 paper is cited on two slides; the commentary from both follows it
  // into the comment that gets written alongside the row.
  const tpt1 = extractCitations(slides).find((c) => c.doi === '10.1016/j.ymben.2026.102543');
  assert.match(tpt1.commentary, /Best talk of the session/);
  assert.match(tpt1.commentary, /Reiterating the TPT1 result/);
});
