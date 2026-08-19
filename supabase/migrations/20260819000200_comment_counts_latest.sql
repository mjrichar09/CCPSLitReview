-- Add the most recent comment's timestamp per (item_id, month), so the
-- discussion board can sort by recent activity instead of raw volume.
-- CREATE OR REPLACE VIEW only supports appending columns, not reordering or
-- removing them, so `latest` goes on the end.

create or replace view public.comment_counts with (security_invoker = on) as
  select item_id, month, count(*) as total, max(created_at) as latest
  from public.comments
  where deleted_at is null
  group by item_id, month;

grant select on public.comment_counts to anon, authenticated;
