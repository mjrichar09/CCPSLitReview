'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * Big, silly, purely decorative reaction animations for voting, favoriting,
 * and marking a paper read — a thumbs bursting toward the viewer, a star
 * shooting across the screen, a confetti burst trickling down. Fired from
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
const LIFETIMES = { up: 900, down: 900, favorite: 1900, read: 3800 };

const CONFETTI_COLORS = ['#f5b400', '#2563eb', '#e0245e', '#17bf63', '#8b5cf6', '#ff7a45'];
const CONFETTI_COUNT = 70;

let nextId = 0;

/**
 * Randomized once per burst, here rather than in a component: generating
 * random piece data during render (even inside useMemo) is impure — React
 * may call a render function more than once and discard the extra call, so
 * anything depending on Math.random() has to happen in a real event
 * handler, which `fire()` already is.
 */
function makeConfettiPieces() {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: Math.random() * 0.6,
    duration: 2.4 + Math.random() * 1.4,
    drift: (Math.random() - 0.5) * 240,
    spin: Math.round((Math.random() < 0.5 ? -1 : 1) * (360 * (2 + Math.random() * 3))),
    size: 6 + Math.random() * 7,
    round: Math.random() < 0.5,
  }));
}

export default function ReactionProvider({ children }) {
  const [effects, setEffects] = useState([]);
  const timers = useRef(new Map());

  const fire = useCallback((kind, originEl) => {
    const rect = originEl?.getBoundingClientRect?.();
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // The star's destination: wherever the Favorites link actually is right
    // now, not a fixed offset — so it still aims true if the header ever
    // reflows (a narrower viewport, a longer site title, and so on).
    let target = null;
    if (kind === 'favorite') {
      const targetRect = document.querySelector('[data-reaction-target="favorites"]')?.getBoundingClientRect();
      target = targetRect
        ? { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }
        : { x: origin.x, y: 0 };
    }

    const pieces = kind === 'read' ? makeConfettiPieces() : null;

    const id = nextId++;
    setEffects((fx) => [...fx, { id, kind, origin, target, pieces }]);
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
          <ReactionFX key={e.id} kind={e.kind} origin={e.origin} target={e.target} pieces={e.pieces} />
        ))}
      </div>
    </ReactionContext.Provider>
  );
}

function ReactionFX({ kind, origin, target, pieces }) {
  const style = { '--x': `${origin.x}px`, '--y': `${origin.y}px` };

  if (kind === 'up' || kind === 'down') {
    return (
      <span className="reaction-fx reaction-thumb" style={style}>
        {kind === 'up' ? '👍' : '👎'}
      </span>
    );
  }

  if (kind === 'favorite') {
    return <StarFX origin={origin} target={target} />;
  }

  return <ConfettiFX pieces={pieces} />;
}

/** Flies from the clicked star to wherever the Favorites link currently is, trailing a tail. */
function StarFX({ origin, target }) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const style = {
    '--x': `${origin.x}px`,
    '--y': `${origin.y}px`,
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    '--tail-angle': `${angle}deg`,
  };
  return (
    <span className="reaction-fx reaction-star-fly" style={style}>
      <span className="reaction-star-tail" />
      <span className="reaction-star-glyph">★</span>
    </span>
  );
}

/**
 * A screen-wide confetti burst, trickling down — deliberately not anchored
 * to the clicked button the way the other reactions are; "marked read" is a
 * whole-screen celebration, not a small local one. `pieces` is generated
 * once in `fire()`, not here, so nothing about this component's render is
 * random.
 */
function ConfettiFX({ pieces }) {
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`reaction-confetti-piece${p.round ? ' is-round' : ''}`}
          style={{
            '--left': `${p.left}vw`,
            '--color': p.color,
            '--delay': `${p.delay}s`,
            '--duration': `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
            '--size': `${p.size}px`,
          }}
        />
      ))}
    </>
  );
}
