import { createClient } from '@supabase/supabase-js';

/**
 * The pipeline's own Supabase client — Node/Actions context, not the browser.
 *
 * Distinct from `lib/supabase/client.js` (browser-only, `NEXT_PUBLIC_*` env
 * vars, which Next inlines into client bundles): this reads plain
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` so the Actions secrets stay separate
 * from what ships to the browser. A plain anon-key client is enough — the
 * only thing this reads is `vote_tallies`, which already has a public select
 * policy — so no service-role key or RLS bypass is needed here.
 */

export function isSupabaseServerConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

export function getSupabaseServer({ env = process.env } = {}) {
  if (!isSupabaseServerConfigured(env)) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
