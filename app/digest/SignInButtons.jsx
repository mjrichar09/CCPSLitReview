'use client';

import { useSession } from './SessionProvider.jsx';

/**
 * The sign-in choices, in one place so the page chrome and the comment CTA
 * cannot drift apart on which providers exist.
 *
 * Google first: it is the account this readership actually has. GitHub second,
 * for those who would rather not hand over a Google identity.
 */
export default function SignInButtons({ compact = false }) {
  const { signIn } = useSession();

  return (
    <span className={compact ? 'signin-group signin-group-compact' : 'signin-group'}>
      <button type="button" className="signin" onClick={() => signIn('google')}>
        Sign in with Google
      </button>
      <button type="button" className="signin" onClick={() => signIn('github')}>
        GitHub
      </button>
    </span>
  );
}
