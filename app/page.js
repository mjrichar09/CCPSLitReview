import SessionProvider from './digest/SessionProvider.jsx';
import LandingGate from './LandingGate.jsx';

export const metadata = {
  title: 'Cell Culture Literature Review',
  description:
    'Monthly digest of bioprocessing literature, preprints, regulatory sources, and trade press — for approved readers.',
};

/**
 * The front door. `middleware.js` is the actual gate — this page is what a
 * blocked visitor (or anyone landing on the bare domain) sees: sign in, or,
 * if already signed in, wait for approval. `SessionProvider` is wrapped here
 * rather than in the root layout because this page sits outside
 * `/digest/**`, which has its own copy in `app/digest/layout.js`.
 */
export default function Home() {
  return (
    <SessionProvider>
      <LandingGate />
    </SessionProvider>
  );
}
