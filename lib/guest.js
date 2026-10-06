/**
 * Guest access: read the digest without an account, with every piece of
 * reader feedback (votes, favorites, read marks, comments) left out.
 *
 * A guest is a visitor carrying the `GUEST_COOKIE` who is not an approved
 * reader. The cookie is not a credential — anyone can set it, and that is the
 * point: "View as guest" on the landing page is an open door to the digest
 * content by design. What it does not open is anything readers wrote or
 * keep: the member-only pages below are refused at the edge (proxy.js), the
 * feedback islands render nothing, and Postgres row-level security still
 * refuses every write and every comment read to a visitor with no approved
 * session, whatever the cookie says.
 *
 * Browser-safe and free of Next.js imports, so proxy.js, the client islands
 * and `node --test` can all share it.
 */

export const GUEST_COOKIE = 'ccps_guest';

const GUEST_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Pages that are nothing but reader feedback; a guest has no business on them. */
export const MEMBER_ONLY_PATHS = ['/digest/favorites', '/digest/discussion', '/digest/imports'];

export function isMemberOnlyPath(pathname) {
  return MEMBER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** True when a `Cookie` header / `document.cookie` string carries the guest cookie. */
export function hasGuestCookie(cookieString) {
  return (cookieString ?? '').split(';').some((part) => part.trim() === `${GUEST_COOKIE}=1`);
}

/** Browser only. */
export function readGuestCookie() {
  return typeof document !== 'undefined' && hasGuestCookie(document.cookie);
}

/**
 * Browser only. Also sets `data-guest` on <html> so the CSS hides the
 * feedback controls immediately, without waiting for React to re-render.
 */
export function startGuestSession() {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${GUEST_COOKIE}=1; Path=/; Max-Age=${GUEST_MAX_AGE}; SameSite=Lax${secure}`;
  document.documentElement.setAttribute('data-guest', '');
}

/** Browser only. */
export function endGuestSession() {
  document.cookie = `${GUEST_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.documentElement.removeAttribute('data-guest');
}

/**
 * Inline script for the root layout: marks <html> as a guest view before
 * first paint, so the prerendered vote/favorite/comment controls never flash
 * on screen for a guest. Kept beside the cookie name so the two cannot drift.
 */
export const GUEST_INIT_SCRIPT = `(function(){try{if(document.cookie.split(';').some(function(c){return c.trim()==='${GUEST_COOKIE}=1';}))document.documentElement.setAttribute('data-guest','');}catch(e){}})();`;
