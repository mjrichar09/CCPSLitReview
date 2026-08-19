import { getAllMonths, getReport } from '../../../lib/digest.js';
import ArchiveNav from '../ArchiveNav.jsx';
import CategoryNav from '../CategoryNav.jsx';
import SiteHeader from '../SiteHeader.jsx';

/**
 * Shared chrome for one month.
 *
 * The header is sticky and full-bleed, and carries everything a reader needs to
 * orient themselves: the site title, which month they are in, every section,
 * and their account. All of it was previously scattered — the section banner
 * was re-rendered by each page and the archive sat in a sidebar column that
 * scrolled away — which meant that partway down a long section page there was
 * no way to change section or check the month without scrolling back up.
 *
 * `SessionProvider` lives in the parent `app/digest/layout.js` now, shared
 * with the favorites and discussion pages rather than re-wrapped here.
 */
export default async function MonthLayout({ children, params }) {
  const { month } = await params;
  const [months, report] = await Promise.all([getAllMonths(), getReport(month)]);
  // An unknown month still renders this layout around not-found.jsx.
  const categories = report?.categories ?? [];

  return (
    <>
      <SiteHeader
        archive={<ArchiveNav months={months} current={month} />}
        categories={<CategoryNav month={month} categories={categories} />}
      />
      <div className="layout">
        <main className="col-main">{children}</main>
        {/* In the layout rather than the front page's Health footer, so the
            credit appears on section pages too. */}
        <footer className="site-credit">Created by Mark Richards. All Rights Reserved.</footer>
      </div>
    </>
  );
}
