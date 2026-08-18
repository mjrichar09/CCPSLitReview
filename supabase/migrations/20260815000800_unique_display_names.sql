-- Display names become unique, case-insensitively, so an "@mention" resolves
-- to exactly one reader.
--
-- Without this, `notify_comment_mentions()` (next migration) would have to
-- guess between two people sharing a name and could notify the wrong one —
-- decided against in favor of keeping mentions plain, readable "@Display
-- Name" text rather than a hidden id-based token.
--
-- CAUTION: if any existing rows already collide case-insensitively, this
-- index creation fails and must be preceded by a manual rename of the
-- colliding profile(s) before re-running.

create unique index profiles_display_name_unique on public.profiles (lower(display_name));

/*
 * On sign-up collision, append " 2", " 3", ... until the name is free, rather
 * than letting the insert fail and stranding the new auth.users row.
 *
 * Not race-proof: two people signing up with the same name in the same
 * instant could both pass the `exists` check before either inserts, and the
 * second insert would then fail on the unique index above rather than
 * silently succeed with a colliding name — a genuine race is vanishingly
 * unlikely for a single-reader-base digest site, and the alternative (a
 * retry loop around the insert) is not worth the complexity for it.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix integer := 1;
begin
  base := coalesce(
    new.raw_user_meta_data ->> 'user_name',   -- GitHub login
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  candidate := base;
  while exists (select 1 from public.profiles p where lower(p.display_name) = lower(candidate)) loop
    suffix := suffix + 1;
    candidate := base || ' ' || suffix;
  end loop;

  insert into public.profiles (id, display_name)
  values (new.id, candidate);
  return new;
end;
$$;
