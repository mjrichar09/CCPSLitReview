# TODO

## Next session plan

**Phases 1–4 are done and the first month is committed.** `data/digest/2026-08.json` holds 79 papers across 11 categories (112 slots), a Top 5, and an editorial overview, with the ledger seeded at 79 entries. 112 tests, lint clean.

The month cost **$2.34** — score $0.65 (Haiku), summarize $0.80 and synthesize $0.89 (Opus), 75 calls, 8m30s end to end. Against the $2.50 estimate that is within 7%, though the split was wrong: summarize and synthesize came in roughly equal rather than summarize dominating.

**Phase 5 is next**: `/digest` and `/digest/[month]`. No API spend at all — the pages read the committed JSON at build time.

Two things to look at when reviewing the report:

1. **One corrupt sentence in `cmc_reg`.** The synthesis reads "…20.3-day average approval ahead of goal date o you gets filed for a soft sensor…". A dash escape ate the surrounding words; whitespace was repairable, the words were not. The cause is fixed for future months (prompts ask for plain ASCII, `tidyStrings` repairs and now warns), but this month's sentence can only be corrected by regenerating that one narrative.
2. **31 of 112 slots (28%) are flagged `thin_abstract`** — mostly RSS-fed `cmc_reg`/`industry`, where items are headlines rather than abstracts. The model is correctly refusing to invent findings. Decide whether to surface the flag in the UI, drop thin items below a length threshold before summarising, or accept it as the cost of trade-press coverage.

Output tweaks can be tried against the committed month cheaply: the staging artifacts make `--stage synthesize --fresh` a synthesis-only re-run, no re-fetch and no re-score.

## Backlog

- [ ] **Phase 3** — summarize, synthesize, write month JSON + ledger + `run_stats`
- [ ] **Phase 5** — `/digest` and `/digest/[month]` pages, README how-tos
- [ ] Decide whether to keep `biorxiv.mode: 'europepmc-ppr'` (current default) or switch to `'api'` — see PLAN.md §11.1; the Europe PMC route returned 30 preprints across four categories with one request each
- [ ] `NCBI_API_KEY` is unset, so PubMed runs at the unkeyed 3 req/s. Supplying one cuts fetch wall time materially (PubMed is the slowest source at ~4s/category)
- [ ] Optional: a `STYLE_GUIDE.md` for the token set in `app/globals.css`, once a real design pass happens
- [ ] Optional: custom domain on Vercel

## Done (sweep to Status_update.md when this section outgrows the backlog)

- [x] Groq side-by-side attempted and closed out — blocked by an 8000 TPM account cap, not by code (2026-08-14)
- [x] Three defects found via the Groq attempts: batch-size override, HTTP error bodies now logged, reasoning-token budget at the provider (2026-08-14)
- [x] Phase 4: Actions workflow (schedule + dispatch, default-branch commit guard, failure issue) and CI (2026-08-13)
- [x] Live scoring run in Actions — 180 kept of 1039 judged, $0.64, 4m57s (2026-08-13)
- [x] Score batches concurrently; the sequential stage did not fit a 45-minute job (2026-08-13)
- [x] Phase 2 build: dedupe (identifier + title), ledger with year sharding, per-stage provider abstraction, usage/cost accounting, scoring gate with batching and a strict-JSON contract (2026-08-13)
- [x] `htpd_automation` category — eleven categories total (2026-08-13)

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
