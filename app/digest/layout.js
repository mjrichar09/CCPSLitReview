import SessionProvider from './SessionProvider.jsx';

/**
 * The one auth context for everything under /digest — month pages,
 * favorites, and the discussion board all need a sign-in that survives
 * navigating between them. Chrome (the header, the page shell) is not here:
 * `[month]/layout.js` and the favorites/discussion pages each render their
 * own via `SiteHeader.jsx`, since a page's exact header slots (the archive
 * strip, category pills) vary by what it is.
 */
export default function DigestLayout({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
