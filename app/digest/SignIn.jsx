'use client';

import { useSession } from './SessionProvider.jsx';
import SignInButtons from './SignInButtons.jsx';

/**
 * The account control in the page chrome.
 *
 * Renders nothing at all when Supabase is unconfigured, so a deployment without
 * the feedback feature shows no dead sign-in button.
 */
export default function SignIn() {
  const { enabled, ready, user, profile, approved, signOut } = useSession();

  if (!enabled || !ready) return null;

  if (!user) return <SignInButtons />;

  const name = profile?.display_name ?? user.email ?? 'Signed in';

  return (
    <span className="signin-state">
      <span className="signin-name">{name}</span>
      {!approved && <span className="badge badge-recurring">Awaiting approval</span>}
      <button type="button" className="link-button" onClick={signOut}>
        Sign out
      </button>
    </span>
  );
}
