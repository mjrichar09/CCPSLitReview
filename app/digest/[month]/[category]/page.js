import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllMonths, getReport } from '../../../../lib/digest.js';
import { itemSlug, monthLabel } from '../../shared.js';
import ItemRow from '../../ItemRow.jsx';

/** Every category of every committed month, and only those. */
export const dynamicParams = false;

/**
 * Self-contained rather than reading the parent `month` param: measured on
 * this Next.js/Turbopack build, a nested segment's `generateStaticParams`
 * received `params.month` as `undefined` despite `[month]/page.js` defining
 * `generateStaticParams` for it — the parent-to-child composition the docs
 * describe did not happen here. Enumerating (month, category) pairs directly
 * from `getAllMonths()` sidesteps that composition path entirely rather than
 * depending on behavior that did not hold in practice.
 */
export async function generateStaticParams() {
  const months = await getAllMonths();
  const params = [];
  for (const month of months) {
    const report = await getReport(month);
    if (!report) continue;
    for (const c of report.categories) params.push({ month, category: c.id });
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { month, category } = await params;
  const report = await getReport(month);
  const cat = report?.categories.find((c) => c.id === category);
  return { title: cat ? `${cat.name} — Bioprocess Digest` : 'Bioprocess Digest' };
}

/**
 * A section page: the category's synthesis paragraph, then an index of its
 * items. Each item links to its own article overview — the full summary and
 * why-it-matters live there, not here, so this page reads as a table of
 * contents rather than a rerun of the article page.
 */
export default async function CategoryPage({ params }) {
  const { month, category } = await params;
  const report = await getReport(month);
  const cat = report?.categories.find((c) => c.id === category);
  if (!cat) notFound();

  return (
    <>
      <Link href={`/digest/${month}`} className="back-link">
        &larr; {monthLabel(report.month_of)}
      </Link>
      <div className="cat-head">
        <h1 className="cat-title">{cat.name}</h1>
        <span className="cat-count">
          {cat.items.length} {cat.items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <p className="cat-synthesis">{cat.synthesis}</p>
      <ul className="item-list">
        {cat.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            overviewHref={`/digest/${month}/${category}/${itemSlug(item.id)}`}
          />
        ))}
      </ul>
    </>
  );
}
