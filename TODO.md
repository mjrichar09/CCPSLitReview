# TODO

## Next session plan

**Phase 2 is built and awaiting review.** Normalize, dedupe, ledger, provider abstraction and the scoring gate are done; 82 tests green, lint clean. Eleven categories after adding `htpd_automation`.

On a live 35-day window: **1278 raw → 734 unique → 734 kept** (544 collapsed on identifier, 0 on title — verified genuine, see Status_update.md). Provenance after dedupe: europepmc 535, pubmed 249, rss 94, biorxiv 41, arxiv 4. 214 items carry more than one category; 719/734 have an abstract.

**The one thing blocking completion of Phase 2: `ANTHROPIC_API_KEY`.** Scoring is written and unit-tested against a stub provider but has never run live. With a key in `.env.local` the next step is a single command:

```
npm run digest -- --stage score --since 2026-07-09 --dry-run
```

which produces the kept/dropped table per category with rationales, plus the real cost table — the deliverable Phase 2 owes you. Add `GROQ_API_KEY` too and the same month can be scored on both for the side-by-side.

Also still open:

1. **Set the repo's default branch to `main`** (Settings → General → Default branch). Phase 4's workflow commits to the default branch.
2. **`NCBI_API_KEY`** (optional) — lifts PubMed from 3 to 10 req/s.
3. **Unfiltered RSS on `cmc_reg`/`industry`** (225 + 94 after dedupe, ~43% of the corpus) stays by design; the kept/dropped table decides whether a pre-filter earns its keep.

## Backlog

- [ ] **Phase 2 — finish**: run the scoring gate live once `ANTHROPIC_API_KEY` exists, and deliver the kept/dropped table plus the Haiku-vs-Groq comparison
- [ ] **Phase 3** — summarize, synthesize, write month JSON + ledger + `run_stats`
- [ ] **Phase 4** — Actions workflow with `workflow_dispatch`, dry-run input, failure issue
- [ ] **Phase 5** — `/digest` and `/digest/[month]` pages, README how-tos
- [ ] Decide whether to keep `biorxiv.mode: 'europepmc-ppr'` (current default) or switch to `'api'` — see PLAN.md §11.1; the Europe PMC route returned 30 preprints across four categories with one request each
- [ ] `NCBI_API_KEY` is unset, so PubMed runs at the unkeyed 3 req/s. Supplying one cuts fetch wall time materially (PubMed is the slowest source at ~4s/category)
- [ ] Optional: a `STYLE_GUIDE.md` for the token set in `app/globals.css`, once a real design pass happens
- [ ] Optional: custom domain on Vercel

## Done (sweep to Status_update.md when this section outgrows the backlog)

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
