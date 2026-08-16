import Link from 'next/link';
import { monthLabel } from './shared.js';

/**
 * The archive, as a horizontal strip in the site header rather than a sidebar
 * column, so which month you are reading is answerable without scrolling.
 *
 * The current month is marked twice over — a leading arrow and bold weight —
 * because with only one month committed there is nothing to contrast it
 * against yet. The affordance has to read as "you are here" on its own, before
 * a second month arrives to make the distinction obvious.
 */
export default function ArchiveNav({ months, current }) {
  if (months.length === 0) return null;

  return (
    <nav className="archive-nav" aria-label="Archive">
      <span className="archive-label">Archive</span>
      {months.map((m) =>
        m === current ? (
          <span key={m} className="archive-current" aria-current="page">
            <span className="archive-arrow" aria-hidden="true">
              &#9656;
            </span>
            {monthLabel(`${m}-01`)}
          </span>
        ) : (
          <Link key={m} href={`/digest/${m}`} className="archive-link">
            {monthLabel(`${m}-01`)}
          </Link>
        ),
      )}
    </nav>
  );
}
