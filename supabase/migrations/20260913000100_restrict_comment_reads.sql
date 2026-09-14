-- Close the last anon-readable hole in reader content: comments.
--
-- `comments_select_live` granted SELECT to `anon`, so anyone holding the
-- publishable key — which ships in the browser bundle by design, and is not a
-- secret — could read every live comment on every paper without an account.
-- The digest itself is gated (proxy.js, and `profiles.approved` on every
-- write), so the discussion about it being world-readable was an
-- inconsistency, not an intended design: nothing anon-facing has ever
-- consumed it.
--
-- Verified before writing this, because the equivalent change on `votes`
-- would NOT be safe: every reader of `comments` and `comment_counts` is a
-- client island under `/digest/**` (Comments.jsx, DiscussionList.jsx,
-- Engagement.jsx), which the access gate already restricts to a signed-in,
-- approved reader. Nothing reads comments at build time or from the monthly
-- pipeline. `votes` is different — lib/feedback.js reads `vote_tallies` with
-- the anon key and no session at all, so votes deliberately stay as they are.
--
-- `notify_comment_mentions()` is SECURITY DEFINER and so is unaffected by
-- this policy; mention notifications keep working for unapproved authors'
-- targets exactly as before.

drop policy comments_select_live on public.comments;

create policy comments_select_live on public.comments
  for select to authenticated
  using (deleted_at is null and public.is_approved());

-- `comment_counts` is a security_invoker view over `comments`, so it already
-- inherits the policy above and would simply return nothing to `anon`.
-- Dropping the grant makes that intent explicit rather than implicit, and
-- stops the view from being a second thing to reason about if the underlying
-- policy is ever revisited. The view still exposed per-paper comment counts
-- and last-activity timestamps to anon until now, which is metadata about a
-- private digest.
revoke select on public.comment_counts from anon;
