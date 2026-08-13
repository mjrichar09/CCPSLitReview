# TODO

## Next session plan

**Phase 1 is complete and awaiting review.** Fetch runs end to end against ten categories and five sources; 1170 raw records in 111s on a live 35-day window (2026-07-09 → 2026-08-13), zero degraded sources, 47/47 tests green, lint clean, `next build` static.

**Search expanded (2026-08-13).** Ten categories now: added `cell_line_dev` and `product_quality`. arXiv widened to cs.LG/math.OC (yield 2 → 4; genuinely low volume, not a config fault). Endpoints replaced with BioPharma Dive + Cell Culture Dish after its feed proved unreadable and the Google News route proved stale. Fixed a self-inflicted FDA rate-limit via a per-run feed cache. 1170 records, zero degraded.

**Query precision pass done (2026-08-13).** Reviewed and asked to weight toward mammalian cell culture. Shipped: the original anchor terms plus a title-only exclusion of off-target expression systems, and an `EXPRESSION SYSTEM` weighting block on all six science rubrics. 983 → 950 records, 51 microbial papers removed, known-good PAT/modelling work retained. Two earlier attempts over-filtered and are documented in Status_update.md — read that before widening these queries again.

Before starting Phase 2 (normalize / dedupe / score), what is left from the review:

1. **`ANTHROPIC_API_KEY`** in GitHub Actions secrets and `.env.local` — needed for the scoring half of Phase 2. Normalize/dedupe/ledger need no key and can be built first. **Not Vercel** — the deployed app makes no external calls and needs no keys.
2. **Set the repo's default branch to `main`** (Settings → General → Default branch). `main` exists and carries everything, but the default still points at the old feature branch, and Phase 4's workflow commits to the default branch.
3. **`NCBI_API_KEY`** (optional) — lifts PubMed from 3 to 10 req/s; it is the slowest source.
4. **Unfiltered RSS on `cmc_reg`/`industry`** (114 + 94) stays as-is by design; Phase 2's kept/dropped table decides whether a pre-filter earns its keep.

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
