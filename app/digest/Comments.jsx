'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client.js';
import { useEngagement } from './Engagement.jsx';
import { useSession } from './SessionProvider.jsx';
import { activeMentionQuery, applyMention } from './mentions.js';
import MentionPicker from './MentionPicker.jsx';
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
export default function Comments({ itemId, categoryId }) {
  const supabase = useMemo(() => getSupabase(), []);
  const engagement = useEngagement();
  const { enabled, user, approved } = useSession();

  const anchor = useRef(null);
  const textareaRef = useRef(null);
  const requested = useRef(false);
  const [comments, setComments] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);

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
   * working — which is also why the initial check also tests `:target`
   * directly: that override forces the body visible with a CSS rule alone, it
   * never sets the native `open` attribute or fires a `toggle` event, so a
   * paper reached via a notification link (or the Top 5, or "Also appears
   * in") would otherwise show an already-open-looking card whose thread never
   * actually loads.
   */
  useEffect(() => {
    const details = anchor.current?.closest('details');
    if (!details) return undefined;
    if (details.open || details.matches(':target')) load();
    const onToggle = () => {
      if (details.open) load();
    };
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [load]);

  const onDraftChange = useCallback((event) => {
    const value = event.target.value.slice(0, MAX_BODY);
    setDraft(value);
    setMentionQuery(activeMentionQuery(value, event.target.selectionStart ?? value.length));
  }, []);

  const onSelectMention = useCallback(
    (displayName) => {
      const caret = textareaRef.current?.selectionStart ?? draft.length;
      const { text, caretIndex } = applyMention(draft, caret, displayName);
      const next = text.slice(0, MAX_BODY);
      setDraft(next);
      setMentionQuery(null);
      // Put the caret back where the replacement left off, and keep focus in
      // the textarea rather than losing it to the picker button that was
      // just clicked. Runs after the value has actually committed to the DOM.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const pos = Math.min(caretIndex, next.length);
        el.setSelectionRange(pos, pos);
      });
    },
    [draft],
  );

  const post = useCallback(
    async (event) => {
      event.preventDefault();
      const body = draft.trim();
      if (!supabase || !user || !approved || !body) return;

      setBusy(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('comments')
        .insert({ user_id: user.id, item_id: itemId, category_id: categoryId, month: engagement?.month, body })
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
      setMentionQuery(null);
      engagement?.adjustCommentCount(itemId, 1);
    },
    [supabase, user, approved, draft, itemId, categoryId, engagement],
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
          <div className="comment-form-field">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={onDraftChange}
              placeholder="Add a comment — @ to mention a reader"
              rows={3}
              maxLength={MAX_BODY}
            />
            <MentionPicker query={mentionQuery} candidates={engagement?.mentionable ?? []} onSelect={onSelectMention} />
          </div>
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
