import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText } from '../lib/adapters/record.js';

/**
 * These are the shapes that actually reached the site: an RSS title with a
 * decimal entity for a curly apostrophe, and PubMed hex entities in abstracts
 * and author names. Anything cleanText fails to decode is rendered literally
 * by the viewer, so a regression here is visible to the reader.
 */

test('decodes decimal numeric entities', () => {
  assert.equal(cleanText('Single-Use Comes of Age&#8217;s Next?'), "Single-Use Comes of Age's Next?");
  assert.equal(cleanText('What&#8217;s Next'), "What's Next");
});

test('decodes hex numeric entities, in either case', () => {
  assert.equal(cleanText('fed&#x2011;batch'), 'fed-batch');
  assert.equal(cleanText('&#x3b1;-ketoacids'), 'α-ketoacids');
  assert.equal(cleanText('&#X3B1;-ketoacids'), 'α-ketoacids');
});

test('keeps accented letters in author names intact', () => {
  assert.equal(cleanText('Andr&#xe9; Dumetz'), 'André Dumetz');
  assert.equal(cleanText('Nikolina Sibin&#x10d;i&#x107;-Georgieva'), 'Nikolina Sibinčić-Georgieva');
  assert.equal(cleanText('Trujillo-Rold&#xe1;n'), 'Trujillo-Roldán');
});

test('decodes named entities', () => {
  assert.equal(cleanText('Tris &amp; buffer'), 'Tris & buffer');
  assert.equal(cleanText('p &lt; 0.05'), 'p < 0.05');
  assert.equal(cleanText('37&deg;C'), '37°C');
  assert.equal(cleanText('&quot;quoted&quot;'), '"quoted"');
});

test('one pass, so a literal entity is not turned into a live one', () => {
  // &amp;#8217; is a literal "&#8217;" in the source text, not an apostrophe.
  // Decoding &amp; first (the old behaviour) produced a live entity instead.
  assert.equal(cleanText('&amp;lt;'), '<');
  assert.ok(!cleanText('Tris &amp; Co').includes('&amp;'));
});

test('leaves unknown or malformed entities alone rather than mangling them', () => {
  assert.equal(cleanText('&notarealentity;'), '&notarealentity;');
  assert.equal(cleanText('AT&T 100% &'), 'AT&T 100% &');
  assert.equal(cleanText('&#x110000;'), '&#x110000;'); // out of range
  assert.equal(cleanText('&#0;'), '&#0;'); // null
  assert.equal(cleanText('&#xd800;'), '&#xd800;'); // lone surrogate
});

test('folds typographic punctuation to ASCII', () => {
  assert.equal(cleanText('the reader’s job'), "the reader's job");
  assert.equal(cleanText('“quoted”'), '"quoted"');
  assert.equal(cleanText('2012–2025'), '2012-2025');
  assert.equal(cleanText('Age—What’s Next?'), "Age - What's Next?");
  assert.equal(cleanText('and so on…'), 'and so on...');
});

test('still strips markup and collapses whitespace', () => {
  assert.equal(cleanText('<i>Title</i> with   <sub>2</sub> tags'), 'Title with 2 tags');
  assert.equal(cleanText('  padded\n\ttext  '), 'padded text');
  assert.equal(cleanText('nbsp separated'), 'nbsp separated');
});

test('handles empty and nullish input', () => {
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText(''), '');
});

test('strips inline markup that arrived entity-encoded', () => {
  // These only become tags once decoded, i.e. after the first strip has run.
  assert.equal(cleanText('EU-Avastin&lt;sup&gt;®&lt;/sup&gt;'), 'EU-Avastin ®');
  assert.equal(cleanText('H&lt;sub&gt;2&lt;/sub&gt;O'), 'H 2 O');
  assert.equal(cleanText('&lt;i&gt;in vitro&lt;/i&gt; assay'), 'in vitro assay');
});

test('does not eat a comparison that looks like a tag after decoding', () => {
  assert.equal(cleanText('p &lt; 0.05 and q &gt; 1'), 'p < 0.05 and q > 1');
  assert.equal(cleanText('IC50 &lt; 5 nM, n &gt; 3'), 'IC50 < 5 nM, n > 3');
});
