# TODO

## Next session plan

**Phase 1 is complete and awaiting review.** Fetch runs end to end against all eight categories and five sources; 983 raw records in 86s on a live 35-day window (2026-07-09 → 2026-08-13), zero failed sources, 47/47 tests green, lint clean, `next build` static.

**Query precision pass done (2026-08-13).** Reviewed and asked to weight toward mammalian cell culture. Shipped: the original anchor terms plus a title-only exclusion of off-target expression systems, and an `EXPRESSION SYSTEM` weighting block on all six science rubrics. 983 → 950 records, 51 microbial papers removed, known-good PAT/modelling work retained. Two earlier attempts over-filtered and are documented in Status_update.md — read that before widening these queries again.

Before starting Phase 2 (normalize / dedupe / score), three tuning questions want an answer — all visible in the Phase 1 counts and none of them blocking:

1. **arXiv returned 2 records in 35 days.** The three configured categories (`stat.ML`, `eess.SY`, `q-bio.QM`) intersected with bioprocess abstract terms is a very narrow net; a lot of hybrid-modelling work posts to `cs.LG` or `math.OC` instead. Widen the category list, loosen the terms, or accept that arXiv is a low-yield/high-signal source?
2. **`cmc_reg` and `industry` pull RSS unfiltered** (104 and 84 items). That is the design — the brief says these categories lean on RSS and the relevance gate sorts it out — but together they are ~19% of the scoring volume. Phase 2's kept/dropped table will show whether a pre-filter earns its keep.
3. **Endpoints News is disabled.** It serves its public feed to browser user-agents and returns 403 to ours. Reading it would mean misrepresenting the client, so it is off by default — your call whether to flip it.

Then Phase 2 proper: normalize, dedupe (identity + fuzzy title), the ledger, the provider abstraction, and the scoring gate — delivering a kept/dropped table per category and a Haiku-vs-Groq comparison on the same month.

## Backlog

- [ ] **Phase 2** — normalize, dedupe, ledger, provider abstraction, scoring gate (see PLAN.md §6)
- [ ] **Phase 3** — summarize, synthesize, write month JSON + ledger + `run_stats`
- [ ] **Phase 4** — Actions workflow with `workflow_dispatch`, dry-run input, failure issue
- [ ] **Phase 5** — `/digest` and `/digest/[month]` pages, README how-tos
- [ ] Decide whether to keep `biorxiv.mode: 'europepmc-ppr'` (current default) or switch to `'api'` — see PLAN.md §11.1; the Europe PMC route returned 30 preprints across four categories with one request each
- [ ] `NCBI_API_KEY` is unset, so PubMed runs at the unkeyed 3 req/s. Supplying one cuts fetch wall time materially (PubMed is the slowest source at ~4s/category)
- [ ] Optional: a `STYLE_GUIDE.md` for the token set in `app/globals.css`, once a real design pass happens
- [ ] Optional: custom domain on Vercel

## Done (sweep to Status_update.md when this section outgrows the backlog)

- [x] Repo scaffolding ported from TrendTracker: package.json, eslint/jsconfig/next config, app shell, design tokens (2026-08-13)
- [x] `lib/digest.js` + `lib/digestDir.js` read layer, month-keyed (2026-08-13)
- [x] `config/digest.config.js`: eight categories with scope rubrics, per-source queries and overrides, feed list, per-stage model+rate table (2026-08-13)
- [x] Hand-rolled config validation with path-pointing error messages (2026-08-13)
- [x] Six adapters — PubMed, Europe PMC, bioRxiv, arXiv, Crossref, RSS — behind one interface, failing soft into `source_health` (2026-08-13)
- [x] Token-bucket throttling with per-host registry; NCBI keyed/unkeyed rate selection (2026-08-13)
- [x] Date-window precedence: `--since` → `--month` → last committed run → 35 days (2026-08-13)
- [x] `scripts/digest.mjs` CLI with stage/category/source filters and a count-grid summary (2026-08-13)
- [x] 47 tests over recorded fixtures; no network or LLM calls (2026-08-13)
- [x] Verified all five RSS feed URLs live; fixed BPI and FDA, disabled Endpoints (2026-08-13)
