import Image from 'next/image';
import Link from 'next/link';
import { getAllMonths, getReport } from '../../../lib/digest.js';
import ArchiveNav from '../ArchiveNav.jsx';
import CategoryNav from '../CategoryNav.jsx';
import SessionProvider from '../SessionProvider.jsx';
import SignIn from '../SignIn.jsx';

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
 * `SessionProvider` wraps the whole month so a sign-in survives navigation
 * between sections. It is a client component with server-rendered children,
 * which keeps every page below it static.
 */
export default async function MonthLayout({ children, params }) {
  const { month } = await params;
  const [months, report] = await Promise.all([getAllMonths(), getReport(month)]);
  // An unknown month still renders this layout around not-found.jsx.
  const categories = report?.categories ?? [];

  return (
    <SessionProvider>
      <header className="site-header">
        <div className="site-header-top">
          <Link href="/digest" className="site-title">
            {/* Served at 3x its rendered size, and keyed to transparency so it
                sits on either theme without a white plate behind it. */}
            <Image src="/logo.png" alt="" width={32} height={32} className="site-logo" priority />
            Cell Culture Literature Review
          </Link>
          <ArchiveNav months={months} current={month} />
          <div className="site-header-account">
            <SignIn />
          </div>
        </div>
        <CategoryNav month={month} categories={categories} />
      </header>
      <div className="layout">
        <main className="col-main">{children}</main>
      </div>
    </SessionProvider>
  );
}
