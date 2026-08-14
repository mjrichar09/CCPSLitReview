import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllMonths, getReport } from '../../../../../lib/digest.js';
import { itemSlug, otherAppearances } from '../../../shared.js';
import { Meta, Badges } from '../../../ItemRow.jsx';

/** Every item of every category of every committed month, and only those. */
export const dynamicParams = false;

/** Self-contained, for the same reason as [category]/page.js's generateStaticParams. */
export async function generateStaticParams() {
  const months = await getAllMonths();
  const params = [];
  for (const month of months) {
    const report = await getReport(month);
    if (!report) continue;
    for (const c of report.categories) {
      for (const item of c.items) params.push({ month, category: c.id, article: itemSlug(item.id) });
    }
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { month, category, article } = await params;
  const report = await getReport(month);
  const cat = report?.categories.find((c) => c.id === category);
  const item = cat?.items.find((i) => itemSlug(i.id) === article);
  return { title: item ? `${item.title} — Bioprocess Digest` : 'Bioprocess Digest' };
}

/**
 * One paper, in full: the summary and why-it-matters that section pages no
 * longer carry inline. The title links straight to the source (PubMed,
 * publisher, bioRxiv) — this page is the digest's own writing about the paper,
 * not a substitute for reading it.
 */
export default async function ArticlePage({ params }) {
  const { month, category, article } = await params;
  const report = await getReport(month);
  const cat = report?.categories.find((c) => c.id === category);
  const item = cat?.items.find((i) => itemSlug(i.id) === article);
  if (!cat || !item) notFound();

  const also = otherAppearances(month, report, item.id, category);

  return (
    <>
      <Link href={`/digest/${month}/${category}`} className="back-link">
        &larr; {cat.name}
      </Link>
      <h1 className="article-title">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h1>
      <div className="item-meta">
        <Meta item={item} />
      </div>
      <div className="item-tags">
        <Badges item={item} />
      </div>
      <p className="item-summary">{item.summary}</p>
      <p className="item-why">
        <span className="item-why-label">Why it matters: </span>
        {item.why_it_matters}
      </p>
      {also.length > 0 && (
        <p className="also-in">
          Also appears in:{' '}
          {also.map((a, i) => (
            <span key={a.category.id}>
              {i > 0 && ', '}
              <Link href={a.href}>{a.category.name}</Link>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
