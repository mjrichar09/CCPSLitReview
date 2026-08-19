'use client';

import { useEngagement } from './Engagement.jsx';
import { useSession } from './SessionProvider.jsx';
import { useReaction } from './ReactionFX.jsx';

/**
 * Thumbs up / thumbs down for one paper, rendered on the collapsed row so a
 * reader can see and cast a rating without expanding anything.
 *
 * The three session states each get their own affordance rather than a single
 * disabled button: "sign in to rate" and "awaiting approval" are different
 * problems with different fixes, and a reader who cannot tell which one they
 * are looking at will assume the site is broken.
 */
export default function VoteButtons({ itemId }) {
  const engagement = useEngagement();
  const { enabled, ready, user, approved } = useSession();
  const reaction = useReaction();

  // Rendered outside a page that provides engagement, or Supabase unconfigured:
  // the digest is the product, so the widget simply is not there.
  if (!engagement || !enabled) return null;

  const { tallies, mine, castVote } = engagement;
  const { up = 0, down = 0 } = tallies.get(itemId) ?? {};
  const chosen = mine.get(itemId) ?? 0;
  const canVote = ready && Boolean(user) && approved;

  const title = !user
    ? 'Sign in to rate this paper'
    : !approved
      ? 'Your account is awaiting approval'
      : 'Click again to retract';

  /**
   * These buttons live inside the `<summary>` of the paper's `<details>`, so a
   * click here would otherwise bubble up and toggle the disclosure — rating a
   * paper would expand or collapse it as a side effect. preventDefault stops
   * the browser's own summary activation; stopPropagation stops the bubble.
   *
   * A signed-out click does nothing but explain itself. There are two providers
   * now, so this control cannot start a sign-in without silently choosing one
   * for the reader; the account bar at the top of the page offers both.
   */
  const onClick = (event, value) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canVote) return;
    // Only the burst that sets a rating is worth celebrating — retracting
    // one (clicking the button you already chose) gets no animation.
    if (chosen !== value) reaction?.fire(value === 1 ? 'up' : 'down', event.currentTarget);
    castVote(itemId, value);
  };

  return (
    <span className="vote" title={title}>
      <button
        type="button"
        className={`vote-btn${chosen === 1 ? ' vote-btn-on' : ''}`}
        aria-pressed={chosen === 1}
        aria-label={`Rate relevant (${up} so far)`}
        disabled={!canVote}
        onClick={(e) => onClick(e, 1)}
      >
        <span aria-hidden="true">&#128077;</span> {up}
      </button>
      <button
        type="button"
        className={`vote-btn${chosen === -1 ? ' vote-btn-on' : ''}`}
        aria-pressed={chosen === -1}
        aria-label={`Rate not relevant (${down} so far)`}
        disabled={!canVote}
        onClick={(e) => onClick(e, -1)}
      >
        <span aria-hidden="true">&#128078;</span> {down}
      </button>
    </span>
  );
}
