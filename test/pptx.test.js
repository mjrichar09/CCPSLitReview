import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { extractPptx, textFromDrawingML } from '../lib/pptx/extract.js';
import { extractCitations, titleCandidates } from '../lib/pptx/citations.js';
import { findDois, normalizeDoi, importedItemId, buildImportRow, toDisplayItem, IMPORTED_SCORE } from '../lib/userPapers.js';
import { normalizeDoi as identityNormalizeDoi } from '../lib/util/identity.js';

const FIXTURE = new URL('./fixtures/pptx/conference-deck.pptx', import.meta.url);

async function deck() {
  const buffer = await readFile(FIXTURE);
  // Node's Buffer is a view on a pooled ArrayBuffer, so the deck has to be
  // sliced out of it — handing the pool's whole buffer to a zip reader points
  // it at unrelated bytes.
  return extractPptx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

test('opens a real .pptx and reads every slide in order', async () => {
  const { slides, deckTitle } = await deck();
  assert.equal(slides.length, 5);
  assert.deepEqual(slides.map((s) => s.number), [1, 2, 3, 4, 5]);
  assert.equal(deckTitle, 'Cell Culture Symposium 2026 — highlights');
  assert.match(slides[0].text, /Cell Culture Symposium 2026/);
});

test('reads speaker notes, which is where the commentary lives', async () => {
  const { slides } = await deck();
  assert.match(slides[1].notes, /Best talk of the session/);
  assert.match(slides[3].notes, /Ask the speaker for the preprint/);
});

test('a DOI split across formatting runs still comes back whole', async () => {
  // The fixture breaks 10.1002/bit.70359 across two runs, which is exactly
  // what a hyperlink boundary does in a real deck.
  const { slides } = await deck();
  assert.ok(findDois(slides[2].text).includes('10.1002/bit.70359'));
});

test('finds every DOI in the deck, deduped across slides', async () => {
  const { slides } = await deck();
  const citations = extractCitations(slides);
  const dois = citations.filter((c) => c.kind === 'doi').map((c) => c.doi).sort();
  assert.deepEqual(dois, [
    '10.1002/bit.70359',
    '10.1016/j.jbiotec.2026.08.008',
    '10.1016/j.ymben.2026.102543',
  ]);
});

test('a paper cited on two slides is one candidate carrying both remarks', async () => {
  const { slides } = await deck();
  const tpt1 = extractCitations(slides).find((c) => c.doi === '10.1016/j.ymben.2026.102543');
  assert.deepEqual(tpt1.slides, [2, 5]);
  assert.match(tpt1.commentary, /Best talk of the session/);
  assert.match(tpt1.commentary, /Reiterating the TPT1 result/);
});

test('a slide citing a paper by title only is offered for confirmation', async () => {
  const { slides } = await deck();
  const titles = extractCitations(slides).filter((c) => c.kind === 'title');
  assert.equal(titles.length, 1);
  assert.match(titles[0].title, /Variable-specific preprocessing/);
  assert.match(titles[0].commentary, /Follow-up to the August negative result/);
});

test('a slide that yielded a DOI does not also yield a title guess for it', async () => {
  // Slide 2's reference line carries both "Han et al. (2026)" and the DOI.
  // Offering it as an unverified title match too would ask the reader to
  // confirm a paper the deck already identified exactly.
  const { slides } = await deck();
  const fromSlideTwo = extractCitations(slides).filter((c) => c.kind === 'title' && c.slides.includes(2));
  assert.deepEqual(fromSlideTwo, []);
});

test('citation lines are recognized by several house styles', () => {
  const lines = titleCandidates(
    [
      'Short line',
      'Smith et al. demonstrate perfusion intensification at 200 million cells per mL',
      'A careful study of glycosylation control in CHO cells (2025)',
      'Journal of Biotechnology, 12(3): 45-67 reports a new feed strategy entirely',
      'This is ordinary slide prose that happens to be reasonably long but cites nothing',
    ].join('\n')
  );
  assert.equal(lines.length, 3);
  assert.ok(lines.every((l) => !l.startsWith('This is ordinary')));
});

test('runs inside a paragraph join without separators; paragraphs stay apart', () => {
  const xml = '<a:p><a:r><a:t>10.1016/</a:t></a:r><a:r><a:t>j.test.2026</a:t></a:r></a:p><a:p><a:r><a:t>Next line</a:t></a:r></a:p>';
  assert.equal(textFromDrawingML(xml), '10.1016/j.test.2026\nNext line');
});

test('XML entities decode in one pass, so an escaped entity stays escaped', () => {
  const xml = '<a:p><a:r><a:t>Yields &amp; titer &#8212; up 40%</a:t></a:r></a:p>';
  assert.equal(textFromDrawingML(xml), 'Yields & titer — up 40%');
  const literal = '<a:p><a:r><a:t>&amp;#8217;</a:t></a:r></a:p>';
  assert.equal(textFromDrawingML(literal), '&#8217;');
});

test('a file that is not a zip fails with a clear message', async () => {
  const notAZip = new TextEncoder().encode('this is plainly not a pptx').buffer;
  await assert.rejects(() => extractPptx(notAZip), /not a zip file/);
});

test('DOI normalization matches the pipeline rule exactly', () => {
  // lib/userPapers.js restates this rule to stay browser-safe. If the two
  // ever disagree, an imported paper stops sharing an id with the pipeline's
  // copy of the same paper, and its comments strand on a duplicate.
  for (const raw of [
    'https://doi.org/10.1016/J.YMBEN.2026.102543',
    'http://dx.doi.org/10.1002/bit.70359',
    'doi: 10.1186/s40643-026-01105-5',
    '10.1016/j.jbiotec.2026.08.008.',
    '  10.1000/XyZ  ',
  ]) {
    assert.equal(normalizeDoi(raw), identityNormalizeDoi(raw), raw);
  }
});

test('a DOI import takes the digest id namespace; a title-only import does not', () => {
  assert.equal(importedItemId({ doi: 'https://doi.org/10.1/A' }), 'doi:10.1/a');
  assert.equal(importedItemId({ uuid: 'abc-123' }), 'user:abc-123');
  assert.throws(() => importedItemId({}), /needs a uuid/);
});

test('an import row is shaped for the table, or explains why it cannot be', () => {
  const ok = buildImportRow({ title: '  A paper  ', doi: '10.1/A', userId: 'u1', authors: ['Ada L'] });
  assert.equal(ok.ok, true);
  assert.equal(ok.row.item_id, 'doi:10.1/a');
  assert.equal(ok.row.doi, '10.1/a');
  assert.equal(ok.row.url, 'https://doi.org/10.1/a');
  assert.equal(ok.row.title, 'A paper');

  assert.deepEqual(buildImportRow({ title: '', doi: '10.1/A', userId: 'u1' }), { ok: false, reason: 'no title' });
  assert.deepEqual(buildImportRow({ title: 'T', userId: 'u1' }), { ok: false, reason: 'no DOI and no generated id' });
  assert.deepEqual(buildImportRow({ title: 'T', doi: '10.1/A' }), { ok: false, reason: 'not signed in' });
});

test('every imported paper displays as relevance 5', () => {
  const item = toDisplayItem({ item_id: 'doi:10.1/a', title: 'A', doi: '10.1/a', source: 'conference' });
  assert.equal(item.relevance_score, IMPORTED_SCORE);
  assert.equal(IMPORTED_SCORE, 5);
  // No abstract means the summary would have nothing behind it, which is the
  // same condition the pipeline flags rather than hides.
  assert.equal(item.thin_abstract, true);
  assert.equal(item.is_recurring, false);
});
