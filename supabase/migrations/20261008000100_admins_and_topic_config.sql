-- Admins, and the saved versions of the topic/feed configuration they edit.
--
-- 1. `profiles.is_admin`: who may change what the digest covers. Set by hand
--    in the table editor for now, the same way `approved` is; a screen for
--    managing readers and admins is still to come (TODO.md). Like `approved`,
--    it is enforced here, never in the UI.
--
-- 2. `topic_config_versions`: append-only history of config/topics.json as
--    edited from /digest/admin/topics. The monthly run copies the newest
--    version into the repo (scripts/sync-topics.mjs) and commits it, so the
--    repo file remains what the pipeline actually runs on. Append-only on
--    purpose: a bad edit is undone by saving an older version again, and
--    nothing is ever lost.

alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'May edit topics and feeds. Flipped by the owner; a user can never set their own.';

-- Same shape and reasoning as is_approved(): read the caller's own flag once,
-- outside RLS, so policies elsewhere do not recurse through profiles' own.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Self-promotion: profiles_update_own already pins `approved` to its current
-- value; without pinning `is_admin` the same way, any signed-in user could
-- make themselves an admin with one UPDATE.
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and approved = public.is_approved() and is_admin = public.is_admin());

create table public.topic_config_versions (
  id          bigint generated always as identity primary key,
  -- { "topics": [...], "feeds": [...] } — config/topics.json minus its
  -- version bookkeeping. Validated by the editor before saving and again,
  -- with the pipeline's own code, before a run uses it.
  body        jsonb       not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) < 1000000),
  note        text        check (note is null or length(note) <= 500),
  created_by  uuid        not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

comment on table public.topic_config_versions is
  'Saved versions of config/topics.json. Newest wins at the next monthly run; see lib/topics.js pickNewer.';

alter table public.topic_config_versions enable row level security;

-- Readable by anyone, anon included. The config is not private — it is
-- committed to a public repository on every run — and anon read is what lets
-- the monthly run fetch it with the same publishable key it already uses for
-- vote tallies, rather than needing the service-role key.
create policy topic_config_versions_select on public.topic_config_versions
  for select to anon, authenticated
  using (true);

create policy topic_config_versions_insert_admin on public.topic_config_versions
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

-- No update or delete policy: absent policy means denied. History is append-only.
