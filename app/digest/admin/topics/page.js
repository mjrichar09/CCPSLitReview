import SiteHeader from '../../SiteHeader.jsx';
import TopicEditor from '../TopicEditor.jsx';
import topicsDoc from '../../../../config/topics.json' with { type: 'json' };

export const metadata = {
  title: 'Topics and feeds — Cell Culture Literature Review',
};

/**
 * What the digest covers, edited from the site. Same shell as the other
 * non-month pages (SiteHeader, then `.layout`).
 *
 * Prerendered with the committed config/topics.json, which is the config the
 * deployed months were built with; the editor then checks Supabase for a
 * newer saved version after hydration. Any approved reader can look; only an
 * admin can save, and Postgres enforces that, not this page. Guests are kept
 * off it by proxy.js (lib/guest.js MEMBER_ONLY_PATHS).
 */
export default function TopicsAdminPage() {
  return (
    <>
      <SiteHeader />
      <div className="layout">
        <h1 className="report-title">Topics and feeds</h1>
        <p className="report-summary">
          What the monthly run searches for, how each paper is scored, and which news feeds it reads. Changes saved
          here apply from the next monthly run.
        </p>
        <TopicEditor initialDoc={topicsDoc} />
        <footer className="site-credit">Created by Mark Richards. All Rights Reserved.</footer>
      </div>
    </>
  );
}
