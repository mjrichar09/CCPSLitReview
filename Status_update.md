# Status updates

## 2026-08-16 (Phase 6) - cross-month memory, reader feedback, public repo

Three things landed: the synthesize stage gained a memory, the site gained approved-account voting and comments, and the repo went public under a proprietary licence.

**Cross-month memory in synthesize.** `lib/util/history.js` reads the last N committed months back through `lib/digest.js` - no new storage, no schema change, months still append-only - and `synthesize.js` threads them into all three prompts: prior narratives per category (oldest first), prior Top-item titles as a tiebreaker, prior overviews so "quieter than last month" has a basis. `config.history.back` defaults to 3; 0 restores the memoryless behaviour exactly.

The substance of that change is the fence, not the plumbing. Given last month's prose a model will manufacture continuity, so every prompt carrying history also carries `CONTINUITY_GUARD`, in the same register as summarize's `thin_abstract` rule. Verified against the committed month: a September run inherits history for all 11 categories, and re-synthesising August sees nothing of itself.

Two corrections to what the plan and TODO claimed:
- **`--fresh` is not synthesis-only.** It bypasses the staging cache for *every* stage in the chain, so `--stage synthesize --fresh` re-fetches and re-scores. The cheap re-run is `--stage synthesize` with `staging/<month>/synthesized.json` removed.
- **The added prompt cost is ~6.2k input tokens per run, not "a few hundred"** (~560 per narrative call across 11, plus ~760 for Top-N and overview), rising to roughly 3x once three months have accumulated. Around $0.03-0.10 at the $5/M Opus input rate - small against $2.34, but not nothing.

The live paid re-run was **not** performed: no API key is present locally and only `scored.json` is committed, so a local re-run would have to re-summarise (~$0.80) as well. The empty-history path is covered by tests; the false-continuity read still needs a human eye on the first month that actually has history behind it.

**Reader feedback, on Supabase.** Thumbs up/down and comments per paper, readable by everyone, writable only by approved accounts. The architectural point: this keeps every existing invariant. Pages stay static, there are still no API routes, and the Actions -> commit -> push path is untouched; the interactive parts are client islands talking to Postgres directly under row-level security. The cost is that tallies are not in the prerendered HTML - they arrive after hydration.

`approved` defaults false and is enforced in Postgres, never in the UI. Verified as three roles by direct SQL, because a UI that hides a button proves nothing: anon insert rejected; unapproved insert rejected; self-promotion to `approved` rejected; voting in another user's name rejected; approved user succeeds. Supabase's advisor found three real issues (a mutable `search_path`, two trigger functions callable as SECURITY DEFINER RPCs). **The first fix did not work**: Postgres grants EXECUTE to PUBLIC by default and the roles inherit it, so revoking from `anon, authenticated` changed nothing and the advisor still flagged all three. Revoking from PUBLIC fixed it.

**Auth is Google + GitHub, deliberately not email/password.** GitHub alone was wrong for a readership that mostly has no GitHub account; email/password would have meant confirmation mail, password resets and an SMTP provider to keep alive, all to arrive at the same `auth.uid()`. Google costs the reader nothing they do not already have. Approval is flipped in the Supabase table editor; there is no admin UI, and no notification when someone signs up.

Three lint errors from React's `set-state-in-effect` rule were real. Both the profile and the per-reader vote map are now stored *with* the user id they were fetched for and derived, rather than cleared by an effect - which also closes a window where one reader's votes could flash under another's session.

**Chrome restructured.** Site title "Cell Culture Literature Review", and a sticky full-bleed header carrying title, archive, account and the section banner. Previously the banner was re-rendered by each page and the archive sat in a sidebar column that scrolled away, so partway down a long section page there was no way to change section or check which month you were in. The banner now derives its active pill from the pathname rather than a prop, since the layout that renders it does not know the category segment. `.item` gained `scroll-margin-top` so a paper deep-linked from the Top 5 does not land underneath the header.

**Repo is public** under a proprietary LICENSE (all rights reserved; source visible for evaluation only). Pre-flight was clean: `.env*` gitignored with only the valueless example tracked, and no key-shaped strings anywhere in the 26-commit history.

**Logo and favicon.** The supplied art needed three changes rather than a copy: it was JPEG (`.jfif`, 358-414 KB), which browsers do not want as a favicon; it carried a white background that would have shown as a white plate around the mark under the dark theme, since JPEG cannot be transparent; and the mark sat in a wide dead margin that would have shrunk it to nothing at header size. So it is trimmed to its bounding box, keyed to alpha with a soft band so the anti-aliased edges do not fringe, and emitted as `app/icon.png` (256), `app/apple-icon.png` (180) and `public/logo.png` (96, served at 3x its 32px rendered size). Checked composited over the dark background, not just on white. Originals are committed under `assets/`.

**The sticky header was never sticky, and the cause was not in the header.** `overflow-x: hidden` on html/body makes them a scroll container, and a sticky element positions against its nearest *scrolling* ancestor rather than the viewport - so `position: sticky` was set correctly and silently inert. `overflow-x: clip` contains overflow the same way without establishing that container. Confirmed in the browser rather than by reading CSS: scrolled 615px, header top stays 0. Two lessons worth keeping: a sticky failure is usually an ancestor's overflow, and this class of bug cannot be verified from markup - it needs a real scroll.

**Footer.** The dollar figure is gone from the page (it is an operating cost of producing the digest, not a reader's concern; still in each report's `run_stats`), the generation date and call count stay, and "Created by Mark Richards. All Rights Reserved." sits in the month layout rather than the front page's Health footer - Health returns null when a month has no source data, which would have taken the credit with it. `.item` scroll-margin-top now clears the 120px header with a gap; flush against the bar read as clipped.

## 2026-08-14 (Phase 3 + first committed month) — summarize, synthesize, write

Built the last three pipeline stages and committed the first real month, `data/digest/2026-08.json`: 79 papers, 11 categories, 112 slots, Top 5, editorial overview, ledger seeded at 79.

**What shapes the code.** `summarize` trims to `max_items` *before* summarising — the overflow has no reader, so paying for it is waste — and summarises each paper once rather than once per category (180 category keeps were 128 distinct papers; two different summaries for one paper in two sections would read as a bug). `synthesize` runs category narratives concurrently, then Top 5 and the overview, which both read the finished narratives; Top-5 ids are constrained to papers that exist and backfilled by relevance, because a hallucinated id would render as a hole in the most prominent section. `write` refuses to overwrite a month without `--force`. `lib/generate/index.js` is the seam PLAN §7 describes, so summarisation can later move off the metered API.

**Cost, measured: $2.34/month.** Score $0.6478 (Haiku, 48 calls), summarize $0.7961 (Opus, 14), synthesize $0.8925 (Opus, 13). 75 calls, 476k in, 103k out, 8m30s. The $2.50 estimate held to 7%, but its internals were wrong — summarize was predicted to dominate at $1.50 and instead roughly tied synthesize.

**Three defects found, two of them mine:**

- **A fabricated measurement, corrected.** The concurrency change in the previous entry was justified with "sequential scoring took 41 minutes and did not fit an Actions job". It did not: the step started 19:53:13 and was cancelled at 19:57:55, i.e. **4m42s**. The 41 minutes came from summing my own `sleep` calls instead of reading GitHub's `started_at`. Measured properly, sequential is ~11 minutes of scoring and fits fine; concurrency takes it to ~3. The speed-up is real, the rescue was not, and an invariant resting on an invented number is worse than no invariant. CLAUDE.md now states the measurement.
- **`--dry-run` discarded paid work.** It skipped every staging write, so when synthesize threw, a completed scoring *and* summarising pass — already billed — could not be reused. Dry-run means "do not publish", not "throw the work away". Staging is now written on every run.
- **Resumed runs under-reported their own cost.** Only `scored.json` carried `run_stats`, so a run resumed from staging recorded what *that process* spent. This month would have been filed as costing $0.89 instead of $2.34. Every artifact now persists its usage rows and `usage.restore()` sums them on resume — proven end to end by this month, which was written from artifacts and still reports the full $2.34.

**A defect in the output itself, only partly fixable.** Writing long prose under a JSON schema, the model emitted dashes as broken escapes. Most cases lost only punctuation (a bare newline mid-sentence, repairable). One did worse: `"goal date \to you gets filed"` in the `cmc_reg` synthesis, where a tab arrived and the surrounding words were destroyed. Whitespace can be smoothed; deleted text cannot be recovered. So `tidyStrings` now repairs *and warns* rather than silently smoothing, the prompts ask for plain ASCII, and this month ships with one visibly broken sentence rather than a quietly plausible one.

**The first month cost nothing extra to commit.** The successful dry run's artifacts were replayed through `--stage write` locally: zero API calls, same content, real cost carried forward. That is the staging layer doing exactly what it was built for.

**Addendum, same session — the viewer restructured into a real hierarchy.** The original single-page `/digest` layout (everything on one long page) was replaced with four route levels on request: front page (overview + Top 5) → section pages (synthesis + item index) → article overview pages (full summary, why-it-matters, badges) → external source link. A multi-category paper gets one URL per category it survived into, and each copy's article page cross-links to the others ("Also appears in: ...").

Building it surfaced a real Next.js/Turbopack finding: nested `generateStaticParams` did not receive the parent `[month]` param through Next's documented parent-to-child composition — `params.month` arrived `undefined` in both `[category]` and `[article]`, confirmed by direct instrumentation before assuming a cause. Fixed by making each nested `generateStaticParams` self-contained (walk `getAllMonths()` directly) rather than depending on composition that did not hold in practice. Verified against the actual build output, not just the build succeeding: all 11 categories and all 112 articles are prerendered HTML, and `next start` was smoke-tested for real 200s and 404s.

**Also measured:** 31 of 112 slots (28%) flagged `thin_abstract`, concentrated in the RSS-fed `cmc_reg`/`industry` categories. The model is correctly declining to invent findings from headlines; whether a quarter of the digest should rest on that material is a product decision, not a bug.

**Open at session end**: Phase 5 (viewer pages, no API spend). The one corrupt `cmc_reg` sentence. Whether to filter thin abstracts.

## 2026-08-14 — The Groq side-by-side: not run, and why

Dispatched the comparison four times. It never scored a single item, and the reason is an account limit rather than anything in this repo.

**The verdict: stay on Haiku.** Groq's free (`on_demand`) tier caps `openai/gpt-oss-120b` at **8000 tokens per minute**. One scoring batch of 8 items requests 11305 tokens — prompt plus completion budget — and is rejected outright:

```
413 rate_limit_exceeded — tokens per minute (TPM): Limit 8000, Requested 11305
```

Even if a single request were squeezed under the cap, a month is ~1039 judgements and several hundred thousand prompt tokens before reasoning output. At 8000 TPM that is hours of rate-limited throughput against a 45-minute job. Scoring this workload on that tier is not a tuning problem. Revisiting it means upgrading the Groq account, which is a spending decision, not a technical one — and the prize is about $0.55 a month against Haiku's $0.64. Cost was never the reason to consider Groq.

**The mechanism stays.** `score_model` and `batch_size` are workflow inputs, `DIGEST_MODEL_<STAGE>` and `DIGEST_BATCH_SIZE` are env overrides, and `lib/providers/groq.js` answers the same `complete()` contract. Pointing a stage at Groq is still one dispatch if the account changes.

**Four attempts, and what each was actually worth.** Three real defects surfaced, none of them Groq's fault:

1. **413 at batch 25.** I read this as a payload-size cap and added `DIGEST_BATCH_SIZE` so batch size could be overridden per run without re-batching the Anthropic baseline. The override is worth keeping, but the diagnosis was wrong — it was the TPM limit all along, and a smaller batch only changed which error came back.
2. **An opaque `400 Bad Request`.** `HttpError` captures the response body and `scripts/digest.mjs` was logging only `err.message`, so a provider explaining itself precisely came out as a bare status line. Now logged. This is the fix that made everything after it diagnosable in one round instead of by guesswork.
3. **`json_validate_failed` with an empty `failed_generation`.** Not a schema problem: gpt-oss spends the completion budget on reasoning before emitting content, so a budget sized for the answer alone was gone before any JSON existed, and Groq reported the truncation as a validation failure. The budget is now scaled at the provider and sent as `max_completion_tokens` rather than the superseded `max_tokens`.

Fix 3 is what finally produced the TPM error: raising the budget enough for reasoning pushed the request over the cap, which is how the real constraint became visible. The two limits pull against each other on a capped account — too small a budget truncates, too large a request is refused — and that squeeze is now documented in `groq.js` so the next person does not re-derive it.

**The workflow's failure path got a full live exercise.** The first failure opened issue #1; each subsequent failure **commented on it** rather than opening a new issue, which is exactly the de-duplication it was built for. Fetch and normalize completed cleanly every time (1318 raw → 766 unique), so nothing upstream of scoring was ever implicated.

**One process note worth keeping.** Twice I reported elapsed run times inferred from my own `sleep` calls rather than from GitHub's `started_at`, and twice that was wrong — once concluding Groq was "slow" when two minutes had passed. This container suspends between turns, so sleeps do not track wall clock. Read `started_at`.

## 2026-08-13 (Phase 4, out of order) — The Actions workflow, and the first live scoring run

The API keys turned out to live in **GitHub Actions secrets**, which a dev container cannot read by design. Rather than move a key, Phase 4 was brought forward: build the workflow first, and let scoring run where the keys already are. No key entered a session.

**`.github/workflows/digest.yml`** — monthly on the 2nd at 06:17 UTC, plus `workflow_dispatch` with `stage`, `month`, `since`, `dry_run` (defaulting to **true**), `force`, `score_model` and `log_level`. It commits only when running on the default branch; a dispatch from a feature branch still runs and uploads, then warns instead of committing. One open failure issue is commented on rather than duplicated, so a source that stays down does not open an issue every month. Also added `ci.yml`: lint, tests and `next build` on every push.

**`DIGEST_MODEL_<STAGE>`** overrides a stage's model for one run, resolved through `knownModels` so the provider and the per-token rates travel with the name. A free-text model is rejected at config validation — an unknown model would cost-account at the wrong price, and a wrong cost table is worse than none. This makes the Haiku-vs-Groq comparison a dispatch input rather than a config edit.

**The first live run was cancelled — and my stated reason for cancelling it was wrong.** I reported it as running 41 minutes against a 45-minute timeout. The timestamps say otherwise: the pipeline step started 19:53:13 and I cancelled at 19:57:55, i.e. **4m42s**. I had inferred elapsed time from my own `sleep` calls rather than from GitHub's `started_at`. Scoring is ~48 calls at ~14s each, so sequential is ~11 minutes and would have fit the job. The concurrency change below is a genuine speed-up (~11 min to ~3 min) but it was not the rescue I described.

Batches run **4 in flight through the existing token-bucket limiter, in two waves**. Wave one is the first batch of each category — the calls that write the rubric cache, all for different rubrics. Wave two is everything else. A flat pool would have fired same-category batches together, so each would miss and re-write the cache. Verdicts are applied after every call returns, **in batch order rather than completion order**, because concurrency must not change which items land in the report or in what sequence; a test pins that with a provider that finishes out of order. Second run: **4m57s end to end.**

**The scoring gate, on a real month (2026-08, 35-day window):**

1298 raw → 754 unique → **1039 category-level judgements → 180 kept** at threshold 3. Trimmed to `max_items` that is 111 category slots, 128 distinct papers. Zero non-ok entries in `source_health`.

| category | seen | kept | cap |
|---|---:|---:|---:|
| pat_control | 58 | 9 | 12 |
| upstream_pd | 135 | 23 | 12 |
| harvest_dsp | 56 | 11 | 10 |
| media_dev | 53 | 6 | 10 |
| intensification | 31 | 11 | 12 |
| modeling_ml | 143 | 22 | 15 |
| cell_line_dev | 26 | 7 | 10 |
| product_quality | 112 | 23 | 12 |
| htpd_automation | 86 | 9 | 10 |
| cmc_reg | 245 | 31 | 10 |
| industry | 94 | 28 | 10 |

Score distribution across all 1039 judgements: 0→621, 1→127, 2→111, 3→79, 4→63, 5→38. The mass at 0 is the query net being wide on purpose and the gate doing its job.

**Spot-checking the verdicts, which is the part that mattered.** The fives are right: 13C MFA on CHO perfusion identifying glycosylation flux bottlenecks; PDK inhibition against the Warburg effect with a 2× titer lift; base-editing GS knockout mapping PTC position to knockout completeness; FDA's own account of process models in approved applications. The zeros are genuine noise the wide net drags in — microplastics in sludge, CO2 reduction catalysis, keratinocyte cosmetics. The twos are defensible near-misses: yeast fermentation Raman, in-silico-only transfer learning, cultured meat scale-up.

One case confirms the category boundaries work as written: a CHO bispecific single-cell-cloning paper scored **2 under `upstream_pd` and 5 under `cell_line_dev`** — exactly the boundary the `cell_line_dev` rubric spells out ("if the lever is the cell line, it belongs here").

**Cost, measured rather than estimated:** 48 calls, 334,106 input and 61,254 output tokens, **$0.6404** for the month — $0.0036 per kept item. That is well above the $0.38 Phase 1 estimated for scoring, because eleven categories over a wider net is 1039 judgements, not the ~600 assumed.

**Prompt caching is currently a no-op, and the ledger said so.** Both cache counters came back **0**. Haiku's minimum cacheable prefix is 2048 tokens and the scoring system prompt is about 1k, so `cache_control` is silently ignored. The forgone saving is ~14% of scoring input — about **$0.04 a month** — so the fix is not to pad a prompt; it is to stop believing the comment. The comment in `anthropic.js` now records the measurement instead of the intention. This is exactly why usage accounting reports cache tokens separately.

**One defect the artifact exposed:** `npm run digest > file` prepends npm's own two-line banner to stdout, so the uploaded JSON did not parse. `npm run --silent`.

**Open at session end**: the Groq side-by-side has not been run — the mechanism is in place (`score_model: openai/gpt-oss-120b`) and it is one dispatch. The repo default branch is still `claude/plan-review-repo-setup-8ikgmv`; `main` is fast-forwarded onto it so the switch is now a no-op, but until it is made the workflow will not commit. Phase 3 (summarize, synthesize, write) is next.

## 2026-08-13 (Phase 2) — Normalize, dedupe, ledger, providers and the scoring gate

Added `htpd_automation` (ambr/microbioreactors, robotic liquid handling, automated sampling, DOE execution, self-driving labs) — eleven categories now. Then built Phase 2.

**Normalize and dedupe, measured on a live 35-day window:** 1278 raw → 734 unique → 734 kept. 544 collapsed on identifier, 0 on title.

That zero looked wrong, so it was checked rather than accepted: no exact-title duplicates remain in the output, and of 734 items 635 are DOI-keyed against a single PMID-keyed one. DOI coverage from both PubMed and Europe PMC is near-total, so the identifier pass catches essentially everything and the title pass has nothing left to do. It is insurance, not dead weight — the one candidate pair above 0.75 Jaccard ("duvakitug in ulcerative colitis" vs "in Crohn's") is correctly *rejected* at the 0.9 threshold. The 98 title-keyed items are exactly the 94 RSS plus 4 arXiv records, which carry no DOI.

**Ledger.** `external_id → {title, first_seen_month, categories, url}`, merged across the base file and any year shards, sharding past 5000 entries by first-seen year with the base file emptied rather than deleted so a half-finished migration cannot leave an id in two places. `is_recurring` was given a precise definition rather than left vague: an item reported in an earlier month that now matches a category it has *not* been reported under. Items whose categories were all covered before are dropped.

**Providers.** `complete({system, user, schema})` behind `models.<stage>.provider`, with Anthropic and Groq implementations — Groq over plain `fetch` against its OpenAI-compatible endpoint rather than adding a second SDK. Structured output goes through a JSON schema on both, so a malformed response is a provider contract violation rather than something to regex out of prose.

**Scoring.** One call per category per batch, the rubric sent as a cached system prefix rather than re-billed per batch. Items addressed by index; a missing verdict **halts the run** rather than being treated as a zero, because a skipped item and an irrelevant item are indistinguishable downstream. Usage accounting records tokens and USD per stage and model, with cache reads at 0.1x and writes at 1.25x.

**Two defects found while building, both mine:**

- Adding `method`/`body` parameters to the HTTP helper put the request `body` in a temporal dead zone: an inner `const body = await res.text()` shares its block, so *every* request failed with "Cannot access 'body' before initialization". Caught immediately because the live run went to zero records — and covered now by `test/http.test.js`.
- Rewriting the CLI for multi-stage dropped the dead-source exit guard, so that total wipeout **exited 0**. Restored, and written into CLAUDE.md as an invariant: fail-soft adapters plus no guard means an outage is indistinguishable from a quiet month.

82 tests, lint clean. Scoring is built and unit-tested against a stub provider but has not run live — it needs `ANTHROPIC_API_KEY`, and fails with exactly that message and exit 1. Artifact reuse verified: a normalize re-run costs 0.5s instead of 120s.

## 2026-08-13 — Coverage expansion, two new categories, and an RSS bug we were causing

Answered the open review questions: work from `main`, expand the net, find an Endpoints alternative.

- **Two new categories, both real gaps for this reader.** `cell_line_dev` (vectors, targeted integration, transposases, host engineering, clone screening and stability, specific productivity) and `product_quality` (glycans, charge variants, aggregation, and which upstream levers move them — the bridge between upstream and CMC). Each carries an explicit boundary clause against its neighbours so the scorer is not guessing. 43 and 153 records respectively in a 35-day window.
- **arXiv widened** to `cs.LG` and `math.OC` alongside `stat.ML`/`eess.SY`/`q-bio.QM`. Yield went 2 → 4 in 35 days. That is genuinely what is there: the scan now reports `examined 5 of 240 results before reaching 2026-07-01`, i.e. only five matching papers are newer than the window edge. arXiv is a low-volume, high-signal source here and should not be judged on count.
- **Fixed a misleading counter.** The arXiv note reported the number of results arXiv *returned* as though it were the number *examined* — "scanned 240" when the scan actually broke at entry 5. It overstated search depth ~50x.
- **Endpoints News: three approaches tried, none shipped.** Its own feed 403s to any non-browser client on every path (`/feed`, `/feed/atom`, `/rss`, `/channel/news/feed`). Reading it through Google News RSS *did* work technically, but the `site:endpts.com` query returns 14 items whose newest is February 2025 — it would have added the appearance of coverage with none of the substance, so it was removed rather than left in. Replaced instead with **BioPharma Dive** (capacity, CDMO, supply chain — what Endpoints was wanted for) and **The Cell Culture Dish** (the most upstream-specific outlet found). Cell Culture Dish is currently dormant: 11 items, newest 2026-04-16. Kept anyway — it costs one request and is on-topic when it does post.
- **The FDA feed's intermittent 401s were our fault.** The RSS adapter fetched each feed once *per category*, so with eight categories on the regulatory tag the FDA got eight identical requests per run and its rate limiter answered with 401 — which, being non-standard for throttling, our retry logic correctly treated as permanent. Two fixes: a per-run feed cache keyed on URL that stores the *promise* (so concurrent categories collapse into one request), and an opt-in `retryStatuses` on the HTTP helper so RSS can treat 401 as transient. Result: 1170 records with **zero degraded sources**.

Ten categories, five sources, 1170 records in 111s. `main` now exists and carries all of this.

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
