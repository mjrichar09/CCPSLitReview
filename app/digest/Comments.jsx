'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { useEngagement } from './Engagement.jsx';
import { useSession } from './SessionProvider.jsx';
import SignInButtons from './SignInButtons.jsx';

const MAX_BODY = 2000;

/**
 * The comment thread for one paper, inside its expanded body.
 *
 * Bodies load on expand, not on page load. The mechanism is the parent
 * `<details>` element's own `toggle` event rather than lifting open/closed into
 * React state: `ItemRow` stays a server component that way, and the browser
 * keeps owning the disclosure behaviour, including the `:target` deep-link
 * override that opens a paper linked from the Top 5.
 */
export default function Comments({ itemId }) {
  const supabase = useMemo(() => getSupabase(), []);
  const engagement = useEngagement();
  const { enabled, user, approved } = useSession();

  const anchor = useRef(null);
  const requested = useRef(false);
  const [comments, setComments] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /** Fetch the thread once, whenever the paper is first opened. */
  const load = useCallback(async () => {
    if (!supabase || requested.current) return;
    requested.current = true;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('comments')
      .select('id, body, created_at, user_id, profiles(display_name)')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });
    setLoading(false);
    if (err) setError('Could not load comments.');
    else setComments(data ?? []);
  }, [supabase, itemId]);

  /**
   * The disclosure is the browser's, not React's: this subscribes to the parent
   * `<details>` toggle rather than mirroring open/closed into state. That keeps
   * ItemRow a server component and leaves the `:target` deep-link override
   * working — which is also why the initial check matters, since a paper linked
   * from the Top 5 arrives already open.
   */
  useEffect(() => {
    const details = anchor.current?.closest('details');
    if (!details) return undefined;
    if (details.open) load();
    const onToggle = () => {
      if (details.open) load();
    };
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [load]);

  const post = useCallback(
    async (event) => {
      event.preventDefault();
      const body = draft.trim();
      if (!supabase || !user || !approved || !body) return;

      setBusy(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('comments')
        .insert({ user_id: user.id, item_id: itemId, month: engagement?.month, body })
        .select('id, body, created_at, user_id, profiles(display_name)')
        .single();
      setBusy(false);

      if (err) {
        // The rate-limit trigger raises rather than returning a row; say so
        // plainly instead of showing a generic failure.
        setError(
          /rate limit/i.test(err.message)
            ? 'You have hit the limit of 20 comments an hour.'
            : 'Could not post that comment.',
        );
        return;
      }
      setComments((list) => [...(list ?? []), data]);
      setDraft('');
      engagement?.adjustCommentCount(itemId, 1);
    },
    [supabase, user, approved, draft, itemId, engagement],
  );

  if (!enabled) return null;

  return (
    <div className="comments" ref={anchor}>
      <h4 className="comments-head">Discussion</h4>

      {loading && <p className="comments-empty">Loading…</p>}
      {comments !== null && comments.length === 0 && (
        <p className="comments-empty">No comments yet.</p>
      )}

      {comments !== null && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <div className="comment-meta">
                <span className="comment-author">{c.profiles?.display_name ?? 'Unknown'}</span>
                <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleDateString()}</time>
              </div>
              <p className="comment-body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {!user && (
        <p className="comments-cta">
          <SignInButtons compact /> to join the discussion.
        </p>
      )}

      {user && !approved && (
        <p className="comments-cta">Your account is awaiting approval before you can post.</p>
      )}

      {user && approved && (
        <form className="comment-form" onSubmit={post}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
            placeholder="Add a comment"
            rows={3}
            maxLength={MAX_BODY}
          />
          <div className="comment-form-foot">
            <span className="comment-count-left">
              {MAX_BODY - draft.length} characters left
            </span>
            <button type="submit" disabled={busy || draft.trim().length === 0}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="comments-error">{error}</p>}
    </div>
  );
}
