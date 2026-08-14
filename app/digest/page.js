import { getAllMonths, getLatest } from '../../lib/digest.js';
import Report from './Report.jsx';

export const metadata = {
  title: 'Bioprocess Digest',
};

/**
 * The latest month. Static: the JSON is read at build time, and a new commit
 * from the Actions job is what triggers the rebuild that publishes a new month.
 */
export default async function DigestPage() {
  const [report, months] = await Promise.all([getLatest(), getAllMonths()]);

  if (!report) {
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

  return <Report report={report} months={months} current={report.month_of.slice(0, 7)} />;
}
