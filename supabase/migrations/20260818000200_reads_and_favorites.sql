-- Per-reader "read" marks and favorites.
--
-- Both are personal and private — unlike votes, nobody else's read/favorite
-- state is ever exposed, so the select policy is owner-only rather than
-- public. Both require the same approval gate as voting/commenting (product
-- decision: a brand-new signed-up reader cannot mark things read or
-- favorite until approved) — unlike profiles.category_order, which is a
-- display preference open to any signed-in reader.

create table public.reads (
  user_id uuid        not null references public.profiles (id) on delete cascade,
  item_id text        not null,
  read_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index reads_user_idx on public.reads (user_id);

alter table public.reads enable row level security;

create policy reads_select_own on public.reads
  for select to authenticated
  using (user_id = auth.uid());

create policy reads_insert_own on public.reads
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

-- Unmarking read is a delete, same as retracting a vote — no update policy,
-- and delete does not require current approval, so a reader whose approval
-- lapsed can still clear their own old marks.
create policy reads_delete_own on public.reads
  for delete to authenticated
  using (user_id = auth.uid());

create table public.favorites (
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  item_id    text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

create policy favorites_select_own on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());
