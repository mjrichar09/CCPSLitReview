import { isMemberOnlyPath } from './guest.js';

/**
 * The actual access decision for proxy.js, kept in its own module with no
 * Next.js or Supabase imports so it is testable with plain values — no real
 * cookies, no network, no NextRequest, and importable from plain `node
 * --test` the way the rest of this repo's logic is. `next/server` cannot be
 * resolved outside Next's own build/runtime, so anything that imports it
 * (proxy.js itself) can't be unit tested directly.
 *
 * An approved reader gets everything. A guest (see lib/guest.js) gets the
 * digest content but not the member-only pages, and does so even when
 * Supabase is unconfigured: the guest view is public by design, so there is
 * no misconfiguration for it to fail closed against. Everyone else is sent
 * to the landing page.
 */
export function admits({ configured, user, approved, guest = false, pathname = '/digest' }) {
  if (configured && user && approved) return true;
  return Boolean(guest) && !isMemberOnlyPath(pathname);
}
