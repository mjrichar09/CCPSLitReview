import Link from 'next/link';
import { formatAuthors } from './shared.js';

export function Meta({ item }) {
  const authors = formatAuthors(item.authors);
  return (
    <>
      {item.venue && <span>{item.venue}</span>}
      {item.published && <span>{item.published}</span>}
      {authors && <span>{authors}</span>}
    </>
  );
}

export function Badges({ item }) {
  return (
    <>
      {item.is_recurring ? (
        <span className="badge badge-recurring">
          {item.previously_seen ? `Recurring · first seen ${item.previously_seen}` : 'Recurring'}
        </span>
      ) : (
        <span className="badge badge-new">New</span>
      )}
      {item.is_preprint && <span className="badge badge-recurring">Preprint</span>}
      {/* Surfaced, not hidden: set when the source could not support a real
          summary, and the reader should weigh the item accordingly. */}
      {item.thin_abstract && <span className="badge badge-recurring">Thin abstract</span>}
      <span className="item-score">relevance {item.relevance_score}/5</span>
    </>
  );
}

function TitleLink({ item }) {
  if (!item.url) return item.title;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer">
      {item.title}
    </a>
  );
}

/**
 * One paper as it appears on a section (category) page: title (links straight
 * to the source), meta, badges, and a link through to the full overview page.
 * Summary and why-it-matters live on the overview, not here — a section page
 * is an index, not a rerun of the article page.
 */
export default function ItemRow({ item, overviewHref }) {
  return (
    <li className="item">
      <h3 className="item-title">
        <TitleLink item={item} />
      </h3>
      <div className="item-meta">
        <Meta item={item} />
      </div>
      <div className="item-tags">
        <Badges item={item} />
      </div>
      <Link href={overviewHref} className="item-overview-link">
        Full overview &rarr;
      </Link>
    </li>
  );
}
