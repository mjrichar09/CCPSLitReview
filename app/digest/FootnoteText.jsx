/**
 * Renders synthesize.js's prose with its inline "[1]"-style footnote markers
 * turned into links back to the paper they cite, resolved through
 * `resolveHref(id)`.
 *
 * Deliberately not validated upstream (synthesize.js, finalize-routine-output.mjs):
 * a marker whose `references` entry names an id `resolveHref` doesn't
 * recognise — a fabrication, or a real id just out of this component's scope
 * (a category narrative citing an item from a different category, say) —
 * renders as plain "[1]" text instead of a broken link. That is the graceful
 * degradation this app uses everywhere else a model claim might not check
 * out (the Top-5 guard in synthesize.js is the same posture), not a build-
 * or render-time failure over what is, after all, a citation in prose.
 */
export default function FootnoteText({ text, references, resolveHref, className }) {
  const byMarker = new Map((references ?? []).map((r) => [r.marker, r.id]));
  const parts = String(text ?? '').split(/(\[\d+\])/g);

  return (
    <p className={className}>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return part;
        const id = byMarker.get(Number(m[1]));
        const href = id ? resolveHref(id) : null;
        if (!href) return part;
        return (
          <a key={i} href={href} className="footnote-ref">
            {part}
          </a>
        );
      })}
    </p>
  );
}
