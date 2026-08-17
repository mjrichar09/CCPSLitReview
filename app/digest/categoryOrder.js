const STORAGE_KEY = 'ccpslitreview:category-order';

/**
 * Reorder `categories` by a reader's saved id order.
 *
 * The saved list can go stale in either direction: a category added to
 * `config/digest.config.js` since the order was last saved is not in it, and
 * a category removed since then still is. Neither is an error — a category
 * missing from `savedIds` is appended at the end in its original (report)
 * order, and a `savedIds` entry with no matching category is silently
 * dropped.
 */
export function mergeOrder(categories, savedIds) {
  if (!savedIds || savedIds.length === 0) return categories;

  const byId = new Map(categories.map((c) => [c.id, c]));
  const ordered = [];
  const seen = new Set();

  for (const id of savedIds) {
    const category = byId.get(id);
    if (!category || seen.has(id)) continue;
    ordered.push(category);
    seen.add(id);
  }
  for (const category of categories) {
    if (!seen.has(category.id)) ordered.push(category);
  }
  return ordered;
}

/** The signed-out fallback: a reader's pill order remembered in this browser. */
export function readStoredOrder() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredOrder(order) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Private browsing or a full quota: the reorder still applies to this
    // page load, it just will not be remembered next visit.
  }
}
