/**
 * The model's 0-5 relevance score as five pips, filled in the topic's color
 * (inherited `--topic`; neutral ink where none is set). The number stays in
 * the accessible name and the tooltip, so the pips are never the only
 * carrier of the value.
 */
export default function RelevanceMeter({ score }) {
  const value = Math.max(0, Math.min(5, Math.round(Number(score) || 0)));
  const label = `Relevance ${value} of 5`;
  return (
    <span className="relevance-meter" role="img" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? 'pip pip-on' : 'pip'} />
      ))}
    </span>
  );
}
