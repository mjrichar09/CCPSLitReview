import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDoi, normalizeTitle, titleHash, externalId } from '../lib/util/identity.js';

test('DOIs normalise across resolver prefixes and case', () => {
  const expected = '10.1016/j.biotechadv.2026.108986';
  for (const input of [
    '10.1016/j.biotechadv.2026.108986',
    '10.1016/J.Biotechadv.2026.108986',
    'https://doi.org/10.1016/j.biotechadv.2026.108986',
    'http://dx.doi.org/10.1016/j.biotechadv.2026.108986',
    'doi:10.1016/j.biotechadv.2026.108986',
    ' 10.1016/j.biotechadv.2026.108986. ',
  ]) {
    assert.equal(normalizeDoi(input), expected, `failed for ${input}`);
  }
  assert.equal(normalizeDoi(null), null);
  assert.equal(normalizeDoi(''), null);
});

test('titles normalise across markup, case, punctuation and accents', () => {
  const a = normalizeTitle('Raman-based feedback control of <i>CHO</i> fed-batch culture.');
  const b = normalizeTitle('RAMAN BASED FEEDBACK CONTROL OF CHO FED BATCH CULTURE');
  assert.equal(a, b, 'the same paper from two sources must normalise identically');

  assert.equal(normalizeTitle('Bürger & Söhne: a study'), 'burger sohne a study');
  assert.equal(normalizeTitle(''), '');
  assert.equal(normalizeTitle(null), '');
});

test('title hashes agree for equivalent titles and differ for distinct ones', () => {
  assert.equal(
    titleHash('Perfusion seed train intensification'),
    titleHash('PERFUSION   seed-train, intensification!'),
  );
  assert.notEqual(
    titleHash('Perfusion seed train intensification'),
    titleHash('Perfusion seed train qualification'),
  );
});

test('external ids follow DOI, then PMID, then title hash', () => {
  assert.equal(externalId({ doi: '10.1/X', pmid: '123', title: 'T' }), 'doi:10.1/x');
  assert.equal(externalId({ pmid: '123', title: 'T' }), 'pmid:123');
  assert.match(externalId({ title: 'T' }), /^title:[0-9a-f]{16}$/);
});

test('the same paper from PubMed and Europe PMC collapses to one id', () => {
  const fromPubmed = externalId({ doi: '10.1016/J.X.2026.1', pmid: '42472568', title: 'A study.' });
  const fromEuropePmc = externalId({ doi: 'https://doi.org/10.1016/j.x.2026.1', title: 'A Study' });
  assert.equal(fromPubmed, fromEuropePmc);
});

test('namespaces keep a PMID from ever colliding with a DOI or title', () => {
  const ids = new Set([
    externalId({ doi: '10.1/a' }),
    externalId({ pmid: '10.1/a' }),
    externalId({ title: '10.1/a' }),
  ]);
  assert.equal(ids.size, 3);
});
