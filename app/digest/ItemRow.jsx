import Link from 'next/link';
import { formatAuthors } from './shared.js';
import VoteButtons from './VoteButtons.jsx';
import ReadToggle from './ReadToggle.jsx';
import FavoriteButton from './FavoriteButton.jsx';
import CommentBadge from './CommentBadge.jsx';
import Comments from './Comments.jsx';

function Meta({ item }) {
  const authors = formatAuthors(item.authors);
  return (
    <>
      {item.venue && <span>{item.venue}</span>}
      {item.published && <span>{item.published}</span>}
      {authors && <span>{authors}</span>}
    </>
  );
}

function Badges({ item }) {
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


/**
 * One paper on a section page: a native `<details>` disclosure. Collapsed, it
 * shows title/meta/badges; expanded, the full summary and why-it-matters.
 * There is no separate article page for these to link to, so the source link
 * lives inside the expanded body rather than on the title — an `<a>` nested
 * inside `<summary>` fights the browser's own click-to-toggle handling (both
 * can fire), so the title stays plain text and "View source" is its own link.
 *
 * `defaultOpen` renders the card pre-expanded — used by the discussion board,
 * which shows a paper's full content and thread without requiring a click.
 */
export default function ItemRow({ item, id, also = [], categoryId, defaultOpen = false }) {
  return (
    <li>
      <details className="item" id={id} open={defaultOpen}>
        <summary>
          <h3 className="item-title">{item.title}</h3>
          <div className="item-meta">
            <Meta item={item} />
          </div>
          <div className="item-tags">
            <Badges item={item} />
            <CommentBadge itemId={item.id} />
            {/* Inside `<summary>` on purpose, so the reader's rating sits beside
                the model's score on the collapsed row: `relevance 4/5` is what
                the model thought, the thumbs are what the readers thought, and
                the gap between them is what the scoring feedback loop closes.
                Each control suppresses its own click so using it does not also
                toggle the disclosure. */}
            <span className="reader-controls">
              <ReadToggle itemId={item.id} />
              <FavoriteButton itemId={item.id} />
              <VoteButtons itemId={item.id} />
            </span>
          </div>
        </summary>
        <div className="item-body">
          <p className="item-summary">{item.summary}</p>
          <p className="item-why">
            <span className="item-why-label">Why it matters: </span>
            {item.why_it_matters}
          </p>
          {item.url && (
            <p className="item-source">
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                View source &#8599;
              </a>
            </p>
          )}
          {also.length > 0 && (
            <p className="also-in">
              Also appears in:{' '}
              {also.map((a, i) => (
                <span key={a.category.id}>
                  {i > 0 && ', '}
                  <Link href={a.href}>{a.category.name}</Link>
                </span>
              ))}
            </p>
          )}
          <Comments itemId={item.id} categoryId={categoryId} />
        </div>
      </details>
    </li>
  );
}
