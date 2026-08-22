#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAllItemsIndex } from '../lib/allItems.js';

/**
 * A slim, client-fetchable search index — every paper's title/authors/venue
 * plus its generated summary/why_it_matters and its section-page href —
 * generated at build time and served as a plain static asset under public/,
 * not a runtime API route (this app has none). This is "full text" only in
 * the sense of everything the app actually stores: no raw article body or
 * abstract is ever kept past the score stage (see CLAUDE.md, "Store title,
 * abstract, metadata, and link only"), so search covers exactly what a
 * reader already sees on the page — title, authors, venue, and the written
 * summary/why_it_matters — not the paper's own full text.
 */
async function main() {
  const index = await getAllItemsIndex();
  const slim = index.map((e) => ({
    id: e.item.id,
    title: e.item.title,
    authors: e.item.authors ?? [],
    venue: e.item.venue ?? null,
    published: e.item.published ?? null,
    summary: e.item.summary ?? null,
    why_it_matters: e.item.why_it_matters ?? null,
    href: e.href,
  }));

  const out = path.join(process.cwd(), 'public', 'search-index.json');
  await writeFile(out, JSON.stringify(slim), 'utf8');
  process.stderr.write(`search index: ${slim.length} papers -> public/search-index.json\n`);
}

main().catch((err) => {
  process.stderr.write(`search index build failed: ${err.message}\n`);
  process.exit(1);
});
