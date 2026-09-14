-- Reader-imported papers: the "user added" section.
--
-- Papers a reader brings in by hand (a DOI they were sent) or in bulk from a
-- conference deck. Deliberately NOT part of any month: months are written by
-- the pipeline, committed to git, and append-only, and there is no runtime
-- write path to them at all (see CLAUDE.md, "Storage layer"). Reader-supplied
-- content already has exactly one home in this architecture — Postgres,
-- reached from client islands under row-level security — so imports live here
-- beside votes and comments rather than bending the content write path.
--
-- Shared, not private: any approved reader may import, and every approved
-- reader sees the result, attributed to the importer. Same posture as
-- comments, which is what lets an import carry a discussion.

create table public.user_papers (
  id           uuid primary key default gen_random_uuid(),
  -- The digest's own identity scheme (lib/util/identity.js): `doi:10.x/y`
  -- when a DOI is known, else `user:<uuid>` for a title-only import. A DOI
  -- import therefore shares its item_id with the same paper if the pipeline
  -- later publishes it in a month — so comments written here carry straight
  -- over to it rather than stranding on a duplicate.
  item_id      text        not null unique,
  user_id      uuid        not null references auth.users on delete cascade,
  title        text        not null check (length(btrim(title)) between 1 and 500),
  authors      text[]      not null default '{}',
  venue        text,
  published    text,
  doi          text,
  url          text,
  abstract     text,
  -- 'manual' (one DOI at a time) or 'conference' (extracted from a deck).
  source       text        not null default 'manual' check (source in ('manual', 'conference')),
  -- Conference imports only: which deck this came from, so the section can
  -- group them and say where they are from.
  deck_title   text,
  created_at   timestamptz not null default now()
);

create index user_papers_created_idx on public.user_papers (created_at desc);

comment on table public.user_papers is
  'Reader-imported papers. Not part of any month; rendered in the user-added section and fed to the synthesize stage as context.';

/*
 * Rate limit, for the same reason comments have one: sign-up is open, the
 * table is shared, and the cheap bound belongs where a client cannot route
 * around it. A conference deck is a legitimate burst, so this is sized for
 * "several decks in a sitting" rather than for one-at-a-time typing.
 */
create function public.enforce_user_paper_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.user_papers
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';

  if recent >= 300 then
    raise exception 'import rate limit exceeded: 300 papers per hour';
  end if;

  return new;
end;
$$;

create trigger user_papers_rate_limit
  before insert on public.user_papers
  for each row execute function public.enforce_user_paper_rate_limit();

alter table public.user_papers enable row level security;

-- Readable by approved readers only, matching the posture comments were
-- tightened to: this is digest content, and the digest is not public.
create policy user_papers_select_approved on public.user_papers
  for select to authenticated
  using (public.is_approved());

create policy user_papers_insert_approved on public.user_papers
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

-- An importer may remove their own import. No update policy: an import is a
-- record of what was brought in, and the editable part of it is the comment,
-- which lives in `comments` and has its own edit path.
create policy user_papers_delete_own on public.user_papers
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on function public.enforce_user_paper_rate_limit() from public, anon, authenticated;

/*
 * Comments on an imported paper.
 *
 * `comments.month` is `not null check (month ~ '^\d{4}-\d{2}$')` and an
 * imported paper belongs to no month, so the import's own month (the one it
 * was added in) is used. That keeps the existing constraint, the existing
 * notification deep-link builder, and `comment_counts` working unchanged —
 * the alternative, making `month` nullable, would push a null check into
 * every consumer for no gain.
 *
 * `category_id` is set to 'imports' by the client, which is the section these
 * render in, so a mention notification deep-links to /digest/imports the same
 * way a normal one deep-links to a category page.
 */
