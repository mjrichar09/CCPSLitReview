'use client';

import { formatAuthors } from './shared.js';
import { IMPORTS_CATEGORY, toDisplayItem } from '../../lib/userPapers.js';
import Comments from './Comments.jsx';
import CommentBadge from './CommentBadge.jsx';
import ReadToggle from './ReadToggle.jsx';
import FavoriteButton from './FavoriteButton.jsx';
import VoteButtons from './VoteButtons.jsx';

/**
 * One imported paper, in the same `<details>` card shape as `ItemRow`.
 *
 * A separate component rather than a prop on `ItemRow` because that one is a
 * server component and these rows are built in the browser from a Supabase
 * read — a client parent cannot render a server child. The markup and class
 * names deliberately match it so the two read as one list, and every reader
 * control on a normal paper works here unchanged: they are keyed by item id,
 * and an imported paper has a real one.
 *
 * What is deliberately absent is the summary and why-it-matters. Those are
 * written by the generation stage against an abstract, and nothing has written
 * them for this paper — so the card shows the abstract where there is one and
 * says nothing where there is not, rather than inventing a summary or leaving
 * an empty paragraph that looks like a bug.
 */
export default function ImportedPaper({ row, importerName }) {
  const item = toDisplayItem(row);
  const authors = formatAuthors(item.authors);

  return (
    <li>
      <details className="item">
        <summary>
          <h3 className="item-title">{item.title}</h3>
          <div className="item-meta">
            {item.venue && <span>{item.venue}</span>}
            {item.published && <span>{item.published}</span>}
            {authors && <span>{authors}</span>}
          </div>
          <div className="item-tags">
            <span className="badge badge-import">
              {row.source === 'conference' ? 'Conference import' : 'Imported'}
            </span>
            {row.deck_title && <span className="badge badge-recurring">{row.deck_title}</span>}
            {!item.abstract && <span className="badge badge-recurring">No abstract</span>}
            <span className="item-score">relevance {item.relevance_score}/5</span>
            <CommentBadge itemId={item.id} />
            <span className="reader-controls">
              <ReadToggle itemId={item.id} />
              <FavoriteButton itemId={item.id} />
              <VoteButtons itemId={item.id} />
            </span>
          </div>
        </summary>
        <div className="item-body">
          {item.abstract ? (
            <p className="item-summary">{item.abstract}</p>
          ) : (
            <p className="item-summary item-summary-absent">
              No abstract was available from the source, so there is no summary for this paper.
            </p>
          )}
          {importerName && <p className="item-why">Imported by {importerName}</p>}
          {item.url && (
            <p className="item-source">
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                View source &#8599;
              </a>
            </p>
          )}
          <Comments itemId={item.id} categoryId={IMPORTS_CATEGORY} />
        </div>
      </details>
    </li>
  );
}
