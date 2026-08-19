'use client';

import { useEngagement } from './Engagement.jsx';
import { useSession } from './SessionProvider.jsx';
import { useReaction } from './ReactionFX.jsx';

/**
 * "Mark read" / "Read" toggle for one paper, on the collapsed row next to
 * the vote buttons. Manual only — expanding a card does not mark it read on
 * its own, since opening a card to skim it is not the same as having read
 * it.
 */
export default function ReadToggle({ itemId }) {
  const engagement = useEngagement();
  const { enabled, ready, user, approved } = useSession();
  const reaction = useReaction();

  if (!engagement || !enabled) return null;

  const { readIds, toggleRead } = engagement;
  const isRead = readIds.has(itemId);
  const canToggle = ready && Boolean(user) && approved;

  const title = !user
    ? 'Sign in to mark this paper read'
    : !approved
      ? 'Your account is awaiting approval'
      : isRead
        ? 'Mark unread'
        : 'Mark read';

  // Lives inside <summary>, same reason and same suppression as VoteButtons:
  // a click here must not also toggle the disclosure.
  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canToggle) return;
    if (!isRead) reaction?.fire('read', event.currentTarget);
    toggleRead(itemId);
  };

  return (
    <button
      type="button"
      className={`read-toggle${isRead ? ' read-toggle-on' : ''}`}
      aria-pressed={isRead}
      title={title}
      disabled={!canToggle}
      onClick={onClick}
    >
      <span aria-hidden="true">{isRead ? '✓' : '○'}</span> {isRead ? 'Read' : 'Mark read'}
    </button>
  );
}
