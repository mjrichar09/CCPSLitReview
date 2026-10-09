/**
 * Key figures: the two or three numbers that let a reader skim a paper
 * without expanding it ("R² 0.991", "1.6-7.4-fold", "titer 8.2 g/L").
 *
 * Two sources, in order of preference:
 *
 *   1. `item.key_figures`, picked by the model that writes the summary
 *      (routine or API path) from months written after this field existed.
 *      `cleanKeyFigures` filters them on the way into the report: every
 *      number in a figure must appear in the paper's own text, so a figure
 *      cannot be invented even if the model tries.
 *
 *   2. `extractKeyFigures(summary)`, a conservative pattern match for the
 *      months written before. Months are append-only, so those cannot be
 *      regenerated; this reads the already-published summary instead. It
 *      only ever lifts text that is in the summary, so it can miss a figure
 *      but cannot make one up.
 *
 * Browser-safe and pure.
 */

const MAX = 3;
const MAX_LEN = 32;

const numbers = (s) => (String(s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''));

/**
 * Keep at most three short figures whose every number appears in `sourceText`
 * (the abstract plus the summary). Anything else is dropped, not repaired.
 */
export function cleanKeyFigures(list, sourceText = '') {
  if (!Array.isArray(list)) return [];
  const source = String(sourceText).replace(/,/g, '');
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const f = raw.replace(/\s+/g, ' ').trim();
    if (!f || f.length > MAX_LEN) continue;
    const nums = numbers(f);
    if (nums.length === 0) continue;
    if (!nums.every((n) => source.includes(n))) continue;
    if (out.some((o) => o.toLowerCase() === f.toLowerCase())) continue;
    out.push(f);
    if (out.length === MAX) break;
  }
  return out;
}

const NUM = String.raw`\d+(?:[.,]\d+)*`;

const METRIC = {
  titer: 'Titer',
  titre: 'Titer',
  yield: 'Yield',
  productivity: 'Productivity',
  qp: 'qP',
  vcd: 'VCD',
};

// Each pattern turns one kind of match into a short label. Order is priority:
// model-fit numbers first (they are the headline of a methods paper), then
// fold changes, then labelled process outcomes, then manufacturing scale.
const PATTERNS = [
  {
    re: new RegExp(String.raw`\bR(?:2|²|\^2)\s*(?:=|of|:|was|reached)?\s*(0?\.\d+|1\.0+)\b`, 'i'),
    label: (m) => `R² ${m[1]}`,
  },
  {
    re: new RegExp(String.raw`\b(RMSEP?|NRMSE|MAE)\s*(?:=|of|:|was)?\s*(${NUM}\s*(?:g/L|mg/L|mM|%)?)`),
    label: (m) => `${m[1]} ${m[2].trim()}`,
  },
  {
    re: new RegExp(String.raw`(${NUM}(?:-${NUM})?)-fold\b`),
    label: (m) => `${m[1]}-fold`,
  },
  {
    re: new RegExp(
      String.raw`\b(titer|titre|yield|productivity|qP|VCD)\b[^.;,]{0,25}?(${NUM}\s*(?:g/L|mg/L|pg/cell/day))`,
      'i',
    ),
    // Absolute units only, and no comma or sentence break between the metric
    // and its number. Percentages were tried and dropped: checked against the
    // published summaries, "VCD 31%" was a 31% loss in growth rate, "qP
    // 190.36%" belonged to volumetric productivity, and "viability 80%" was
    // 80% reduced serum. A chip that is wrong is worse than no chip.
    label: (m) => `${METRIC[m[1].toLowerCase()]} ${m[2].trim()}`,
  },
  {
    re: new RegExp(String.raw`\b(${NUM})\s*-?\s*L\b(?!/)`),
    label: (m) => (Number(m[1].replace(/,/g, '')) >= 50 ? `${m[1]} L scale` : null),
  },
];

export function extractKeyFigures(summary) {
  const text = String(summary ?? '');
  const out = [];
  for (const { re, label } of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const f = label(m);
    if (f && f.length <= MAX_LEN && !out.includes(f)) out.push(f);
    if (out.length === MAX) break;
  }
  return out;
}

/** What the card shows: the model's figures when the month has them, else the extracted ones. */
export function figuresFor(item) {
  if (Array.isArray(item?.key_figures)) return item.key_figures.slice(0, MAX);
  return extractKeyFigures(item?.summary);
}
