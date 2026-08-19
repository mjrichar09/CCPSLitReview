'use client';

import { useEngagement } from './Engagement.jsx';
import { useSession } from './SessionProvider.jsx';

/** Star toggle for one paper, on the collapsed row next to the vote buttons. */
export default function FavoriteButton({ itemId }) {
  const engagement = useEngagement();
  const { enabled, ready, user, approved } = useSession();

  if (!engagement || !enabled) return null;

  const { favoriteIds, toggleFavorite } = engagement;
  const isFavorite = favoriteIds.has(itemId);
  const canToggle = ready && Boolean(user) && approved;

  const title = !user
    ? 'Sign in to favorite this paper'
    : !approved
      ? 'Your account is awaiting approval'
      : isFavorite
        ? 'Remove from favorites'
        : 'Add to favorites';

  // Lives inside <summary>, same reason and same suppression as VoteButtons:
  // a click here must not also toggle the disclosure.
  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (canToggle) toggleFavorite(itemId);
  };

  return (
    <button
      type="button"
      className={`favorite-btn${isFavorite ? ' favorite-btn-on' : ''}`}
      aria-pressed={isFavorite}
      aria-label={title}
      title={title}
      disabled={!canToggle}
      onClick={onClick}
    >
      <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
    </button>
  );
}
