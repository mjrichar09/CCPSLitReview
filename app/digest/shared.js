/**
 * URL-safe, deterministic id for an item (a DOI, PMID, or title hash — see
 * lib/util/identity.js), used as the anchor id on its `<details>` element.
 * Ids are already globally unique, so no reverse mapping is stored anywhere:
 * a page finds an item by re-deriving the same slug from each item's id at
 * request time. A collision would need two different ids to slugify
 * identically, not worth guarding against for a personal digest of a few
 * hundred items a month.
 */
export function itemSlug(id) {
  return String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A paper's home category, item record, and the in-page anchor for its
 * expandable overview.
 *
 * There is no separate article page — the full summary lives on the section
 * page as a collapsible `<details>` — so "the" URL for a paper is its section
 * page plus a `#slug` anchor to that element. `report.categories[*].items`
 * carries one full copy of the paper per category it survived scoring in
 * (lib/pipeline/write.js), so "the" category for linking purposes is just the
 * first one that contains it, in report order. `otherAppearances` below is
 * how a page links to the other copies.
 */
export function resolveItem(month, report, itemId) {
  for (const category of report.categories) {
    const item = category.items.find((i) => i.id === itemId);
    if (item) {
      return { item, category, href: `/digest/${month}/${category.id}#${itemSlug(item.id)}` };
    }
  }
  return null;
}

/** Every OTHER category this item also appears in, with the anchor href for that copy. */
export function otherAppearances(month, report, itemId, excludeCategoryId) {
  const out = [];
  for (const category of report.categories) {
    if (category.id === excludeCategoryId) continue;
    const item = category.items.find((i) => i.id === itemId);
    if (item) out.push({ category, href: `/digest/${month}/${category.id}#${itemSlug(item.id)}` });
  }
  return out;
}

/** `YYYY-MM-01` -> "August 2026". Built in UTC so the label cannot slip a month. */
export function monthLabel(monthOf) {
  const d = new Date(`${monthOf}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatAuthors(authors) {
  if (!authors || authors.length === 0) return null;
  if (authors.length <= 3) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`;
}
