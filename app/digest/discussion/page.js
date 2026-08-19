import { getAllItemsIndex } from '../../../lib/allItems.js';
import { itemSlug } from '../shared.js';
import ItemRow from '../ItemRow.jsx';
import Engagement from '../Engagement.jsx';
import DiscussionList from '../DiscussionList.jsx';
import SiteHeader from '../SiteHeader.jsx';

export const metadata = {
  title: 'Discussion — Cell Culture Literature Review',
};

/**
 * Every commented-on paper, across every month, with its full thread already
 * open — the point of this page is the discussion, not a summary a reader
 * has to click through to reach. `defaultOpen` on `ItemRow` is what forces
 * that; `Comments.jsx`'s own lazy-load already fires correctly off the
 * native `<details open>` attribute, the same way it does for a `:target`
 * deep link.
 */
export default async function DiscussionPage() {
  const index = await getAllItemsIndex();

  return (
    <>
      <SiteHeader />
      <div className="layout">
        <main className="col-main">
          <h1 className="report-title">Discussion</h1>
          <p className="report-summary">Every paper with a comment thread, most recent comment first.</p>
          <Engagement
            itemMonths={Object.fromEntries(index.map((e) => [e.item.id, e.month]))}
            itemIds={index.map((e) => e.item.id)}
          >
            <DiscussionList itemIds={index.map((e) => e.item.id)}>
              {index.map((e) => (
                <ItemRow
                  key={e.item.id}
                  item={e.item}
                  id={itemSlug(e.item.id)}
                  categoryId={e.category.id}
                  defaultOpen
                />
              ))}
            </DiscussionList>
          </Engagement>
        </main>
        <footer className="site-credit">Created by Mark Richards. All Rights Reserved.</footer>
      </div>
    </>
  );
}
