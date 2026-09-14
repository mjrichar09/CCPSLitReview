import { createClient } from '@supabase/supabase-js';

/**
 * Reader-imported papers, read back into the generation stage so the months
 * that follow an import can discuss it.
 *
 * This is the "parsed into the discussions for future weeks" half of the
 * import feature: a paper a reader added by hand in September is context the
 * October write-up should have, even though it belongs to no month and the
 * scoring model never judged it.
 *
 * ## Why this needs its own key
 *
 * `user_papers` and `comments` are readable only by an authenticated,
 * approved reader (migrations 20260913000100/000200). The pipeline is neither
 * — it runs in Actions with an anon key and no session — so unlike
 * `lib/feedback.js`, which reads `vote_tallies` through a policy that admits
 * `anon`, this cannot be done with the publishable key.
 *
 * The alternative considered and rejected was a `security definer` view
 * granted to `anon`, which is how `vote_tallies` works. It would have
 * re-opened to the whole internet exactly what migration 20260913000100 just
 * closed: reader-written discussion, readable by anyone holding a key that
 * ships in the browser bundle. A service-role key is the narrower exposure —
 * it lives only in Actions secrets, never in a `NEXT_PUBLIC_*` variable, and
 * never reaches a browser.
 *
 * Disabled, not failed, when that key is absent: a deployment that has not
 * configured it still generates months normally, without import context. Once
 * configured, a query that fails halts the run rather than silently producing
 * a month with imports missing — the same line `lib/feedback.js` draws.
 */

const EMPTY = { enabled: false, papers: [] };

/** Bounded so a year of enthusiastic importing cannot crowd out the month itself. */
const MAX_PAPERS = 40;
const MAX_COMMENTS_PER_PAPER = 5;

export function isImportReadConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Imported papers added strictly before `month`, newest first, each with the
 * comments readers attached to it.
 *
 * Strictly before, for the same reason `loadHistory` is: generating a month
 * must not fold in imports made after it was written, or a `--force` re-run
 * would produce a different month than the original.
 */
export async function loadImportedPapers(month, { env = process.env, fetchRows: injected } = {}) {
  if (!isImportReadConfigured(env)) return EMPTY;
  if (!month) return EMPTY;

  const fetchRows = injected ?? defaultFetchRows(env);
  const { papers, comments } = await fetchRows();

  // `month` is YYYY-MM; everything imported before the first instant of it.
  const cutoff = `${month}-01T00:00:00.000Z`;

  const byItem = new Map();
  for (const comment of comments ?? []) {
    if (!byItem.has(comment.item_id)) byItem.set(comment.item_id, []);
    const list = byItem.get(comment.item_id);
    if (list.length < MAX_COMMENTS_PER_PAPER) list.push(comment.body);
  }

  const selected = (papers ?? [])
    .filter((p) => !p.created_at || p.created_at < cutoff)
    // Sorted here rather than trusted from the query: MAX_PAPERS truncates,
    // so which papers survive depends on this order, and a guarantee that
    // only holds because of an `order by` in one call site is not one.
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, MAX_PAPERS)
    .map((p) => ({
      id: p.item_id,
      title: p.title,
      venue: p.venue ?? null,
      published: p.published ?? null,
      doi: p.doi ?? null,
      source: p.source,
      deck_title: p.deck_title ?? null,
      comments: byItem.get(p.item_id) ?? [],
    }));

  return { enabled: true, papers: selected };
}

function defaultFetchRows(env) {
  return async () => {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: papers, error: papersError } = await supabase
      .from('user_papers')
      .select('item_id, title, venue, published, doi, source, deck_title, created_at')
      .order('created_at', { ascending: false });
    if (papersError) throw new Error(`imports: could not read user_papers: ${papersError.message}`);

    const ids = (papers ?? []).map((p) => p.item_id);
    if (!ids.length) return { papers: papers ?? [], comments: [] };

    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('item_id, body, created_at')
      .in('item_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (commentsError) throw new Error(`imports: could not read comments: ${commentsError.message}`);

    return { papers: papers ?? [], comments: comments ?? [] };
  };
}

const IMPORT_GUARD = `These papers were added by a reader by hand, not found by the monthly search, and were never scored against a rubric. The reader's own remarks are the reason each one is here. Treat them as known context you may refer back to when this month's papers connect to them — never as this month's results, and never as something to summarize in place of the month's own work.`;

/** The imported-papers block for a generation prompt, or '' when there is nothing. */
export function importedBlock(papers) {
  if (!papers?.length) return '';

  const lines = papers
    .map((p) => {
      const meta = [p.venue, p.published].filter(Boolean).join(', ');
      const head = `- ${p.title}${meta ? ` (${meta})` : ''}${p.deck_title ? ` — from "${p.deck_title}"` : ''}`;
      if (!p.comments.length) return head;
      return `${head}\n${p.comments.map((c) => `    reader note: ${c}`).join('\n')}`;
    })
    .join('\n');

  return `

READER-IMPORTED PAPERS (added by hand before this month, with the reader's own notes):

${lines}

${IMPORT_GUARD}`;
}
