import Link from 'next/link';
import ImportsPanel from '../ImportsPanel.jsx';

export const metadata = {
  title: 'Imported papers — Cell Culture Literature Review',
};

/**
 * The user-added section: papers readers bring in themselves, either one DOI
 * at a time or in bulk from a conference deck.
 *
 * A static shell around a client island, like every other reader-feedback
 * surface here. It has to be: imported papers live in Postgres (they are
 * reader-supplied content, and the committed month files are written only by
 * the pipeline — see CLAUDE.md, "Storage layer"), and this app reads Postgres
 * from the browser only. So the page prerenders to a heading and an empty
 * frame, and the imports arrive after hydration, exactly as vote tallies and
 * comment counts already do.
 */
export default function ImportsPage() {
  return (
    <>
      <header className="report-header">
        <h1 className="report-title">Imported papers</h1>
        <p className="report-sub">
          Papers added by readers rather than found by the monthly run. Every import is scored{' '}
          <strong>5</strong> — a person picked it out by hand, which is a stronger signal than the filter was built
          to produce. These are not part of any month, but they are read back into the write-up for the months that
          follow.
        </p>
      </header>

      <ImportsPanel />

      <p className="imports-back">
        <Link href="/digest">&#8592; Back to the latest month</Link>
      </p>
    </>
  );
}
