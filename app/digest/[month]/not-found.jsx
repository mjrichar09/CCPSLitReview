import Link from 'next/link';

/**
 * Shared 404 for this segment and everything nested under it (a bad month, a
 * bad category, a bad article slug) — wrapped by `[month]/layout.js`, which is
 * why there is no `.page-wide` wrapper here.
 */
export default function NotFound() {
  return (
    <>
      <h1 className="report-title">Not part of the digest</h1>
      <p className="report-summary">
        That month, section, or article was not found. <Link href="/digest">See the latest month</Link>.
      </p>
    </>
  );
}
