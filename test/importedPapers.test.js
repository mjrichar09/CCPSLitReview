import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadImportedPapers, importedBlock, isImportReadConfigured } from '../lib/importedPapers.js';
import { importMonth } from '../app/digest/importPapers.js';

const ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };

const rows = () => ({
  papers: [
    { item_id: 'doi:10.1/a', title: 'Paper A', venue: 'J Bio', published: '2026-07', doi: '10.1/a', source: 'manual', deck_title: null, created_at: '2026-07-15T00:00:00.000Z' },
    { item_id: 'doi:10.1/b', title: 'Paper B', venue: null, published: null, doi: '10.1/b', source: 'conference', deck_title: 'Symposium 2026', created_at: '2026-08-20T00:00:00.000Z' },
    { item_id: 'doi:10.1/c', title: 'Paper C', venue: null, published: null, doi: '10.1/c', source: 'manual', deck_title: null, created_at: '2026-09-05T00:00:00.000Z' },
  ],
  comments: [
    { item_id: 'doi:10.1/a', body: 'Worth trying in our line.', created_at: '2026-07-15T01:00:00.000Z' },
    { item_id: 'doi:10.1/a', body: 'Follow-up: it replicated.', created_at: '2026-07-18T01:00:00.000Z' },
    { item_id: 'doi:10.1/b', body: 'Best talk of the session.', created_at: '2026-08-20T01:00:00.000Z' },
  ],
});

test('disabled, not failed, when the service-role key is absent', async () => {
  const result = await loadImportedPapers('2026-09', { env: {}, fetchRows: () => { throw new Error('must not query'); } });
  assert.deepEqual(result, { enabled: false, papers: [] });
  assert.equal(isImportReadConfigured({}), false);
  assert.equal(isImportReadConfigured(ENV), true);
});

test('only imports made strictly before the month being generated', async () => {
  // Paper C was imported during September. Generating September must not see
  // it, or a --force re-run later would produce a different month than the
  // one originally published.
  const { papers } = await loadImportedPapers('2026-09', { env: ENV, fetchRows: rows });
  assert.deepEqual(papers.map((p) => p.id), ['doi:10.1/b', 'doi:10.1/a']);
});

test('each paper carries the reader notes attached to it', async () => {
  const { papers } = await loadImportedPapers('2026-09', { env: ENV, fetchRows: rows });
  const a = papers.find((p) => p.id === 'doi:10.1/a');
  assert.deepEqual(a.comments, ['Worth trying in our line.', 'Follow-up: it replicated.']);
});

test('a month with no prior imports yields nothing to render', async () => {
  const { papers } = await loadImportedPapers('2026-01', { env: ENV, fetchRows: rows });
  assert.deepEqual(papers, []);
  assert.equal(importedBlock(papers), '');
});

test('the prompt block names the deck and the notes, and carries its guard', async () => {
  const { papers } = await loadImportedPapers('2026-09', { env: ENV, fetchRows: rows });
  const block = importedBlock(papers);
  assert.match(block, /READER-IMPORTED PAPERS/);
  assert.match(block, /Paper A \(J Bio, 2026-07\)/);
  assert.match(block, /from "Symposium 2026"/);
  assert.match(block, /reader note: Best talk of the session\./);
  // The guard is what stops these from being written up as this month's
  // results, which they are not.
  assert.match(block, /never as this month's results/);
});

test('a comment month is the YYYY-MM the comments table requires', () => {
  assert.equal(importMonth('2026-09-13T10:00:00.000Z'), '2026-09');
  assert.equal(importMonth('2026-01-01T00:00:00.000Z'), '2026-01');
  // An unparseable timestamp falls back to now rather than writing a value
  // the table's check constraint would reject.
  assert.match(importMonth('not a date'), /^\d{4}-\d{2}$/);
  assert.match(importMonth(), /^\d{4}-\d{2}$/);
});
