'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useSession } from './digest/SessionProvider.jsx';
import SignInButtons from './digest/SignInButtons.jsx';
import ThemeToggle from './digest/ThemeToggle.jsx';

/**
 * Only ever redirect back into the digest, never wherever `?next=` happens
 * to say — otherwise the query param itself would be an open redirect.
 */
function safeNext(raw) {
  return raw && raw.startsWith('/digest/') ? raw : '/digest';
}

function LandingGateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enabled, ready, user, profile, approved, signOut } = useSession();

  // The middleware gate is what actually protects /digest/**; this is just
  // the convenience of not making an already-approved reader click through
  // manually every time they land here.
  useEffect(() => {
    if (ready && user && approved) {
      router.replace(safeNext(searchParams.get('next')));
    }
  }, [ready, user, approved, router, searchParams]);

  return (
    <div className="landing">
      <div className="landing-theme">
        <ThemeToggle />
      </div>
      <div className="landing-card">
        {/* The source art is 96x96 — shown at its native size here rather
            than the header's 32px so the mark actually reads as a logo,
            not an icon. */}
        <Image src="/logo.png" alt="" width={96} height={96} className="landing-logo" priority />
        <h1 className="landing-title">Cell Culture Literature Review</h1>
        <p className="landing-tagline">
          A monthly digest of upstream CHO process development literature, preprints, regulatory
          notices, and trade press — searched, filtered, and summarised for one reader at a time.
        </p>

        {!enabled && <p className="landing-note">Sign-in isn&apos;t configured for this deployment yet.</p>}

        {enabled && !ready && <p className="landing-note">Loading…</p>}

        {enabled && ready && !user && (
          <div className="landing-signin">
            <SignInButtons />
          </div>
        )}

        {enabled && ready && user && !approved && (
          <div className="landing-pending">
            <span className="badge badge-recurring">Awaiting approval</span>
            <p>
              Thanks for signing in{profile?.display_name ? `, ${profile.display_name}` : ''}. Your
              account still needs to be approved before you can get in.
            </p>
            <button type="button" className="link-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LandingGate() {
  // useSearchParams() requires a Suspense boundary to keep the page statically
  // prerenderable — the fallback never actually shows in practice, since
  // there is no server data fetch here to be slow.
  return (
    <Suspense fallback={null}>
      <LandingGateInner />
    </Suspense>
  );
}
