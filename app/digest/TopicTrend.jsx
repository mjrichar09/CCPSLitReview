import { getCategoryTrend } from '../../lib/digest.js';
import { topicStyle } from '../../lib/topicColors.js';

const MAX_MONTHS = 12;
const short = (month) => new Date(`${month}-15T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
const long = (month) => new Date(`${month}-15T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Relevant papers per month for one topic: a small single-series bar chart
 * beside the topic's heading. "Relevant" is what passed scoring before the
 * topic's display cap, which says more about how active the field was than
 * the capped count shown on the page; both are in each bar's tooltip.
 *
 * Plain HTML bars rather than SVG, so the hover/focus tooltip and the
 * keyboard focus ring come from CSS with no client JavaScript. One series in
 * the topic's own color, no legend (the caption names it), the current
 * month's value labelled directly, and a visually hidden table for screen
 * readers.
 */
export default async function TopicTrend({ categoryId, month }) {
  const data = (await getCategoryTrend(categoryId)).slice(-MAX_MONTHS);
  if (data.length < 2) return null; // One bar is not a trend.
  const max = Math.max(...data.map((d) => d.relevant), 1);

  return (
    <figure className="trend" style={topicStyle(categoryId)}>
      <figcaption className="trend-caption">Relevant papers per month</figcaption>
      <div className="trend-plot" aria-hidden="true">
        {data.map((d) => {
          const current = d.month === month;
          return (
            <div key={d.month} className={current ? 'trend-col trend-current' : 'trend-col'}>
              <span className="trend-value">{d.relevant}</span>
              <span className="trend-bar" style={{ height: `${Math.max(4, (d.relevant / max) * 100)}%` }} />
              <span className="trend-month">{short(d.month)}</span>
              <span className="trend-tip" role="tooltip">
                <strong>{long(d.month)}</strong>
                <span>
                  {d.relevant} relevant · {d.shown} shown
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Relevant and shown papers per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Relevant</th>
            <th scope="col">Shown</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{long(d.month)}</th>
              <td>{d.relevant}</td>
              <td>{d.shown}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
