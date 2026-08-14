import { getAllMonths } from '../../../lib/digest.js';
import Sidebar from '../Sidebar.jsx';

/**
 * Shared chrome for one month: the two-column layout and the archive sidebar,
 * wrapping the front page and every section/article page nested under it.
 * `getAllMonths()` is fetched once per request here rather than duplicated in
 * every leaf page.
 */
export default async function MonthLayout({ children, params }) {
  const { month } = await params;
  const months = await getAllMonths();
  return (
    <div className="page-wide">
      <div className="layout">
        <main className="col-main">{children}</main>
        <Sidebar months={months} current={month} />
      </div>
    </div>
  );
}
