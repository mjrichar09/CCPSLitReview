-- Point the author foreign keys at `profiles` rather than `auth.users`.
--
-- Not cosmetic: PostgREST derives its embedding from foreign keys, so
-- `select('body, profiles(display_name)')` — one query for a thread and its
-- bylines — only resolves if the FK names `profiles`. Against `auth.users` the
-- client would have to fetch names separately, and `auth` is not exposed to the
-- API anyway.
--
-- Deletion still cascades correctly, just one hop longer:
--   auth.users -> profiles -> votes / comments
-- because profiles.id already cascades from auth.users.

alter table public.votes
  drop constraint votes_user_id_fkey,
  add  constraint votes_user_id_fkey
       foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.comments
  drop constraint comments_user_id_fkey,
  add  constraint comments_user_id_fkey
       foreign key (user_id) references public.profiles (id) on delete cascade;
