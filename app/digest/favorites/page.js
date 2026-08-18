import { getAllItemsIndex } from '../../../lib/allItems.js';
import { itemSlug } from '../shared.js';
import ItemRow from '../ItemRow.jsx';
import Engagement from '../Engagement.jsx';
import FavoritesList from '../FavoritesList.jsx';
import SiteHeader from '../SiteHeader.jsx';

export const metadata = {
  title: 'Favorites — Cell Culture Literature Review',
};

/**
 * Every paper ever published, server-rendered once and then filtered down to
 * the signed-in reader's favorites by `FavoritesList` — the same "server
 * renders everything, a client leaf decides what's actually shown" shape
 * `SortableItemList` already established for one category's items, applied
 * here across the whole archive instead of one month.
 */
export default async function FavoritesPage() {
  const index = await getAllItemsIndex();

  return (
    <>
      <SiteHeader />
      <div className="layout">
        <main className="col-main">
          <h1 className="report-title">Favorites</h1>
          <p className="report-summary">Papers you&apos;ve starred, across every month.</p>
          <Engagement
            itemMonths={Object.fromEntries(index.map((e) => [e.item.id, e.month]))}
            itemIds={index.map((e) => e.item.id)}
          >
            <FavoritesList itemIds={index.map((e) => e.item.id)}>
              {index.map((e) => (
                <ItemRow key={e.item.id} item={e.item} id={itemSlug(e.item.id)} categoryId={e.category.id} />
              ))}
            </FavoritesList>
          </Engagement>
        </main>
        <footer className="site-credit">Created by Mark Richards. All Rights Reserved.</footer>
      </div>
    </>
  );
}
