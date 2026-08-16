'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The section banner: every category as a pill, linking to its section page,
 * with an item-count badge. It lives in the site header now, so it is visible
 * from anywhere in a month rather than only at the top of a page.
 *
 * The active section is read from the pathname rather than passed down. The
 * banner is rendered once by the layout, which does not know which category
 * segment is showing beneath it; deriving it here keeps the pages from having
 * to thread a `current` prop up into chrome they no longer render.
 */
export default function CategoryNav({ month, categories }) {
  const pathname = usePathname();
  const current = pathname?.startsWith(`/digest/${month}/`)
    ? pathname.slice(`/digest/${month}/`.length).split('/')[0]
    : null;

  if (categories.length === 0) return null;

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
