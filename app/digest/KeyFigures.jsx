import { figuresFor } from '../../lib/keyFigures.js';

/**
 * The paper's headline numbers as chips on the collapsed card, so a reader
 * can skim without expanding. See lib/keyFigures.js for where they come from
 * and why every number in one is guaranteed to be in the source text.
 */
export default function KeyFigures({ item }) {
  const figures = figuresFor(item);
  if (figures.length === 0) return null;
  return (
    <ul className="key-figures" aria-label="Key figures">
      {figures.map((f) => (
        <li key={f} className="key-figure">
          {f.replace(/\bR2\b/, 'R²')}
        </li>
      ))}
    </ul>
  );
}
