-- @mentions in comments, and the notification each one creates.
--
-- One row per mention, created exclusively by the trigger below — there is
-- no client insert path, the same shape as the rate-limit trigger on
-- `comments` having none. `category_id`/`month` are copied from the comment
-- at insert time so a notification's deep link
-- (/digest/{month}/{category_id}#{slug}) needs no runtime lookup, matching
-- how `category_id` itself reached `comments` in the previous migration.

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid        not null references public.profiles (id) on delete cascade,
  actor_id     uuid        not null references public.profiles (id) on delete cascade,
  comment_id   uuid        not null references public.comments (id) on delete cascade,
  item_id      text        not null,
  category_id  text,
  month        text        not null check (month ~ '^\d{4}-\d{2}$'),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

-- The only client write: marking your own notifications read.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- No insert or delete policy for anon/authenticated: rows come only from the
-- trigger, which is SECURITY DEFINER and runs outside RLS.

/*
 * Parses "@Display Name" tokens out of a new comment's body and notifies
 * whichever approved profile matches, case-insensitively — insert-only, so
 * editing a mention in later does not notify (comments have no edit UI yet
 * regardless). A handle with no matching approved profile, or that names the
 * commenter themselves, is simply not a mention.
 */
create function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  handle text;
  target uuid;
begin
  for handle in
    select distinct m[1] from regexp_matches(new.body, '@([A-Za-z0-9 _-]{2,32})', 'g') as m
  loop
    select p.id into target
      from public.profiles p
     where lower(p.display_name) = lower(handle)
       and p.approved
       and p.id <> new.user_id
     limit 1;

    if target is not null then
      insert into public.notifications (recipient_id, actor_id, comment_id, item_id, category_id, month)
      values (target, new.user_id, new.id, new.item_id, new.category_id, new.month);
    end if;
  end loop;
  return new;
end;
$$;

create trigger comments_notify_mentions
  after insert on public.comments
  for each row execute function public.notify_comment_mentions();

-- Same hardening as enforce_comment_rate_limit(): a SECURITY DEFINER trigger
-- function has no business being callable directly over PostgREST.
revoke all on function public.notify_comment_mentions() from public, anon, authenticated;
