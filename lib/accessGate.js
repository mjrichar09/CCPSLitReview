/**
 * The actual access decision for proxy.js, kept in its own module with no
 * Next.js or Supabase imports so it is testable with plain values — no real
 * cookies, no network, no NextRequest, and importable from plain `node
 * --test` the way the rest of this repo's logic is. `next/server` cannot be
 * resolved outside Next's own build/runtime, so anything that imports it
 * (proxy.js itself) can't be unit tested directly.
 */
export function admits({ configured, user, approved }) {
  return Boolean(configured && user && approved);
}
