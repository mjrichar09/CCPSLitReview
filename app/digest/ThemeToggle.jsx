'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ccpslitreview:theme';

/** The theme actually in effect: an explicit override, else the OS preference. */
function currentTheme() {
  const stored = document.documentElement.getAttribute('data-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Forces light or dark regardless of the OS setting, remembered in
 * localStorage. The inline script in `app/layout.js` applies a stored choice
 * before hydration, so this component only has to read the state that is
 * already on `<html>` rather than race it.
 *
 * `theme` starts `null` and renders nothing until mount: the server has no way
 * to know the visitor's OS preference or a stored override, so guessing here
 * would either flash or mismatch hydration.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    // Deferred a tick, matching how every other effect in this app that
    // reads an external source (Supabase's `.then()` calls) only sets state
    // from a callback rather than synchronously in the effect body.
    queueMicrotask(() => setTheme(currentTheme()));
  }, []);

  if (!theme) return null;

  const next = theme === 'dark' ? 'light' : 'dark';

  const flip = () => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or a full quota: the switch still applies to this
      // page load, it just will not be remembered on the next visit.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={flip}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  );
}
