# Deck generator

`build-deck.js` generates `../ccpslitreview-deck.pptx` — the 17-slide overview
talk drawn from `../presentation-outline.md`. Edit the script rather than the
`.pptx` so the deck stays reproducible.

```bash
npm install pptxgenjs   # not a project dependency; install it ad hoc
node build-deck.js
```

The outline is the long form (war stories, Q&A prep, the deep-dive material
that did not make the slides). The deck is the overview cut.
