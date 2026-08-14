import Link from 'next/link';
import { monthLabel } from './shared.js';

export default function Sidebar({ months, current }) {
  return (
    <aside className="col-side">
      <h2 className="side-head">Archive</h2>
      <ul className="side-list">
        {months.map((m) => (
          <li key={m}>
            {m === current ? (
              <strong>{monthLabel(`${m}-01`)}</strong>
            ) : (
              <Link href={`/digest/${m}`}>{monthLabel(`${m}-01`)}</Link>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
