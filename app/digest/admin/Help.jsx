/**
 * An inline "how does this work" tip: collapsed to one line until asked for,
 * so the editor stays scannable for someone who already knows it.
 */
export default function Help({ title = 'How this works', children }) {
  return (
    <details className="help">
      <summary>
        <span className="help-icon" aria-hidden="true">?</span>
        {title}
      </summary>
      <div className="help-body">{children}</div>
    </details>
  );
}
