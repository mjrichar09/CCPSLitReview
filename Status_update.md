# Status updates

## 2026-08-13 (later) — Query precision pass: weight toward mammalian cell culture

User reviewed the Phase 1 sample, accepted the overall noise level as expected for a first query design, and asked for one change: select more heavily for mammalian cell culture.

**Three attempts, measured against the same window each time. The first two made it worse, and the diffs are why:**

1. **Anchor restricted to mammalian terms only.** Dropped 386 of 517 science-category records. An automated check said "zero false drops", but that check only flagged items *naming* a mammalian system — reading the dropped titles showed it had discarded genuinely relevant organism-agnostic methods work ("Raman-guided sample subset selection… in bioprocesses", "Machine Learning-Enabled Raman Spectroscopy for PAT and Real-Time Release Testing"). The metric was blind to the failure it was supposed to catch.
2. **Two-tier: mammalian terms OR organism-clean generic terms**, with the mammalian vocabulary widened (HEK293, Vero, hybridoma, ADC, therapeutic protein) to compensate. Worse. Those terms are ubiquitous in clinical literature, so it imported cancer imaging, photoimmunotherapy, quantum dots, and Alzheimer's work. Adding `yeast` to the exclusion on an abstract match also killed real PAT papers, since bioprocess methods papers mention yeast in passing constantly.
3. **What shipped: the original anchor term list, untouched, plus a title-only exclusion** of off-target expression systems. Removes 51 records — all microbial (E. coli pathway engineering, Komagataella, Corynebacterium, 2'-fucosyllactose, methanol valorization) — and adds 7 of the same low-grade noise that already existed. All three known-good PAT/modelling papers retained. 983 → 950 records.

**The general lesson, recorded because it will recur when the queries are refined again:** widening the inclusion list is how this goes wrong. Every term added to reach one more relevant paper reaches a whole clinical literature that shares the vocabulary. Precision belongs in the exclusion (title-only, so a passing mention is harmless) and in the rubric.

**Weighting moved to where it belongs.** The fetch anchor stays broad enough to keep methods work; the mammalian preference is now an `EXPRESSION SYSTEM` block appended to all six science-category rubrics — full value for CHO/HEK293/NS0/hybridoma, 0 for microbial/algal/plant/insect unless the abstract shows the method transfers, and organism-agnostic work judged on whether an upstream CHO group could apply it. A model can read an abstract and judge transferability; a query can only match strings. `cmc_reg` and `industry` are not organism-scoped and keep their own rubrics.

**Still unanswered from the review**: arXiv breadth, whether to pre-filter the unfiltered `cmc_reg`/`industry` RSS pull, Endpoints on/off, the missing `main` branch, and keys.

## 2026-08-13 — Repo bootstrapped from TrendTracker; Phase 1 (fetch) complete

Started from an empty repo. Reviewed [TrendTracker](https://github.com/mjrichar09/TrendTracker) as the reference implementation, wrote PLAN.md, got approval, built Phase 1.

- **What ported from TrendTracker, and what didn't.** Its `lib/reports.js` read module is almost exactly the three-function shape this brief specifies, so `getAllWeeks/getReport/getLatest` became `getAllMonths/...` with no logic change beyond `YYYY-MM-DD` → `YYYY-MM`. Also ported: `reportsDir.js`, `writeReport.js`'s validate/mkdir/pretty-print shape, the `app/reports/` page structure (kept for Phase 5), all the project scaffolding, the design tokens, and the CLAUDE.md document-map convention. Not ported: tickers, tracker, fib strips, quotes, the Alpha Vantage and GDocs scripts, and `app/api/quote/route.js` — this brief forbids API routes outright.
- **Two structural findings from the reference.** TrendTracker has **no `.github/workflows`** — its "routine" is a Claude Code cloud routine, so this project's Actions requirement is a deliberate departure, not an imitation. And its CLAUDE.md documents a real incident: routine runs commit to `claude/*` session branches, Vercel only builds `main`, and two weekly reports were written but never deployed. Committing straight to the default branch is why the Actions design can't repeat that; it's now an invariant in CLAUDE.md.
- **One deliberate inversion, recorded so it doesn't read as a porting bug.** TrendTracker's CLAUDE.md says of `writeReport`: *"Writing a week overwrites its file… Don't 'fix' this into append/versioning."* This brief requires append-only months unless `--force`. Following the brief.
- **Priced the inference question before building it.** Groq's rates are real ($0.15/$0.60 per MTok for `gpt-oss-120b` vs Haiku 4.5's $1/$5), but a month of this pipeline runs about **$1.65 on Anthropic** — scoring is $0.38 of that. Moving scoring to Groq saves ~$4/year, so the choice is a quality decision, not a cost one. Replaced the single global `generator` key with a **per-stage** provider+model+rate table so either can be picked per stage, and deferred the decision to Phase 2 measurements.
- **Phase 1 shipped**: eight categories with scope rubrics and per-source queries, six adapters behind one fail-soft interface, token-bucket throttling, date-window precedence, a CLI with stage/category/source filters, and 47 tests over recorded fixtures. Lint clean, `next build` static.
- **Live run**: 983 raw records in 86s over 2026-07-09 → 2026-08-13, zero failed sources. Europe PMC 466, PubMed 280, RSS 205, bioRxiv 30, arXiv 2. 529 unique DOIs; 959/983 carry an abstract; Crossref patched 415 records from 374 DOI lookups.

**Three defects found and fixed during the build, two of them the silent kind:**

- **The limiter's refill timer was `unref`'d**, so when every queued job was waiting on a token and nothing else held the event loop open, Node exited **with code 0 and partial results** — the first full run silently produced 24 of 25 jobs and no output at all. Removed the unref (the timer is never armed once the queue drains, so it can't outlive the work) and added a regression test that fails as a timeout rather than as a quietly short digest.
- **PubMed inline markup was silently dropping words.** `<i>CHO</i>` inside a title parsed into `#text` plus a sibling node, losing the ordering, so "control of CHO fed-batch" came back as "control offed-batch". Inline tags are now stripped from the raw XML before parsing. A fixture test caught this.
- Crossref reported `enriched 415/374`, which read like a bug: one DOI can back several records, so enriched legitimately exceeds lookups. Reworded rather than "fixed".

**Feed URLs verified live.** BioProcess International's was 404 (`/feed/` → `/rss.xml`) and the FDA one was a landing page, not a feed (the real one is under `/about-fda/contact-fda/stay-informed/rss-feeds/biologics/rss.xml`). Both fixed. Endpoints News returns 403 to our user-agent but 200 to a browser's — that's bot filtering on a public feed, and reading it would mean misrepresenting the client, so it ships disabled with a note. Notably, the two broken feeds were found *because* the fail-soft design surfaced them as `degraded` in `source_health` instead of throwing.

**Environment gotcha worth remembering.** The FDA feed 401'd from Node but 200'd from curl, through every header combination. Cause: Node's `fetch` ignores `HTTPS_PROXY`, so it took the direct path and got blocked. `NODE_USE_ENV_PROXY=1` fixes it and is now set in the npm scripts — a no-op where no proxy exists, including Actions. Use `npm run fetch`, not bare `node scripts/digest.mjs`.

**Open at session end**: Phase 1 awaits review. Three tuning questions carried into TODO.md — arXiv's 2-record yield, the unfiltered RSS volume on `cmc_reg`/`industry`, and whether to enable Endpoints.
