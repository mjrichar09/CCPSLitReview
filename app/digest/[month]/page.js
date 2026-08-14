import { notFound } from 'next/navigation';
import { getAllMonths, getReport } from '../../../lib/digest.js';
import Report from '../Report.jsx';

/**
 * Every committed month is prerendered, and only those.
 *
 * `dynamicParams = false` makes an unknown month a build-time 404 rather than an
 * attempted render on the server — which matters here because Vercel's runtime
 * filesystem is read-only and ephemeral, so a runtime read would fail anyway.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const months = await getAllMonths();
  return months.map((month) => ({ month }));
}

export async function generateMetadata({ params }) {
  const { month } = await params;
  return { title: `Bioprocess Digest — ${month}` };
}

export default async function MonthPage({ params }) {
  const { month } = await params;
  const [report, months] = await Promise.all([getReport(month), getAllMonths()]);
  if (!report) notFound();

  return <Report report={report} months={months} current={month} />;
}
