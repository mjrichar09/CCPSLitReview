# TODO

## Next session plan

**Phase 2 and Phase 4 are done and verified against a live run.** The scoring gate has now executed for real in Actions: 1298 raw → 754 unique → 1039 judgements → 180 kept, in 4m57s for $0.64. See Status_update.md for the per-category table and the verdict spot-check. 87 tests green, lint clean.

**Phase 3 is next**: summarize, synthesize, and the month writer. The inputs are settled — `staging/<month>/scored.json` is the contract, `max_items` trims 180 keeps down to 111 category slots (128 distinct papers), and `is_recurring` is already defined in `lib/util/ledger.js`.

**Scoring provider is settled: Haiku.** The Groq side-by-side could not be run — the free-tier account caps `gpt-oss-120b` at 8000 TPM and one batch needs 11305. Not a tuning problem; revisiting means upgrading the Groq plan, for a saving of roughly $0.55/month. The `score_model` / `batch_size` inputs remain if that changes.

**Caps are settled** — reviewed against the live numbers and kept as they are. Six of eleven categories score over cap (`cmc_reg` 31 vs 10, `industry` 28 vs 10, `upstream_pd` 23 vs 12, `product_quality` 23 vs 12, `modeling_ml` 22 vs 15, `harvest_dsp` 11 vs 10); the write stage trims to the cap by relevance, which is the intended behaviour rather than a problem to fix.

One one-click item still outstanding:

- **Set the repo default branch to `main`** (Settings → General → Default branch). `main` and `claude/plan-review-repo-setup-8ikgmv` now point at the same commit, so this is a no-op switch — but until it is made, the workflow runs and uploads without ever committing a report, by design.

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
