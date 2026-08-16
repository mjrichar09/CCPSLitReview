'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * The browser Supabase client — the *only* write path the app itself has.
 *
 * Everything else in this repo reads committed JSON at build time and writes
 * nothing; reader feedback is the exception, and it deliberately does not
 * reintroduce a server. Votes and comments go straight from the browser to
 * Postgres, gated by row-level security. There are still no API routes and no
 * runtime filesystem reads.
 *
 * Two properties this module exists to guarantee:
 *
 * 1. **It never throws.** A missing env var returns null rather than raising,
 *    so `next build` succeeds and the pages render with the feedback widgets
 *    simply absent. The digest is the product; feedback is an addition to it,
 *    and an unconfigured deployment must still serve the month.
 * 2. **It is constructed once.** Multiple clients in one tab means multiple
 *    auth listeners racing over the same stored session.
 */

let client = null;

/** The shared client, or null when Supabase is not configured for this build. */
export function getSupabase() {
  if (client) return client;

  // Referenced statically, not via a computed key: Next inlines NEXT_PUBLIC_*
  // at build time by textual substitution, so a dynamic lookup yields undefined.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  client = createBrowserClient(url, key);
  return client;
}

/** Whether the feedback features should render at all. */
export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
