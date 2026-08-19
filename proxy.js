import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { admits } from './lib/accessGate.js';

/**
 * The real access gate: every /digest/** request is checked here, at the
 * edge, before any content is served. A visitor with no session, or a
 * signed-in reader who is not yet approved, never receives the page —
 * unlike the reader-feedback features (votes, comments, favorites, ...),
 * which are optional add-ons that fail soft with no Supabase configured,
 * this is access control, so the failure mode is inverted: no Supabase
 * configuration means fail CLOSED (block everyone) rather than fail open.
 * A misconfigured deployment must never silently become a public one.
 *
 * `profiles.approved` isn't part of the session/JWT, so this costs one
 * extra query per request — reading the visitor's own profile row, which
 * `profiles_select_approved`'s RLS policy already allows (`id = auth.uid()`
 * is always true for your own row, approved or not). Negligible for this
 * site's traffic.
 */
export async function proxy(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && key);
  if (!configured) return blocked(request);

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates against Supabase Auth rather than trusting a
  // possibly-stale cookie, which is what a gate actually needs — getSession()
  // is fine for the browser's own UI state, not for an access decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let approved = false;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('approved').eq('id', user.id).maybeSingle();
    approved = Boolean(profile?.approved);
  }

  if (!admits({ configured, user, approved })) return blocked(request, response);
  return response;
}

/** Send an unauthorized/unapproved visitor to the landing page, remembering where they were headed. */
function blocked(request, response) {
  const target = request.nextUrl.clone();
  target.pathname = '/';
  target.search = '';
  target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);

  const redirect = NextResponse.redirect(target);
  response?.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
  return redirect;
}

export const config = {
  matcher: ['/digest/:path*'],
};
