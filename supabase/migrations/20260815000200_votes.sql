-- Thumbs up / thumbs down, one vote per person per paper.
--
-- The primary key is (user_id, item_id) and NOT the category: a paper that
-- survived scoring in two categories is rendered twice (write.js duplicates the
-- item per section), but it is still one paper and gets one vote. `month` is
-- carried for scoping the feedback export, not for identity.

create table public.votes (
  user_id    uuid        not null references auth.users on delete cascade,
  item_id    text        not null,
  month      text        not null check (month ~ '^\d{4}-\d{2}$'),
  value      smallint    not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

comment on column public.votes.item_id is
  'The report item id (doi:... / pmid:... / title hash) — see lib/util/identity.js.';

create index votes_item_idx  on public.votes (item_id);
create index votes_month_idx on public.votes (month);

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger votes_touch_updated_at
  before update on public.votes
  for each row execute function public.touch_updated_at();

alter table public.votes enable row level security;

-- Tallies are public: an anonymous reader sees the counts, and is prompted to
-- sign in only when they try to cast one.
create policy votes_select_all on public.votes
  for select to anon, authenticated
  using (true);

create policy votes_insert_approved on public.votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

-- Changing your mind is an update; the (user_id, item_id) key makes it an upsert
-- on the client rather than a duplicate row.
create policy votes_update_own on public.votes
  for update to authenticated
  using (user_id = auth.uid() and public.is_approved())
  with check (user_id = auth.uid() and public.is_approved());

-- Retracting a vote is a hard delete — nothing downstream needs the tombstone.
create policy votes_delete_own on public.votes
  for delete to authenticated
  using (user_id = auth.uid());

/*
 * Aggregate counts, so a page fetches tallies instead of every individual vote.
 *
 * security_invoker keeps the caller's RLS on `votes` in force rather than the
 * view owner's — the counts are public because the underlying select policy
 * says so, not because a view quietly bypassed it.
 */
create view public.vote_tallies with (security_invoker = on) as
  select
    item_id,
    month,
    count(*) filter (where value = 1)  as up,
    count(*) filter (where value = -1) as down
  from public.votes
  group by item_id, month;

grant select on public.vote_tallies to anon, authenticated;
