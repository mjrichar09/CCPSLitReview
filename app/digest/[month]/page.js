import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllMonths, getReport } from '../../../lib/digest.js';
import { resolveItem, monthLabel } from '../shared.js';
import Health from '../Health.jsx';

/**
 * Every committed month is prerendered, and only those.
 *
 * `dynamicParams = false` makes an unknown month a build-time 404 rather than an
 * attempted render on the server — which matters here because Vercel's runtime
 * filesystem is read-only and ephemeral, so a runtime read would fail anyway.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const months = await getAllMonths();
  return months.map((month) => ({ month }));
}

export async function generateMetadata({ params }) {
  const { month } = await params;
  return { title: `Bioprocess Digest — ${month}` };
}

/**
 * The front page: the editorial overview and the Top 5, nothing else. Each
 * category's synthesis and item list moved to its own page under
 * `[category]/`, so this is an index — every Top-5 entry links straight to its
 * full article overview, and the section list below it links to the rest.
 */
export default async function MonthPage({ params }) {
  const { month } = await params;
  const report = await getReport(month);
  if (!report) notFound();

  return (
    <>
      <h1 className="report-title">{monthLabel(report.month_of)}</h1>
      <p className="report-summary">{report.summary}</p>

      {report.top_items?.length > 0 && (
        <section className="top5">
          <h2>Top {report.top_items.length} this month</h2>
          <ol className="top5-list">
            {report.top_items.map((t) => {
              const resolved = resolveItem(month, report, t.id);
              // A Top-5 id that no longer resolves would render as a blank row
              // in the most prominent block on the page. synthesize.js already
              // constrains ids to real papers; this is the second guard.
              if (!resolved) return null;
              return (
                <li key={t.id} className="top5-item">
                  <div>
                    <strong>
                      <Link href={resolved.href}>{resolved.item.title}</Link>
                    </strong>
                    <div className="item-meta">
                      {resolved.item.venue && <span>{resolved.item.venue}</span>}
                      {resolved.item.published && <span>{resolved.item.published}</span>}
                    </div>
                    <p className="item-summary">{t.reason}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section>
        <h2 className="side-head">Sections</h2>
        <ul className="side-list">
          {report.categories.map((c) => (
            <li key={c.id}>
              <Link href={`/digest/${month}/${c.id}`}>{c.name}</Link>
              <span className="cat-count"> · {c.items.length} {c.items.length === 1 ? 'item' : 'items'}</span>
            </li>
          ))}
        </ul>
      </section>

      <Health report={report} />
    </>
  );
}
