import { buildImportRow, IMPORTS_CATEGORY } from '../../lib/userPapers.js';

/** `created_at` as the YYYY-MM the comments table requires. */
export function importMonth(createdAt) {
  const d = createdAt ? new Date(createdAt) : new Date();
  const at = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Write imported papers, and their commentary as comments by the same user.
 *
 * Each paper is inserted on its own rather than in one batch: a deck routinely
 * cites a paper that is already in the section, and one duplicate must not
 * roll back the other nineteen. A duplicate `item_id` comes back as a unique
 * violation (23505) and is counted as "already there", which is the truth and
 * not an error worth showing.
 *
 * The comment is written after the paper it belongs to, and a comment that
 * fails does not undo the import — the paper is the thing being added, and a
 * lost remark is recoverable by typing it again.
 */
export async function importPapers({ supabase, user, entries, source, deckTitle = null }) {
  let added = 0;
  let duplicates = 0;
  const failed = [];

  for (const { paper, commentary } of entries) {
    const built = buildImportRow({
      ...paper,
      source,
      deckTitle,
      userId: user.id,
      uuid: paper.doi ? null : crypto.randomUUID(),
    });
    if (!built.ok) {
      failed.push({ title: paper?.title ?? 'unknown', reason: built.reason });
      continue;
    }

    const { error } = await supabase.from('user_papers').insert(built.row);
    if (error && error.code !== '23505') {
      failed.push({ title: built.row.title, reason: error.message });
      continue;
    }
    if (error) duplicates += 1;
    else added += 1;

    if (commentary) {
      await supabase.from('comments').insert({
        user_id: user.id,
        item_id: built.row.item_id,
        month: importMonth(),
        category_id: IMPORTS_CATEGORY,
        body: commentary,
      });
    }
  }

  return { added, duplicates, failed };
}
