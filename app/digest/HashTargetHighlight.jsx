'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const HIGHLIGHT_MS = 2600;

/**
 * Opens, scrolls to, and briefly highlights whatever element a URL fragment
 * names — the thing every "go look at this specific paper" link in this app
 * depends on: notifications, the Top 5, "Also appears in", search results.
 *
 * A plain `:target` CSS rule used to do this, and only ever worked on a full
 * page load: `:target` re-evaluates on a real fragment navigation, but
 * Next's client-side router changes the URL through the History API
 * instead, which never re-triggers it. Every one of those links is an
 * in-app click, so the reader always landed on the right page but a closed,
 * unhighlighted card — indistinguishable from its neighbors.
 *
 * Mounted once in app/digest/layout.js, so it survives navigation between
 * pages under /digest rather than being torn down and rebuilt.
 */
export default function HashTargetHighlight() {
  const pathname = usePathname();

  useEffect(() => {
    const go = (explicitHash) => {
      const hash = explicitHash ?? decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;

      if (el.tagName === 'DETAILS' && !el.open) el.open = true;
      el.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });

      // Remove-reflow-add restarts the animation if the reader lands on the
      // same target twice in a row (e.g. two mentions on one paper).
      el.classList.remove('hash-target-flash');
      void el.offsetWidth;
      el.classList.add('hash-target-flash');
      setTimeout(() => el.classList.remove('hash-target-flash'), HIGHLIGHT_MS);
    };

    // Handles a full page load and a cross-page client-side navigation (this
    // effect reruns when `pathname` changes).
    go();

    // Handles a same-page hash-only click, which changes neither `pathname`
    // (so the effect above never reruns) nor fires `hashchange` (Next's
    // router updates the URL via history.pushState, which does not raise
    // that event) — so the target hash is read directly from the clicked
    // link rather than from any navigation signal.
    const onClick = (event) => {
      const a = event.target.closest?.('a[href*="#"]');
      if (!a) return;
      const url = new URL(a.href, window.location.href);
      if (url.pathname === window.location.pathname && url.hash) {
        go(decodeURIComponent(url.hash.slice(1)));
      }
    };
    const onPopState = () => go();

    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
    };
  }, [pathname]);

  return null;
}
