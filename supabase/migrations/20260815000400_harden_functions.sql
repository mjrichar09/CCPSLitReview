-- Advisor findings from the initial schema, fixed.
--
-- 1. `touch_updated_at` had a mutable search_path. Every other function here
--    pins it; this one was missed. An unpinned search_path on a function that
--    runs inside a trigger is how a shadowed operator or table gets resolved to
--    something the author did not intend.
--
-- 2. Supabase exposes every function in `public` as an RPC endpoint. The two
--    trigger functions have no business being callable over HTTP at all — they
--    would fail outside a trigger context, but a SECURITY DEFINER function
--    reachable by `anon` is a standing invitation to look for a way to make it
--    not fail.
--
--    The revoke must name PUBLIC, not the roles. Postgres grants EXECUTE on a
--    new function to PUBLIC by default, and `anon`/`authenticated` inherit it
--    from there — revoking from those roles individually leaves the underlying
--    PUBLIC grant untouched and changes nothing. (Verified: the advisor still
--    flagged all three functions after a role-level revoke.)
--
-- 3. `is_approved()` is then granted back to `authenticated` alone, because the
--    insert/update policies on votes and comments evaluate it as that role. It
--    reads only the caller's own flag, so it discloses nothing. `anon` cannot
--    usefully call it (no auth.uid()) and no anon-facing policy invokes it.

alter function public.touch_updated_at() set search_path = '';

revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.enforce_comment_rate_limit() from public, anon, authenticated;
revoke all on function public.is_approved()                from public, anon, authenticated;

grant execute on function public.is_approved() to authenticated;
