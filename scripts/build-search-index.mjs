#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAllItemsIndex } from '../lib/allItems.js';

/**
 * A slim, client-fetchable search index — every paper's title/authors/venue
 * plus its section-page href — generated at build time and served as a
 * plain static asset under public/, not a runtime API route (this app has
 * none). Full summaries/why_it_matters are left out on purpose: this file
 * ships to every visitor's browser the moment they touch the search box,
 * and finding a paper needs its title/authors/venue, not the whole
 * write-up.
 */
async function main() {
  const index = await getAllItemsIndex();
  const slim = index.map((e) => ({
    id: e.item.id,
    title: e.item.title,
    authors: e.item.authors ?? [],
    venue: e.item.venue ?? null,
    published: e.item.published ?? null,
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
