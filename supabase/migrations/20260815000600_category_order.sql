-- Per-reader category pill order.
--
-- A personal display preference, not content: unlike votes and comments,
-- any signed-in user may set it, approved or not. `profiles_update_own`
-- (20260815000100) already permits this — its `with check` only pins
-- `approved` to its current value, it does not restrict other columns.

alter table public.profiles
  add column category_order jsonb;

comment on column public.profiles.category_order is
  'Reader-chosen category pill order, an array of category ids. Null = use the report order.';
