-- Reader accounts and the approval gate.
--
-- Anyone may sign in; a new account lands unapproved and can read but not write.
-- `approved` is the whole access model, and it is enforced here in Postgres
-- rather than in the UI: a session that hides the button proves nothing, but a
-- policy that rejects the INSERT holds against a hand-crafted request too.

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  approved     boolean     not null default false,
  created_at   timestamptz not null default now()
);

comment on column public.profiles.approved is
  'The access gate. Flipped by the owner; a user can never set their own.';

-- A profile per auth user, created on sign-up so approval never has to wait for
-- the reader to visit a settings page first.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',   -- GitHub login
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/*
 * Approval check for every other policy in this schema.
 *
 * SECURITY DEFINER on purpose: a policy on `votes` that selected from
 * `profiles` directly would itself be filtered by the profiles policies, which
 * is both slower and easy to get subtly wrong. This reads the flag once,
 * outside RLS, and returns a plain boolean.
 */
create function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.approved from public.profiles p where p.id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;

-- Comment bylines are public, so approved display names are readable by anyone.
-- An unapproved user can still see their own row, which is how the UI knows to
-- say "awaiting approval" rather than showing a broken signed-in state.
create policy profiles_select_approved on public.profiles
  for select to anon, authenticated
  using (approved or id = auth.uid());

-- A user may rename themselves and nothing else. `approved = public.is_approved()`
-- pins the flag to its current value, so self-promotion fails the check.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and approved = public.is_approved());

-- No insert or delete policy: rows come from the sign-up trigger and go with the
-- auth user. Absent policy means denied.
