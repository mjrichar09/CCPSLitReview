import { XMLParser } from 'fast-xml-parser';
import { fetchJson, fetchText } from '../util/http.js';
import { toDay } from '../util/window.js';
import { makeRecord, xmlText, asArray, isoDate, cleanText } from './record.js';

const ESEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const EFETCH_CHUNK = 200;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

export const id = 'pubmed';

/**
 * NCBI E-utilities: esearch for PMIDs in the window, then efetch for records.
 *
 * The rate limit is the thing to respect here — 3 req/s unkeyed, 10 with
 * NCBI_API_KEY. Which bucket we got is reported in health so a missing key is
 * visible rather than just slow.
 */
export async function fetchCategory({ category, settings, window, limiters, env = process.env }) {
  const apiKey = env.NCBI_API_KEY || null;
  const rps = apiKey ? settings.rps?.keyed ?? 10 : settings.rps?.unkeyed ?? 3;
  const limiter = limiters.for('pubmed', { rps, concurrency: settings.concurrency ?? 3 });
  const notes = apiKey ? [] : ['no NCBI_API_KEY — throttled to the unkeyed 3 req/s limit'];

  const search = new URLSearchParams({
    db: 'pubmed',
    term: category.sources.pubmed.query ?? settings.query,
    retmax: String(settings.retmax ?? 200),
    retmode: 'json',
    datetype: 'edat',
    mindate: toDay(window.from).replace(/-/g, '/'),
    maxdate: toDay(window.to).replace(/-/g, '/'),
    sort: 'date',
  });
  if (apiKey) search.set('api_key', apiKey);

  const searchResult = await limiter.schedule(() => fetchJson(`${ESEARCH}?${search}`));
  const pmids = searchResult?.esearchresult?.idlist ?? [];
  const total = Number(searchResult?.esearchresult?.count ?? pmids.length);
  if (total > pmids.length) {
    notes.push(`${total} hits, capped at retmax=${settings.retmax ?? 200}`);
  }
  if (pmids.length === 0) return { records: [], notes };

  const records = [];
  for (let i = 0; i < pmids.length; i += EFETCH_CHUNK) {
    const chunk = pmids.slice(i, i + EFETCH_CHUNK);
    const params = new URLSearchParams({
      db: 'pubmed',
      id: chunk.join(','),
      retmode: 'xml',
    });
    if (apiKey) params.set('api_key', apiKey);
    const xml = await limiter.schedule(() => fetchText(`${EFETCH}?${params}`, { accept: 'application/xml' }));
    records.push(...parseArticles(xml, category.id));
  }

  return { records, notes };
}

/**
 * Inline formatting tags PubMed embeds inside ArticleTitle and AbstractText.
 * They must be removed from the raw XML *before* parsing: the parser splits
 * mixed content into a `#text` string plus sibling child nodes, which loses the
 * original ordering, so "control of <i>CHO</i> fed-batch" would come back as
 * "control offed-batch" with the gene name dropped. None of these names is ever
 * a structural PubMed element, so stripping them from the string is safe.
 */
const INLINE_TAGS = /<\/?(i|b|u|em|strong|sub|sup)(\s[^>]*)?>/gi;

/** Exported for tests: parse an efetch PubmedArticleSet payload. */
export function parseArticles(xml, categoryId) {
  const doc = parser.parse(String(xml).replace(INLINE_TAGS, ''));
  const articles = asArray(doc?.PubmedArticleSet?.PubmedArticle);
  const out = [];

  for (const article of articles) {
    const citation = article?.MedlineCitation;
    const art = citation?.Article;
    if (!art) continue;

    const ids = asArray(article?.PubmedData?.ArticleIdList?.ArticleId);
    const doi = ids.find((x) => x?.['@_IdType'] === 'doi');
    // A `pmc` id means NCBI is legitimately hosting the full text (open access,
    // or an NIH-funded author manuscript) — link straight there instead of the
    // abstract page's own "Full text links" click-through. Never a substitute
    // for a real paywall: this id is only ever present when PMC actually has
    // the article, never invented or guessed.
    const pmc = ids.find((x) => x?.['@_IdType'] === 'pmc');
    const pmid = xmlText(citation?.PMID);

    const record = makeRecord({
      source: 'pubmed',
      categoryId,
      title: xmlText(art.ArticleTitle),
      abstract: abstractText(art.Abstract?.AbstractText),
      authors: authorNames(art.AuthorList?.Author),
      venue: xmlText(art.Journal?.Title) || xmlText(citation?.MedlineJournalInfo?.MedlineTA),
      published: publishedDate(art),
      pmid,
      doi: doi ? xmlText(doi) : null,
      url: pmc
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${xmlText(pmc)}/`
        : pmid
          ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
          : null,
    });
    if (record) out.push(record);
  }
  return out;
}

/** Structured abstracts arrive as labelled sections; keep the labels. */
function abstractText(node) {
  const parts = asArray(node).map((part) => {
    const label = typeof part === 'object' ? part['@_Label'] : null;
    const body = xmlText(part);
    if (!body) return '';
    return label ? `${cleanText(label)}: ${body}` : body;
  });
  return parts.filter(Boolean).join(' ');
}

function authorNames(node) {
  return asArray(node)
    .map((a) => {
      if (a?.CollectiveName) return xmlText(a.CollectiveName);
      const last = xmlText(a?.LastName);
      const fore = xmlText(a?.ForeName) || xmlText(a?.Initials);
      if (!last) return '';
      return fore ? `${fore} ${last}` : last;
    })
    .filter(Boolean);
}

/** Prefer the electronic ArticleDate; fall back to the journal issue date. */
function publishedDate(art) {
  const articleDate = asArray(art.ArticleDate)[0];
  if (articleDate) {
    const d = isoDate(xmlText(articleDate.Year), xmlText(articleDate.Month), xmlText(articleDate.Day));
    if (d) return d;
  }
  const pub = art.Journal?.JournalIssue?.PubDate;
  if (pub) {
    const d = isoDate(xmlText(pub.Year), xmlText(pub.Month), xmlText(pub.Day));
    if (d) return d;
    // MedlineDate is free text like "2026 Jul-Aug"; take the leading year.
    const medline = xmlText(pub.MedlineDate);
    const m = medline.match(/(\d{4})\s*([A-Za-z]{3})?/);
    if (m) return isoDate(m[1], m[2], null);
  }
  return null;
}
