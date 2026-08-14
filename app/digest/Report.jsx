import Link from 'next/link';

/**
 * One month, rendered. Shared by /digest (latest) and /digest/[month].
 *
 * Server component, no client JS: every value here is baked in at build time
 * from the committed JSON. Nothing on this page reads the filesystem at request
 * time — see CLAUDE.md, "Pages are static/SSG".
 */
export default function Report({ report, months, current }) {
  const byId = new Map(report.categories.flatMap((c) => c.items).map((i) => [i.id, i]));

  return (
    <div className="page-wide">
      <div className="layout">
        <main className="col-main">
          <h1 className="report-title">{monthLabel(report.month_of)}</h1>
          <p className="report-summary">{report.summary}</p>

          {report.top_items?.length > 0 && (
            <section className="top5">
              <h2>Top {report.top_items.length} this month</h2>
              <ol className="top5-list">
                {report.top_items.map((t) => {
                  const item = byId.get(t.id);
                  // A Top-5 id that no longer resolves would render as a blank
                  // row in the most prominent block on the page. synthesize.js
                  // constrains ids to real papers; this is the second guard.
                  if (!item) return null;
                  return (
                    <li key={t.id} className="top5-item">
                      <div>
                        <ItemTitle item={item} />
                        <div className="item-meta">
                          <Meta item={item} />
                        </div>
                        <p className="item-summary">{t.reason}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {report.categories.map((category) => (
            <section key={category.id} className="cat-section" id={category.id}>
              <div className="cat-head">
                <h2 className="cat-title">{category.name}</h2>
                <span className="cat-count">
                  {category.items.length} {category.items.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <p className="cat-synthesis">{category.synthesis}</p>
              <ul className="item-list">
                {category.items.map((item) => (
                  <li key={item.id} className="item">
                    <h3 className="item-title">
                      <ItemTitle item={item} />
                    </h3>
                    <div className="item-meta">
                      <Meta item={item} />
                    </div>
                    <p className="item-summary">{item.summary}</p>
                    <p className="item-why">
                      <span className="item-why-label">Why it matters: </span>
                      {item.why_it_matters}
                    </p>
                    <div className="item-tags">
                      {item.is_recurring ? (
                        <span className="badge badge-recurring">
                          {item.previously_seen ? `Recurring · first seen ${item.previously_seen}` : 'Recurring'}
                        </span>
                      ) : (
                        <span className="badge badge-new">New</span>
                      )}
                      {item.is_preprint && <span className="badge badge-recurring">Preprint</span>}
                      {/* Surfaced, not hidden: the summariser sets this when the
                          abstract could not support a real summary, and the
                          reader should weigh the item accordingly. */}
                      {item.thin_abstract && <span className="badge badge-recurring">Thin abstract</span>}
                      <span className="item-score">relevance {item.relevance_score}/5</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <Health report={report} />
        </main>

        <aside className="col-side">
          <h2 className="side-head">Archive</h2>
          <ul className="side-list">
            {months.map((m) => (
              <li key={m}>
                {m === current ? (
                  <strong>{monthLabel(`${m}-01`)}</strong>
                ) : (
                  <Link href={`/digest/${m}`}>{monthLabel(`${m}-01`)}</Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function ItemTitle({ item }) {
  if (!item.url) return <>{item.title}</>;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer">
      {item.title}
    </a>
  );
}

function Meta({ item }) {
  return (
    <>
      {item.venue && <span>{item.venue}</span>}
      {item.published && <span>{item.published}</span>}
      {item.authors?.length > 0 && <span>{formatAuthors(item.authors)}</span>}
    </>
  );
}

/**
 * The footer the brief asks for: "so I can see at a glance if an adapter has
 * been silently failing for three months". Adapters fail soft, so a dead source
 * produces a quiet month rather than an error — this is where that shows.
 */
function Health({ report }) {
  const health = report.source_health ?? [];
  if (health.length === 0 && !report.run_stats) return null;

  const bySource = new Map();
  for (const h of health) {
    const row = bySource.get(h.source) ?? { source: h.source, ok: 0, degraded: 0, failed: 0, fetched: 0 };
    if (h.status === 'failed') row.failed += 1;
    else if (h.status === 'degraded') row.degraded += 1;
    else row.ok += 1;
    row.fetched += h.fetched ?? 0;
    bySource.set(h.source, row);
  }

  const stats = report.run_stats;
  return (
    <footer className="health">
      <h2>Source health</h2>
      <div className="health-grid">
        {[...bySource.values()].map((row) => (
          <span key={row.source} className={`health-item ${statusClass(row)}`}>
            {row.source} {row.fetched}
            {row.failed > 0 && ` · ${row.failed} failed`}
            {row.degraded > 0 && ` · ${row.degraded} degraded`}
          </span>
        ))}
      </div>
      {stats && (
        <p className="run-stats">
          Generated {report.generated_at?.slice(0, 10)} · {stats.calls} model calls · $
          {Number(stats.total_cost_usd).toFixed(2)}
        </p>
      )}
    </footer>
  );
}

function statusClass(row) {
  if (row.failed > 0) return 'health-failed';
  if (row.degraded > 0) return 'health-degraded';
  return 'health-ok';
}

function formatAuthors(authors) {
  if (authors.length <= 3) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`;
}

/** `YYYY-MM-01` → "August 2026". Built in UTC so the label cannot slip a month. */
function monthLabel(monthOf) {
  const d = new Date(`${monthOf}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
