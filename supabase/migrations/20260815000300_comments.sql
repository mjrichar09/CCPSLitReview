-- Comments on a paper, written by approved users and readable by everyone.

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users on delete cascade,
  item_id    text        not null,
  month      text        not null check (month ~ '^\d{4}-\d{2}$'),
  body       text        not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  -- Soft delete: a removed comment must not take the replies around it out of
  -- order, and the count on the collapsed row stays honest either way.
  deleted_at timestamptz
);

create index comments_item_idx on public.comments (item_id, created_at) where deleted_at is null;

/*
 * Rate limit, enforced in the database for the same reason the approval flag is.
 *
 * The site is publicly readable and sign-up is open, so the cheap bound belongs
 * where a client cannot route around it. Twenty an hour is far above any real
 * reader and far below anything worth calling a flood.
 */
create function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.comments
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';

  if recent >= 20 then
    raise exception 'comment rate limit exceeded: 20 per hour';
  end if;

  return new;
end;
$$;

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

alter table public.comments enable row level security;

create policy comments_select_live on public.comments
  for select to anon, authenticated
  using (deleted_at is null);

create policy comments_insert_approved on public.comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

-- Covers both editing and soft-deleting your own comment. Approval is required
-- to edit as well as to post: revoking approval should stop all writing, not
-- just new threads.
create policy comments_update_own on public.comments
  for update to authenticated
  using (user_id = auth.uid() and public.is_approved())
  with check (user_id = auth.uid() and public.is_approved());

-- No delete policy: removal is `deleted_at`, so a thread keeps its shape.

/*
 * Per-paper counts for the collapsed row, without shipping every body to the
 * page. Bodies load when a reader actually expands the paper.
 */
create view public.comment_counts with (security_invoker = on) as
  select item_id, month, count(*) as total
  from public.comments
  where deleted_at is null
  group by item_id, month;

grant select on public.comment_counts to anon, authenticated;
