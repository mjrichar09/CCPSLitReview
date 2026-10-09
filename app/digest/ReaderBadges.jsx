'use client';

import { useMonthStats } from './MonthStats.jsx';
import { useSession } from './SessionProvider.jsx';

/**
 * "Most discussed" and "Readers' pick", ranked across the whole month by
 * MonthStats. Each carries an icon and a label, never color alone. Outside a
 * month (favorites, discussion board) there is no month to rank against, so
 * nothing renders; nor for a guest, since both are reader feedback.
 */
export default function ReaderBadges({ itemId }) {
  const stats = useMonthStats();
  const { guest } = useSession();
  if (!stats?.enabled || guest) return null;
  const { mostDiscussed, readersPick } = stats.badgesFor(itemId);
  if (mostDiscussed == null && readersPick == null) return null;

  return (
    <>
      {readersPick != null && (
        <span className="badge badge-pick" title={`Net +${readersPick} reader votes — among the top three this month`}>
          <span aria-hidden="true">★</span> Readers&apos; pick
        </span>
      )}
      {mostDiscussed != null && (
        <span className="badge badge-discussed" title={`${mostDiscussed} comments — among the most discussed this month`}>
          <span aria-hidden="true">💬</span> Most discussed
        </span>
      )}
    </>
  );
}
