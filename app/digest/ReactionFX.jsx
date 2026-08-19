'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * Big, silly, purely decorative reaction animations for voting, favoriting,
 * and marking a paper read — a thumbs bursting toward the viewer, a star
 * shooting across the screen, a checkmark drawing itself in. Fired from
 * wherever the button lives (`VoteButtons`, `FavoriteButton`, `ReadToggle`,
 * scattered across every `ItemRow`), rendered from one place: a single fixed
 * layer mounted once here, so the animation is never clipped by a card's own
 * `overflow` or stacking context. `aria-hidden` throughout — this has
 * nothing to say to a screen reader, the underlying state change already
 * does.
 */

const ReactionContext = createContext(null);
export const useReaction = () => useContext(ReactionContext);

/** How long each kind's CSS animation runs, so the element can be cleaned up after. */
const LIFETIMES = { up: 900, down: 900, favorite: 900, read: 1300 };

let nextId = 0;

export default function ReactionProvider({ children }) {
  const [effects, setEffects] = useState([]);
  const timers = useRef(new Map());

  const fire = useCallback((kind, originEl) => {
    const rect = originEl?.getBoundingClientRect?.();
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const id = nextId++;
    setEffects((fx) => [...fx, { id, kind, origin }]);
    const timer = setTimeout(() => {
      setEffects((fx) => fx.filter((e) => e.id !== id));
      timers.current.delete(id);
    }, LIFETIMES[kind] ?? 1000);
    timers.current.set(id, timer);
  }, []);

  return (
    <ReactionContext.Provider value={{ fire }}>
      {children}
      <div className="reaction-layer" aria-hidden="true">
        {effects.map((e) => (
          <ReactionFX key={e.id} kind={e.kind} origin={e.origin} />
        ))}
      </div>
    </ReactionContext.Provider>
  );
}

function ReactionFX({ kind, origin }) {
  const style = { '--x': `${origin.x}px`, '--y': `${origin.y}px` };

  if (kind === 'up' || kind === 'down') {
    return (
      <span className="reaction-fx reaction-thumb" style={style}>
        {kind === 'up' ? '👍' : '👎'}
      </span>
    );
  }

  if (kind === 'favorite') {
    return (
      <span className="reaction-fx reaction-star" style={style}>
        ★
      </span>
    );
  }

  // 'read': centered regardless of origin — a big confirmation moment, not
  // something that needs to feel anchored to a small toggle button.
  return (
    <span className="reaction-fx reaction-check">
      <svg viewBox="0 0 52 52">
        <path className="reaction-check-path" d="M14 27l8 8 16-18" />
      </svg>
    </span>
  );
}
