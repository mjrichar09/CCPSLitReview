-- Push notification on new sign-up, so a pending approval doesn't sit
-- unnoticed. Backlog item from TODO.md.
--
-- pg_net is Postgres's own async HTTP client — available on this project,
-- just not enabled yet. A trigger calling net.http_post() queues the
-- request and returns immediately; the actual call runs on a background
-- worker, so a slow or unreachable notification target can never block or
-- fail a sign-up.
--
-- Delivered via ntfy.sh: no account, no API key, no email service to wire
-- up — just a topic name, which is also the only thing standing in for
-- access control on ntfy's free tier. It is a long random string rather
-- than something guessable for exactly that reason: anyone who knew the
-- exact topic could subscribe to it too.
create extension if not exists pg_net;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ntfy.sh/',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'topic', 'ccps-signups-a9c88194948bca3649570fe9ce9917cc',
      'title', 'New reader sign-up',
      'message', coalesce(new.display_name, 'A new reader') || ' just signed up and is awaiting approval.',
      'tags', jsonb_build_array('bust_in_silhouette'),
      'priority', 3,
      'click', 'https://supabase.com/dashboard/project/cxghyhwovgbqaljmpahz/editor'
    )
  );
  return new;
end;
$$;

create trigger profiles_notify_new_signup
  after insert on public.profiles
  for each row execute function public.notify_new_signup();

-- Same hardening as every other trigger function in this schema: a
-- SECURITY DEFINER function has no business being callable directly over
-- PostgREST.
revoke all on function public.notify_new_signup() from public, anon, authenticated;
