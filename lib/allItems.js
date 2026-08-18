import { getAllMonths, getReport } from './digest.js';
import { itemSlug } from '../app/digest/shared.js';

/**
 * Every distinct paper ever published, newest occurrence first.
 *
 * Reads every committed month (getAllMonths() is already newest-first) and
 * keeps only the first copy of each item id it encounters — a paper that
 * recurs across months is still one paper, and the most recent month's copy
 * is the most relevant context to show it in outside its original category
 * page. Used by pages that are not month-scoped (favorites, the discussion
 * board), which is also why this lives in lib/ rather than being folded into
 * a single category's item list the way CategoryPage already builds one.
 */
export async function getAllItemsIndex() {
  const months = await getAllMonths();
  const seen = new Set();
  const out = [];

  for (const month of months) {
    const report = await getReport(month);
    if (!report) continue;
    for (const category of report.categories ?? []) {
      for (const item of category.items ?? []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push({
          item,
          month,
          category,
          href: `/digest/${month}/${category.id}#${itemSlug(item.id)}`,
        });
      }
    }
  }
  return out;
}
