import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dedupe } from '../lib/util/dedupe.js';

const base = (over = {}) => ({
  source: 'pubmed',
  categories: ['upstream_pd'],
  external_id: 'pmid:1',
  doi: null,
  pmid: '1',
  title: 'Perfusion seed train intensification for CHO',
  abstract: 'Short.',
  authors: ['A'],
  venue: 'J Biotech',
  published: '2026-07-10',
  url: 'https://pubmed.ncbi.nlm.nih.gov/1/',
  is_preprint: false,
  ...over,
});

test('collapses records sharing an external_id', () => {
  const { items, stats } = dedupe([base(), base({ categories: ['intensification'] })]);
  assert.equal(items.length, 1);
  assert.equal(stats.byId, 1);
  assert.deepEqual(items[0].categories.sort(), ['intensification', 'upstream_pd']);
});

test('collapses the same paper arriving from PubMed and Europe PMC with different ids', () => {
  // The case the stage exists for: PubMed keys on PMID, Europe PMC on DOI, so
  // the identifiers never collide even though it is one paper.
  const fromPubmed = base({ external_id: 'pmid:1', doi: null, abstract: 'A long structured abstract with detail.' });
  const fromEpmc = base({
    source: 'europepmc',
    external_id: 'doi:10.1/x',
    doi: '10.1/x',
    pmid: null,
    title: 'Perfusion seed train intensification for CHO.',
    abstract: 'Short.',
    categories: ['intensification'],
  });

  const { items, stats } = dedupe([fromPubmed, fromEpmc]);

  assert.equal(items.length, 1);
  assert.equal(stats.byTitle, 1);
  const merged = items[0];
  assert.equal(merged.doi, '10.1/x', 'the DOI is carried over from the Europe PMC copy');
  assert.equal(merged.pmid, '1', 'the PMID is kept from the PubMed copy');
  assert.match(merged.abstract, /long structured/, 'the richer abstract wins');
  assert.deepEqual(merged.categories.sort(), ['intensification', 'upstream_pd']);
  assert.deepEqual(merged.sources.sort(), ['europepmc', 'pubmed']);
});

test('does not merge distinct papers that share vocabulary', () => {
  const a = base({ external_id: 'pmid:1', title: 'Perfusion seed train intensification for CHO cells' });
  const b = base({ external_id: 'pmid:2', title: 'Fed-batch feeding strategy optimisation for CHO cells' });
  const { items } = dedupe([a, b]);
  assert.equal(items.length, 2);
});

test('short titles are never fuzzy-matched', () => {
  // Under four tokens the Jaccard test is too easy to satisfy by accident.
  const a = base({ external_id: 'pmid:1', title: 'Perfusion at scale' });
  const b = base({ external_id: 'pmid:2', title: 'Perfusion at bench' });
  const { items } = dedupe([a, b]);
  assert.equal(items.length, 2);
});

test('an item is a preprint only if every copy of it is', () => {
  const preprint = base({ external_id: 'doi:10.1101/x', is_preprint: true, source: 'biorxiv' });
  const published = base({ external_id: 'pmid:9', is_preprint: false, title: preprint.title });
  const { items } = dedupe([preprint, published]);
  assert.equal(items.length, 1);
  assert.equal(items[0].is_preprint, false, 'once it is published it is no longer a preprint');
});

test('reports counts that add up', () => {
  const { items, stats } = dedupe([base(), base(), base({ external_id: 'pmid:2', title: 'A completely different paper about media hydrolysates' })]);
  assert.equal(stats.input, 3);
  assert.equal(stats.output, items.length);
  assert.equal(stats.removed, stats.input - stats.output);
});
