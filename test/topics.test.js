import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import topicsDoc from '../config/topics.json' with { type: 'json' };
import baseConfig from '../config/digest.config.js';
import { loadConfig } from '../lib/config.js';
import {
  applyTopics,
  buildCategory,
  europepmcQuery,
  feedErrors,
  MAMMALIAN_ANCHOR,
  MAMMALIAN_PREFERENCE,
  pickNewer,
  pubmedQuery,
  topicErrors,
  topicsDocErrors,
} from '../lib/topics.js';
import { feedPrompt, parseAiJson, topicPrompt } from '../lib/topicPrompts.js';

const topic = (over = {}) => ({
  id: 'harvest_test',
  name: 'Harvest test',
  max_items: 10,
  rubric: 'Centrifugation, depth filtration and flocculation at harvest, and their effect on capture.',
  mammalian_preference: true,
  keywords: ['depth filtration', 'flocculation', 'soft sensor*'],
  anchor: 'bioprocess',
  sources: {},
  ...over,
});

test('the committed topics file is valid and builds a valid config', () => {
  assert.deepEqual(topicsDocErrors(topicsDoc), []);
  assert.doesNotThrow(() => loadConfig(applyTopics(baseConfig, topicsDoc)));
});

test('keywords build quoted [tiab] PubMed terms and the bioprocess anchor', () => {
  assert.equal(
    pubmedQuery(['depth filtration', 'soft sensor*']),
    `("depth filtration"[tiab] OR "soft sensor*"[tiab]) AND ${MAMMALIAN_ANCHOR}`,
  );
  assert.equal(pubmedQuery(['ICH'], 'none'), '("ICH"[tiab])');
});

test('Europe PMC quotes phrases and leaves single words and wildcards bare', () => {
  assert.equal(europepmcQuery(['Raman', 'near-infrared', 'soft sensor', 'chemometric*'], 'none'), '(Raman OR "near-infrared" OR "soft sensor" OR chemometric*)');
});

test('buildCategory: rubric + preference become scope; a custom query beats keywords', () => {
  const built = buildCategory(topic({ sources: { europepmc: { query: 'custom', pageSize: 50 } } }));
  assert.equal(built.scope, topic().rubric + MAMMALIAN_PREFERENCE);
  assert.match(built.sources.pubmed.query, /"depth filtration"\[tiab\]/);
  assert.deepEqual(built.sources.europepmc, { query: 'custom', pageSize: 50 });
  for (const k of ['rubric', 'keywords', 'anchor', 'mammalian_preference']) assert.ok(!(k in built), k);

  assert.equal(buildCategory(topic({ mammalian_preference: false })).scope, topic().rubric);
});

test('an AI-shaped topic spec drops into the real config and validates', () => {
  const doc = { ...topicsDoc, topics: [...topicsDoc.topics, topic()] };
  assert.deepEqual(topicsDocErrors(doc), []);
  const config = loadConfig(applyTopics(baseConfig, doc));
  assert.equal(config.categories.at(-1).id, 'harvest_test');
});

test('topicErrors catches the mistakes the editor has to explain', () => {
  const fields = (t) => topicErrors(t).map((e) => e.split(':')[0]);
  assert.deepEqual(fields(topic()), []);
  assert.ok(fields(topic({ id: 'Bad-Id' })).includes('id'));
  assert.ok(fields(topic({ rubric: 'too short' })).includes('rubric'));
  assert.ok(fields(topic({ max_items: 0 })).includes('max_items'));
  assert.ok(fields(topic({ keywords: ['has "quotes"'] })).includes('keywords'));
  // Literature sources on with nothing to search for.
  assert.ok(fields(topic({ keywords: [] })).includes('keywords'));
  assert.deepEqual(fields(topic({ keywords: [], sources: { pubmed: { enabled: false }, europepmc: { enabled: false } } })), []);
  // arXiv on with no query would pull whole subject areas.
  assert.ok(fields(topic({ sources: { arxiv: { enabled: true } } })).includes('sources.arxiv'));
  assert.deepEqual(fields(topic({ sources: { arxiv: { enabled: true, query: 'bioreactor' } } })), []);
  assert.ok(fields(topic({ sources: { scholar: {} } })).includes('sources.scholar'));
});

test('duplicate topic and feed ids are refused', () => {
  const doc = { topics: [topic(), topic()], feeds: [topicsDoc.feeds[0], topicsDoc.feeds[0]] };
  const errors = topicsDocErrors(doc).join('\n');
  assert.match(errors, /duplicate topic id "harvest_test"/);
  assert.match(errors, /duplicate feed id/);
});

test('feedErrors wants a real feed URL and a slug id', () => {
  const feed = { id: 'gen', name: 'GEN', url: 'https://www.genengnews.com/feed/', tags: ['trade'] };
  assert.deepEqual(feedErrors(feed), []);
  assert.equal(feedErrors({ ...feed, url: 'www.example.com' }).length, 1);
  assert.equal(feedErrors({ ...feed, id: 'Has Spaces' }).length, 1);
});

test('pickNewer: newer saved version wins, a tie goes to the file', () => {
  const file = { version: 4, topics: [], feeds: [] };
  const row = (id) => ({ id, body: { topics: [1], feeds: [] }, created_at: '2026-10-08T00:00:00Z' });
  assert.equal(pickNewer(file, null).source, 'file');
  assert.equal(pickNewer(file, row(4)).source, 'file');
  assert.equal(pickNewer(file, row(3)).source, 'file');
  const picked = pickNewer(file, row(5));
  assert.equal(picked.source, 'saved');
  assert.equal(picked.doc.version, 5);
  assert.equal(pickNewer({ version: null, topics: [], feeds: [] }, row(1)).source, 'saved');
});

test('parseAiJson tolerates code fences and chatter around the JSON', () => {
  assert.deepEqual(parseAiJson('```json\n{"id":"x"}\n```'), { id: 'x' });
  assert.deepEqual(parseAiJson('Here you go:\n[{"id":"a"}]\nHope that helps!'), [{ id: 'a' }]);
  assert.throws(() => parseAiJson(''), /Nothing pasted/);
  assert.throws(() => parseAiJson('no json here'), /No JSON/);
  assert.throws(() => parseAiJson('{"id": }'), /not valid JSON/);
});

test('the AI prompts carry the current topics and feeds and end ready for a request', () => {
  const tp = topicPrompt({ topics: topicsDoc.topics, feeds: topicsDoc.feeds });
  for (const t of topicsDoc.topics) assert.ok(tp.includes(t.id), t.id);
  assert.match(tp, /My request: $/);
  const fp = feedPrompt({ feeds: topicsDoc.feeds, topics: topicsDoc.topics });
  for (const f of topicsDoc.feeds) assert.ok(fp.includes(f.url), f.id);
  assert.match(fp, /My request: $/);
});

test('the monthly workflow syncs topics before validating, and commits the file', () => {
  const yml = readFileSync(new URL('../.github/workflows/digest.yml', import.meta.url), 'utf8');
  const sync = yml.indexOf('node scripts/sync-topics.mjs');
  const validate = yml.indexOf('name: Validate config');
  assert.ok(sync > 0 && sync < validate, 'sync step must run before config validation');
  assert.match(yml, /git add data\/digest config\/topics\.json/);
});
