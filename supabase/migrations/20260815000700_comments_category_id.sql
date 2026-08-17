-- The category a comment was posted from, captured client-side at insert
-- time.
--
-- There is no runtime way to resolve item_id -> category: report data is
-- read from committed JSON at build time only (lib/digest.js), and there are
-- no API routes to ask at request time. ItemRow/CategoryPage already know
-- the category when a comment is posted, so this is set from there instead
-- of looked up later — it is what lets a notification's deep link
-- (/digest/{month}/{category_id}#{slug}) be built with no lookup at all.
--
-- Nullable: comments posted before this column existed have no category to
-- backfill from without re-reading every committed report by hand: their
-- notification links (were they to receive one) simply degrade to a
-- month-only link.

alter table public.comments
  add column category_id text;

comment on column public.comments.category_id is
  'The item''s category segment for this month''s page, e.g. "upstream_pd" — set by the client at insert time.';
