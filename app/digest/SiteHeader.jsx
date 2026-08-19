import Image from 'next/image';
import Link from 'next/link';
import SearchBar from './SearchBar.jsx';
import SignIn from './SignIn.jsx';
import ThemeToggle from './ThemeToggle.jsx';

/**
 * The title + account row shared by every /digest page, plus the two extra
 * rows a month-scoped page adds: the archive strip (`archive`, next to the
 * title) and the category pills (`categories`, a full row below). Pages
 * outside a month — favorites, the discussion board — render this bare, with
 * both slots empty.
 *
 * A Next.js layout can only extend the page content it wraps, not reach back
 * up into a *parent* layout's chrome — so this can't live only in
 * `[month]/layout.js` if favorites/discussion (siblings of `[month]`, not
 * children of it) are going to share the same persistent header. Factored out
 * once, used by both.
 */
export default function SiteHeader({ archive, categories }) {
  return (
    <header className="site-header">
      <div className="site-header-top">
        <Link href="/digest" className="site-title">
          {/* Served at 3x its rendered size, and keyed to transparency so it
              sits on either theme without a white plate behind it. */}
          <Image src="/logo.png" alt="" width={32} height={32} className="site-logo" priority />
          Cell Culture Literature Review
        </Link>
        {archive}
        <nav className="top-nav" aria-label="More pages">
          <Link href="/digest/favorites" className="archive-link" data-reaction-target="favorites">
            Favorites
          </Link>
          <Link href="/digest/discussion" className="archive-link">
            Discussion
          </Link>
        </nav>
        <SearchBar />
        <div className="site-header-account">
          <ThemeToggle />
          <SignIn />
        </div>
      </div>
      {categories}
    </header>
  );
}
