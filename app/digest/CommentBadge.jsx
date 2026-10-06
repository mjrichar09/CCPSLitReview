'use client';

import { useEngagement } from './Engagement.jsx';
import { useSession } from './SessionProvider.jsx';

/**
 * The comment count for one paper, shown on the collapsed row so a reader can
 * tell a paper has an active discussion before expanding it.
 *
 * Lives in `.item-tags` alongside `Badges`/`VoteButtons`, which sits inside
 * `<summary>` — always rendered regardless of the `<details>` open/closed
 * state, so no separate expanded-state wiring is needed.
 */
export default function CommentBadge({ itemId }) {
  const engagement = useEngagement();
  const { guest } = useSession();
  if (!engagement || guest) return null;

  const count = engagement.counts.get(itemId) ?? 0;

  return (
    <span className="comment-badge">
      <span aria-hidden="true">&#128172;</span> {count}
    </span>
  );
}
