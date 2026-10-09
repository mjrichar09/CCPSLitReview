'use client';

import { feedErrors } from '../../../lib/topics.js';
import ListField from './ListField.jsx';

/**
 * The RSS feed list: one row per feed. "Used by" is computed with the
 * pipeline's own feed selection (resolveFeeds), so it shows which topics will
 * actually read a feed, not which ones were meant to.
 */
export default function FeedsEditor({ feeds, onChange, onAdd, usedBy, savedIds, disabled }) {
  const update = (i, patch) => onChange(feeds.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const remove = (i) => onChange(feeds.filter((_, j) => j !== i));
  const add = () => {
    let n = 1;
    while (feeds.some((f) => f.id === `new-feed-${n}`)) n += 1;
    onAdd({ id: `new-feed-${n}`, name: '', url: '', tags: ['trade'] });
  };

  return (
    <fieldset className="feeds-editor" disabled={disabled}>
      <div className="feeds-table" role="table" aria-label="RSS feeds">
        <div className="feeds-row feeds-head" role="row">
          <span role="columnheader">On</span>
          <span role="columnheader">Name and ID</span>
          <span role="columnheader">Feed URL</span>
          <span role="columnheader">Tags</span>
          <span role="columnheader">Used by</span>
          <span role="columnheader" aria-label="Remove" />
        </div>
        {feeds.map((feed, i) => {
          const errs = feedErrors(feed);
          const users = usedBy.get(feed.id) ?? [];
          return (
            <div className={`feeds-row${feed.enabled === false ? ' feeds-row-off' : ''}`} role="row" key={feed._key}>
              <span role="cell">
                <input
                  type="checkbox"
                  aria-label={`${feed.name || feed.id} enabled`}
                  checked={feed.enabled !== false}
                  onChange={(e) => update(i, { enabled: e.target.checked ? undefined : false })}
                />
              </span>
              <span role="cell" className="feeds-name">
                <input
                  type="text"
                  aria-label="Name"
                  value={feed.name}
                  placeholder="Publication name"
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <input
                  type="text"
                  aria-label="ID"
                  className="mono feeds-id"
                  value={feed.id}
                  disabled={savedIds.has(feed.id)}
                  title={savedIds.has(feed.id) ? 'Fixed once saved: source health and past runs refer to it' : ''}
                  onChange={(e) => update(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                />
              </span>
              <span role="cell">
                <input
                  type="url"
                  aria-label="Feed URL"
                  className="mono"
                  value={feed.url}
                  placeholder="https://example.com/feed/"
                  onChange={(e) => update(i, { url: e.target.value.trim() })}
                />
                {errs.length > 0 && <span className="row-error">{errs.join('; ')}</span>}
              </span>
              <span role="cell">
                <ListField
                  separator="comma"
                  value={feed.tags ?? []}
                  onChange={(tags) => update(i, { tags })}
                  placeholder="trade, manufacturing"
                  disabled={disabled}
                />
              </span>
              <span role="cell" className="feeds-used" title={users.join('\n')}>
                {feed.enabled === false ? (
                  <em>Disabled</em>
                ) : users.length === 0 ? (
                  <em>No topic</em>
                ) : users.length <= 2 ? (
                  users.join(', ')
                ) : (
                  `${users.length} topics`
                )}
              </span>
              <span role="cell">
                <button type="button" className="link-button" onClick={() => remove(i)} aria-label={`Remove ${feed.name || feed.id}`}>
                  Remove
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" className="editor-button" onClick={add}>
        Add feed
      </button>
    </fieldset>
  );
}
