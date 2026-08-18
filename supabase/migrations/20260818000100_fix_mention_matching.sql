-- Fix @mention matching: the original notify_comment_mentions() never
-- actually matched anything against a real display name.
--
-- It extracted a candidate handle with regexp_matches(body, '@([A-Za-z0-9
-- _-]{2,32})') and then required that extracted text to equal a display name
-- exactly. Two ways that failed on every real comment posted so far:
--
--   1. The character class has no punctuation, so it keeps consuming
--      whatever ordinary prose follows the name. "@Mark Richards Wow,
--      amazing." captured "Mark Richards Wow" (stops at the comma) - not
--      "Mark Richards". "@I M , you..." captured "I M " (trailing space
--      before the comma) - not "I M".
--   2. A display name containing punctuation the class doesn't allow (e.g.
--      "Yan Chun Yeoh (Jason)") can never be captured in full at all - the
--      extraction stops at the '(' every time.
--
-- The fix inverts the approach: instead of extracting an arbitrary substring
-- and comparing it to known names, it checks whether "@<name>" for each
-- known approved display name literally appears in the body, using plain
-- substring search rather than a restrictive capture class - so punctuation
-- in a display name is just part of the literal text being searched for, not
-- something a character class has to allow. A match only counts if what
-- comes right before the '@' is the start of the body or whitespace, and
-- what comes right after the name is the end of the body, whitespace, or
-- punctuation - so "@Jane Doering" cannot match a mention of "@Jane Doe".
--
-- Known limitation, accepted rather than engineered around: if both "Jane"
-- and "Jane Doe" are registered display names, "@Jane Doe" notifies both,
-- since "@Jane" followed by a space is indistinguishable from a short mention
-- continuing into ordinary prose. Not worth the extra complexity for a
-- handful of readers.

create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  needle text;
  needle_len int;
  search_from int;
  idx int;
  before_ch text;
  after_ch text;
begin
  for candidate in
    select p.id, p.display_name
      from public.profiles p
     where p.approved
       and p.id <> new.user_id
  loop
    needle := '@' || lower(candidate.display_name);
    needle_len := char_length(needle);
    search_from := 1;

    loop
      idx := position(needle in lower(substr(new.body, search_from)));
      exit when idx = 0;
      idx := idx + search_from - 1; -- absolute position in new.body

      before_ch := case when idx = 1 then '' else substr(new.body, idx - 1, 1) end;
      after_ch := substr(new.body, idx + needle_len, 1);

      if (idx = 1 or before_ch ~ '\s') and (after_ch = '' or after_ch ~ '[\s[:punct:]]') then
        insert into public.notifications (recipient_id, actor_id, comment_id, item_id, category_id, month)
        values (candidate.id, new.user_id, new.id, new.item_id, new.category_id, new.month);
        exit; -- one notification per mentioned person per comment
      end if;

      search_from := idx + 1; -- this occurrence didn't have a clean boundary; keep scanning
    end loop;
  end loop;
  return new;
end;
$$;

-- create or replace preserves the REVOKE from the original migration, but
-- restate it: PostgREST re-grants EXECUTE to PUBLIC on any function it does
-- not already have an explicit grant record for, and a CREATE OR REPLACE is
-- indistinguishable from a fresh CREATE for that purpose.
revoke all on function public.notify_comment_mentions() from public, anon, authenticated;
