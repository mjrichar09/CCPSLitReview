import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page-wide">
      <h1 className="report-title">No digest for that month</h1>
      <p className="report-summary">
        Months are only published once the pipeline has run for them.{' '}
        <Link href="/digest">See the latest month</Link>.
      </p>
    </div>
  );
}
