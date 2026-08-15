import Link from 'next/link';

/**
 * The section banner: every category as a pill, linking to its section page,
 * with an item-count badge. Shown on the front page (no `current`) and on
 * every section page (`current` = that section's id, highlighted) so jumping
 * between sections never requires going back to the month first.
 */
export default function CategoryNav({ month, categories, current }) {
  return (
    <nav className="section-nav" aria-label="Sections">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/digest/${month}/${c.id}`}
          className={`section-nav-link${c.id === current ? ' active' : ''}`}
          aria-current={c.id === current ? 'page' : undefined}
        >
          {c.name}
          <span className="section-nav-count">{c.items.length}</span>
        </Link>
      ))}
    </nav>
  );
}
