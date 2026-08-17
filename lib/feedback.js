import { getAllMonths, getReport } from './digest.js';
import { isSupabaseServerConfigured, getSupabaseServer } from './supabase/server.js';

/**
 * Reader votes, fed back into the score stage's rubric prompt — the Phase C
 * work TODO.md already described. Mirrors `lib/util/history.js`'s
 * `loadHistory`/`historyBlock` shape deliberately: same "read committed
 * months, build a fenced block, guard it against over-reading" pattern, one
 * new input (Supabase) instead of zero.
 *
 * Disabled, not failed, when the Supabase env vars are absent — a deployment
 * without the feedback feature configured must still score normally. But once
 * configured, a query that fails is not caught here: an unreadable
 * `vote_tallies` is not a third fail-soft category alongside the adapters,
 * it halts the run the same way any other stage failure does.
 */

const EMPTY = { enabled: false, byCategory: new Map() };

const NOISE_FLOOR = 2; // |net votes| below this is not a signal, just noise from one or two readers.
const MAX_PER_CATEGORY = 8; // Keeps the prompt bounded; most contentious items first.

const FEEDBACK_GUARD = `This is a handful of votes from one reader, not a survey. Treat it as a mild tiebreaker between items that are otherwise close on the rubric, never as a reason to score something above what the rubric itself supports, and never as a reason to invent a pattern from one or two votes.`;

export async function loadFeedback(month, { env = process.env, back = 3, fetchVotes: injectedFetchVotes } = {}) {
  if (!isSupabaseServerConfigured(env)) return EMPTY;
  // Votes are scoped to what a previous, already-published month contains;
  // with no target month to anchor "previous" against there is nothing to
  // resolve titles or categories from.
  if (!month) return EMPTY;

  const fetchVotes = injectedFetchVotes ?? defaultFetchVotes(env);
  const rows = await fetchVotes();

  const totals = new Map();
  for (const row of rows) {
    const entry = totals.get(row.item_id) ?? { up: 0, down: 0 };
    entry.up += row.up;
    entry.down += row.down;
    totals.set(row.item_id, entry);
  }

  const resolved = await resolveTitlesAndCategories(month, back);

  const byCategory = new Map();
  for (const [itemId, { up, down }] of totals) {
    const net = up - down;
    if (Math.abs(net) < NOISE_FLOOR) continue;
    const info = resolved.get(itemId);
    if (!info) continue; // No title/category to report it under.
    if (!byCategory.has(info.categoryId)) byCategory.set(info.categoryId, []);
    byCategory.get(info.categoryId).push({ title: info.title, up, down, net });
  }

  for (const [categoryId, entries] of byCategory) {
    entries.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    byCategory.set(categoryId, entries.slice(0, MAX_PER_CATEGORY).sort((a, b) => b.net - a.net));
  }

  return { enabled: true, byCategory };
}

/** `item_id -> { title, categoryId }`, from the `back` months strictly earlier than `month`. */
async function resolveTitlesAndCategories(month, back) {
  const map = new Map();
  if (!(back > 0)) return map;

  const months = (await getAllMonths()).filter((m) => m.localeCompare(month) < 0).slice(0, back);
  for (const past of months) {
    const report = await getReport(past);
    if (!report) continue;
    for (const category of report.categories ?? []) {
      for (const item of category.items ?? []) {
        if (!map.has(item.id)) map.set(item.id, { title: item.title, categoryId: category.id });
      }
    }
  }
  return map;
}

function defaultFetchVotes(env) {
  return async () => {
    const supabase = getSupabaseServer({ env });
    const { data, error } = await supabase.from('vote_tallies').select('item_id, up, down');
    if (error) throw new Error(`feedback: could not read vote_tallies: ${error.message}`);
    return data ?? [];
  };
}

/** Reader feedback for one category, or '' when there is none worth showing. */
export function feedbackBlock(entries) {
  if (!entries?.length) return '';
  const lines = entries.map((e) => `- ${e.up} up / ${e.down} down — ${e.title}`).join('\n');
  return `

READER FEEDBACK (previous months, this category) — how the reader rated items after publication:

${lines}

${FEEDBACK_GUARD}`;
}
