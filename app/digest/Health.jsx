/**
 * The footer the brief asks for: "so I can see at a glance if an adapter has
 * been silently failing for three months". Adapters fail soft, so a dead
 * source produces a quiet month rather than an error — this is where that
 * shows. Lives on the front page only; it is a report-level fact, not a
 * per-section one.
 */
export default function Health({ report }) {
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
      {/* Generation date and call count stay — they say how fresh the month is
          and how much work produced it. The dollar figure is removed: it is an
          operating cost of running the digest, not something a reader of it
          needs. It remains in the committed report's `run_stats` either way. */}
      {stats && (
        <p className="run-stats">
          Generated {report.generated_at?.slice(0, 10)} · {stats.calls} model calls
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
