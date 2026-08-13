import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../util/http.js';
import { resolveFeeds } from '../config.js';
import { makeRecord, xmlText, asArray, cleanText } from './record.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

export const id = 'rss';

/**
 * One fetch per feed URL per run, shared across categories.
 *
 * Categories run concurrently and most subscribe to overlapping feeds, so
 * without this the same document is pulled once per category — eight identical
 * requests to the FDA feed in a ten-category run, which earned us intermittent
 * 401s from their rate limiter. Caching the *promise* rather than the result
 * also collapses the concurrent requests into one.
 *
 * Scope is the process, and a process is one run, so there is nothing to
 * invalidate. `resetFeedCache` exists for tests.
 */
const feedCache = new Map();

export function resetFeedCache() {
  feedCache.clear();
}

function fetchFeedOnce(url) {
  let pending = feedCache.get(url);
  if (!pending) {
    pending = fetchText(url, {
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
      // The FDA feed answers a burst with 401 rather than 429; without this a
      // transient throttle looks like a permanent auth failure.
      retryStatuses: [401],
    });
    feedCache.set(url, pending);
  }
  return pending;
}

/**
 * Trade press and regulatory feeds. Handles RSS 2.0 and Atom.
 *
 * Each feed fails independently: one dead URL is recorded against that feed and
 * the rest of the run continues, because a trade site changing its feed path
 * should not cost a month's regulatory coverage.
 */
export async function fetchCategory({ category, settings, window, limiters, config }) {
  const limiter = limiters.for('rss', {
    rps: settings.rps ?? 2,
    concurrency: settings.concurrency ?? 4,
  });
  const feeds = resolveFeeds(config, category);
  if (feeds.length === 0) return { records: [], notes: ['no feeds matched this category'] };

  const terms = (category.sources?.rss?.terms ?? []).map((t) => t.toLowerCase());
  const records = [];
  const notes = [];
  const failures = [];

  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const xml = await limiter.schedule(() => fetchFeedOnce(feed.url));
        const items = parseFeed(xml, category.id, feed, window, terms);
        records.push(...items);
        notes.push(`${feed.id}: ${items.length}`);
      } catch (err) {
        failures.push(`${feed.id}: ${err.message}`);
      }
    }),
  );

  if (failures.length > 0) {
    notes.push(`failed feeds — ${failures.join('; ')}`);
  }
  return { records, notes, degraded: failures.length > 0, failedFeeds: failures.length, totalFeeds: feeds.length };
}

/** Exported for tests: parse one feed document into in-window records. */
export function parseFeed(xml, categoryId, feed, window, terms = []) {
  const doc = parser.parse(xml);
  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomEntries = asArray(doc?.feed?.entry);
  const raw = rssItems.length > 0 ? rssItems : atomEntries;
  const isAtom = rssItems.length === 0 && atomEntries.length > 0;

  const out = [];
  for (const item of raw) {
    const title = xmlText(item?.title);
    const body = isAtom
      ? xmlText(item?.summary) || xmlText(item?.content)
      : xmlText(item?.description) || xmlText(item?.['content:encoded']);

    if (terms.length > 0) {
      const haystack = `${title} ${body}`.toLowerCase();
      if (!terms.some((t) => haystack.includes(t))) continue;
    }

    const published = parseDate(
      xmlText(item?.pubDate) || xmlText(item?.published) || xmlText(item?.updated) || xmlText(item?.['dc:date']),
    );
    if (window && published) {
      const t = Date.parse(`${published}T00:00:00Z`);
      if (Number.isFinite(t) && (t < window.from.getTime() || t > window.to.getTime())) continue;
    }

    const link = isAtom
      ? asArray(item?.link).find((l) => !l?.['@_rel'] || l?.['@_rel'] === 'alternate')?.['@_href'] ?? xmlText(item?.link)
      : xmlText(item?.link) || xmlText(item?.guid);

    const record = makeRecord({
      source: 'rss',
      categoryId,
      title,
      // Feed descriptions are teaser text, not abstracts. Stored as-is; we
      // never fetch the article body.
      abstract: truncate(cleanText(body), 1500),
      authors: [xmlText(item?.['dc:creator']) || xmlText(item?.author?.name) || ''].filter(Boolean),
      venue: feed?.name ?? null,
      published,
      url: link || null,
      extra: { feed_id: feed?.id ?? null },
    });
    if (record) out.push(record);
  }
  return out;
}

function parseDate(value) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function truncate(text, max) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
