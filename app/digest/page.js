import { redirect } from 'next/navigation';
import { getAllMonths } from '../../lib/digest.js';

export const metadata = {
  title: 'Bioprocess Digest',
};

/**
 * `/digest` has no content of its own — it always resolves to the latest
 * month's front page. Splitting sections and articles onto their own routes
 * under `[month]/` means there is no single "the digest" page to render here.
 */
export default async function DigestIndex() {
  const months = await getAllMonths();

  if (months.length === 0) {
    return (
      <div className="page-wide">
        <h1 className="report-title">Bioprocess Digest</h1>
        <p className="report-summary">
          No months have been published yet. The digest is generated on the 2nd of each month by the
          GitHub Actions job, which commits the report and triggers a rebuild.
        </p>
      </div>
    );
  }

  redirect(`/digest/${months[0]}`);
}
