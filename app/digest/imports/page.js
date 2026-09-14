import ImportsPanel from '../ImportsPanel.jsx';
import SiteHeader from '../SiteHeader.jsx';

export const metadata = {
  title: 'Imported papers — Cell Culture Literature Review',
};

/**
 * The user-added section: papers readers bring in themselves, either one DOI
 * at a time or in bulk from a conference deck.
 *
 * Same shell as the favorites and discussion pages — `SiteHeader`, then
 * `.layout` with a `report-title`/`report-summary` head and the site credit
 * at the foot. Those pages render their own header rather than inheriting one
 * from `app/digest/layout.js`, which carries only the auth and reaction
 * contexts (see its comment), so this has to as well.
 *
 * A static shell around a client island, like every other reader-feedback
 * surface here. It has to be: imported papers live in Postgres (they are
 * reader-supplied content, and the committed month files are written only by
 * the pipeline — see CLAUDE.md, "Storage layer"), and this app reads Postgres
 * from the browser only. So the page prerenders to the heading and an empty
 * frame, and the imports arrive after hydration, exactly as vote tallies and
 * comment counts already do.
 */
export default function ImportsPage() {
  return (
    <>
      <SiteHeader />
      <div className="layout">
        <h1 className="report-title">Imported papers</h1>
        <p className="report-summary">
          Papers added by readers rather than found by the monthly run. Every import is scored 5 — a person picked it
          out by hand, which is a stronger signal than the filter was built to produce. These belong to no month, but
          they are read back into the write-up for the months that follow.
        </p>
        <ImportsPanel />
        <footer className="site-credit">Created by Mark Richards. All Rights Reserved.</footer>
      </div>
    </>
  );
}
