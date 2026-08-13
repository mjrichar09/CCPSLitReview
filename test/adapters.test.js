import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseArticles } from '../lib/adapters/pubmed.js';
import { toRecord as epmcRecord } from '../lib/adapters/europepmc.js';
import { toRecord as biorxivRecord } from '../lib/adapters/biorxiv.js';
import { parseFeed as parseArxiv } from '../lib/adapters/arxiv.js';
import { parseFeed as parseRss } from '../lib/adapters/rss.js';
import { toPatch } from '../lib/adapters/crossref.js';

const fixture = (name) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
const json = (name) => JSON.parse(fixture(name));

const WINDOW = {
  from: new Date('2026-07-09T00:00:00Z'),
  to: new Date('2026-08-13T00:00:00Z'),
};

// --- PubMed ----------------------------------------------------------------

test('pubmed: parses a structured abstract, DOI, and electronic date', () => {
  const [a] = parseArticles(fixture('pubmed-articles.xml'), 'pat_control');

  assert.equal(a.pmid, '42472568');
  assert.equal(a.doi, '10.1016/j.biotechadv.2026.108986', 'DOI is lowercased');
  assert.equal(a.external_id, 'doi:10.1016/j.biotechadv.2026.108986');
  assert.equal(a.title, 'Raman-based feedback control of CHO fed-batch culture.', 'inline markup is stripped');
  assert.match(a.abstract, /^BACKGROUND: Raman probes are now routine\. RESULTS:/, 'section labels are preserved');
  assert.deepEqual(a.authors, ['Dongkyu Kim', 'S Park']);
  assert.equal(a.venue, 'Biotechnology advances');
  assert.equal(a.published, '2026-07-19', 'ArticleDate wins over the journal issue date');
  assert.equal(a.url, 'https://pubmed.ncbi.nlm.nih.gov/42472568/');
  assert.deepEqual(a.categories, ['pat_control']);
});

test('pubmed: falls back to MedlineDate and handles collective authors', () => {
  const [, b] = parseArticles(fixture('pubmed-articles.xml'), 'intensification');

  assert.equal(b.doi, null);
  assert.equal(b.external_id, 'pmid:42488823', 'no DOI falls back to PMID');
  assert.deepEqual(b.authors, ['BioPhorum Cell Culture Workstream']);
  assert.equal(b.published, '2026-07-01', 'free-text "2026 Jul-Aug" resolves to the month start');
});

test('pubmed: drops untitled records rather than emitting them', () => {
  const records = parseArticles(fixture('pubmed-articles.xml'), 'pat_control');
  assert.equal(records.length, 2, 'the third fixture article has no title');
  assert.ok(records.every((r) => r.title));
});

// --- Europe PMC -------------------------------------------------------------

test('europepmc: maps a journal result and flags preprints', () => {
  const [article, preprint] = json('europepmc-search.json').resultList.result.map((r) =>
    epmcRecord(r, 'modeling_ml'),
  );

  assert.equal(article.is_preprint, false);
  assert.equal(article.pmid, '42472568');
  assert.equal(article.url, 'https://doi.org/10.1016/j.biotechadv.2026.108986');
  assert.deepEqual(article.authors, ['Kim D', 'Park S', 'Lee C']);

  assert.equal(preprint.is_preprint, true, 'source PPR marks a preprint');
  assert.equal(preprint.venue, 'Preprint', 'preprints have no journal title');
  assert.equal(preprint.pmid, null);
});

test('europepmc: falls back to a europepmc article URL when there is no DOI', () => {
  const r = epmcRecord({ id: 'PPR1', source: 'PPR', title: 'No DOI here' }, 'modeling_ml');
  assert.equal(r.url, 'https://europepmc.org/article/PPR/PPR1');
});

// --- bioRxiv ----------------------------------------------------------------

test('biorxiv: maps an API collection entry and splits semicolon authors', () => {
  const r = biorxivRecord(
    {
      doi: '10.1101/2026.07.20.999999',
      title: 'A digital twin for perfusion',
      authors: 'Smith, J.; Jones, A.',
      date: '2026-07-20',
      abstract: 'Abstract text.',
    },
    'modeling_ml',
    'medrxiv',
  );

  assert.equal(r.is_preprint, true);
  assert.equal(r.venue, 'medRxiv');
  assert.deepEqual(r.authors, ['Smith, J.', 'Jones, A.']);
  assert.equal(r.url, 'https://doi.org/10.1101/2026.07.20.999999');
});

// --- arXiv ------------------------------------------------------------------

test('arxiv: keeps in-window entries and stops at the first older one', () => {
  const { records, examined, returned } = parseArxiv(fixture('arxiv-feed.xml'), 'modeling_ml', WINDOW);

  assert.equal(returned, 4, 'the fixture feed carries four entries');
  assert.equal(examined, 3, 'the scan stops at the out-of-window entry rather than reading all four');
  assert.equal(records.length, 2, 'the scan breaks at the out-of-window entry');
  assert.deepEqual(
    records.map((r) => r.published),
    ['2026-07-25', '2026-07-22'],
  );
  assert.equal(records[0].venue, 'arXiv');
  assert.equal(records[0].is_preprint, true);
  assert.equal(records[0].url, 'http://arxiv.org/abs/2607.01234v1');
  assert.deepEqual(records[0].authors, ['A. Researcher', 'B. Coauthor']);
});

test('arxiv: with no DOI the external id is a title hash', () => {
  const { records } = parseArxiv(fixture('arxiv-feed.xml'), 'modeling_ml', WINDOW);
  assert.match(records[0].external_id, /^title:[0-9a-f]{16}$/);
});

// --- RSS --------------------------------------------------------------------

const FEED = { id: 'bpi', name: 'BioProcess International' };

test('rss: parses RSS 2.0, drops out-of-window items, keeps the feed name', () => {
  const records = parseRss(fixture('rss2.xml'), 'industry', FEED, WINDOW, []);

  assert.equal(records.length, 3, 'the June item is outside the window');
  assert.equal(records[0].venue, 'BioProcess International');
  assert.equal(records[0].feed_id, 'bpi');
  assert.equal(records[0].published, '2026-07-28');
  assert.equal(records[0].abstract, 'The facility adds four 2,000 L perfusion trains.', 'HTML is stripped');
  assert.deepEqual(records[0].authors, ['Staff Reporter']);
});

test('rss: term filter restricts to on-topic items', () => {
  const records = parseRss(fixture('rss2.xml'), 'pat_control', FEED, WINDOW, ['raman', 'in-line']);
  assert.equal(records.length, 1);
  assert.match(records[0].title, /Raman in-line monitoring/);
});

test('rss: parses Atom feeds through the same path', () => {
  const records = parseRss(fixture('atom.xml'), 'cmc_reg', { id: 'fda-cber', name: 'FDA' }, WINDOW, []);

  assert.equal(records.length, 1, 'the May entry is outside the window');
  assert.equal(records[0].published, '2026-07-24');
  assert.equal(records[0].url, 'https://www.fda.gov/g/1');
  assert.match(records[0].title, /comparability/);
});

// --- Crossref ---------------------------------------------------------------

test('crossref: extracts container title and issued date', () => {
  const patch = toPatch({
    'container-title': ['Biotechnology and Bioengineering'],
    issued: { 'date-parts': [[2026, 7, 3]] },
  });
  assert.deepEqual(patch, { venue: 'Biotechnology and Bioengineering', published: '2026-07-03' });
});

test('crossref: pads partial dates and returns null when there is nothing to add', () => {
  assert.equal(toPatch({ issued: { 'date-parts': [[2026]] } }).published, '2026-01-01');
  assert.equal(toPatch({}), null);
});
