# PLAN.md — Monthly Biopharma Literature & News Digest

Status: **awaiting approval**. No implementation code has been written.

Revision 2 — incorporates the TrendTracker reference repo and a Groq cost analysis.

---

## 0. What I found

### This repo

Empty. `git ls-remote origin` returned zero refs; working tree was `.git/` only. Node v22.22.2, npm 10.9.7.

### TrendTracker (`mjrichar09/TrendTracker`, cloned to `/workspace/trendtracker`)

This is the reference the brief meant, and it's a much better starting point than "nothing." 1.1 MB, 5 committed weekly reports, well-documented. What it establishes:

| Piece | Relevance here |
|---|---|
| `lib/reportsDir.js` | One exported constant for the data path, resolved from `process.cwd()` so the Next server and standalone scripts agree. Direct model for `lib/digestDir.js`. |
| `lib/reports.js` | `getAllWeeks` / `getReport` / `getLatest` — **exactly** the three-function read module the brief specifies, already written. `node:fs/promises`, returns `[]`/`null` on missing rather than throwing. |
| `lib/writeReport.js` | Validated filename, `mkdir -p`, pretty-printed JSON + trailing newline. Basis for my write stage. |
| `app/reports/` | `page.jsx` (latest + sidebar of past weeks) and `[week]/page.jsx` (`generateStaticParams` + `dynamicParams = false` + `notFound()`). The exact static-generation shape `/digest` needs. |
| Conventions | Plain JS (no TS), ESM (`"type": "module"`), App Router, server components, minimal inline styles, `scripts/*.mjs` importing `lib/` directly, eslint-config-next. |
| `CLAUDE.md` | A document map with explicit update cadence (batch prose, commit code often) and a "Working Efficiently" section. Worth adopting wholesale. |

**Two things it does *not* have**, which reshape my plan:

1. **No `.github/workflows` — none at all.** TrendTracker's "weekly routine" is a *Claude Code cloud routine*, not Actions. So the brief's "runs as a GitHub Actions scheduled workflow" is a deliberate **departure** from the reference, not an imitation of it. And the phase-two idea (move summarization onto a Claude Code routine) is a move *toward* TrendTracker's model, not away.

2. **No LLM API calls anywhere in the code.** The intelligence *is* the routine agent. There is no scoring, no summarization, no prompt handling, no token accounting to copy. Everything in my Phases 2–3 is genuinely new.

**The most valuable thing in that repo is a bug report.** From its `CLAUDE.md`:

> A routine run isn't finished until its report commit is on `main`. Runs start on a generated `claude/*` branch and Vercel only builds `main`, so a report pushed to the session branch is written but never deployed — this stranded 2026-07-20 and 2026-08-03.

Two weeks of reports were silently written and never published. A GitHub Actions job committing directly to the default branch cannot fail this way. That's independent validation of the brief's non-negotiable #1, and it's the single strongest argument against ever moving the *whole* pipeline onto a routine.

---

## 1. Answering: should Groq replace Claude for some inference?

Short answer: **build the seam so you can, default to Anthropic, and don't switch for cost — because there isn't enough cost here to be worth optimizing.**

### Current rates

| Model | Provider | Input $/MTok | Output $/MTok |
|---|---|---|---|
| `openai/gpt-oss-20b` | Groq | $0.075 | $0.30 |
| `openai/gpt-oss-120b` | Groq | $0.15 | $0.60 |
| `llama-3.3-70b-versatile` | Groq | $0.59 | $0.79 |
| `claude-haiku-4-5` | Anthropic | $1.00 | $5.00 |
| `claude-sonnet-5` | Anthropic | $3.00 | $15.00 (intro $2/$10 through 2026-08-31) |
| `claude-opus-5` | Anthropic | $5.00 | $25.00 |

Groq's Batch API halves rates and prompt caching halves repeated input, so effective Groq cost can reach ~25% of the above.

### What a month actually costs

Assuming ~600 items reach scoring after dedupe, ~150 survive the ≥3 gate, title+abstract ≈ 350 tokens:

| Stage | Volume | On Anthropic | On Groq (`gpt-oss-120b`) |
|---|---|---|---|
| Score | ~600 items, ~35 batched calls | **$0.38** (Haiku 4.5) | **$0.05** |
| Summarize | ~150 calls | **$1.02** (Opus 5) | $0.03 |
| Synthesize | ~10 calls | **$0.25** (Opus 5) | $0.01 |
| **Total** | | **~$1.65 / month** | ~$0.09 / month |

**Moving scoring to Groq saves about $0.33 a month — four dollars a year.** Moving everything saves about $19/year, and pays for it with summary quality on the one stage where quality is the entire product.

That reframes the question. This isn't a cost-optimization problem; the bill is a rounding error at any model choice. So pick on quality:

- **Synthesize — keep Opus 5.** ~10 calls per month. Cost is negligible *regardless of model*, and it's the highest-judgment work in the pipeline. There is no argument for cheapening it.
- **Summarize — keep Opus 5 (or Sonnet 5).** This is where "never invent findings not present in the abstract; if the abstract is thin, say so rather than speculating" lives, for a reader with deep domain fluency who will notice confabulation immediately. Open 120B-class models are exactly where that instruction degrades. Sonnet 5 is a reasonable step down; Groq is not, for $12/year.
- **Score — genuinely fine on Groq, and genuinely fine on Haiku.** It's a bounded judgment (0–5 against a rubric) with strict JSON output. Both work. Haiku costs $0.38/month, so the saving is not the reason to do it.

**The one real argument for Groq here** isn't the monthly run — it's the Phase 2 tuning loop, where you'll re-score the same month repeatedly while tuning rubrics and thresholds. If your Groq account has free-tier capacity, that loop becomes free instead of ~$0.38 a pass. Worth having available. Note free-tier rate limits are per-minute and per-day, so a 35-call burst may need throttling that paid Anthropic wouldn't.

**So:** I'll build a thin provider abstraction and make the provider a **per-stage** config value. Defaults ship as Anthropic. Switching scoring to Groq becomes a two-line config edit you can make after Phase 2's cost table shows you real numbers instead of my estimates. Groq's API is OpenAI-compatible, so the adapter is ~40 lines of `fetch` — no `openai` SDK, no new dependency.

```js
// config/digest.config.js
models: {
  score:      { provider: 'groq',      model: 'openai/gpt-oss-120b', in: 0.15, out: 0.60 },
  summarize:  { provider: 'anthropic', model: 'claude-opus-5',       in: 5.00, out: 25.00 },
  synthesize: { provider: 'anthropic', model: 'claude-opus-5',       in: 5.00, out: 25.00 },
}
```

This is strictly better than the single global `generator: "api"` key I proposed in revision 1, and it costs almost nothing to build. It also makes A/B testing trivial: run the same month through both providers and diff.

---

## 2. Answering: copy parts of TrendTracker?

**Yes — the scaffolding and the read/write layer. Not the domain code.**

### Copy and adapt

| From TrendTracker | To here | Change |
|---|---|---|
| `lib/reportsDir.js` | `lib/digestDir.js` | Path → `data/digest`. Near-verbatim. |
| `lib/reports.js` | `lib/digest.js` | `getAllWeeks`→`getAllMonths`; `YYYY-MM-DD`→`YYYY-MM`. Logic unchanged — ISO months sort lexically the same way. |
| `lib/writeReport.js` | `lib/pipeline/write.js` | Keep the validate/mkdir/pretty-print shape. **Invert the overwrite rule** — see below. |
| `app/reports/page.jsx` | `app/digest/page.js` | Strip tickers/quotes/fib/allocations; keep the latest-plus-sidebar layout. |
| `app/reports/[week]/page.jsx` | `app/digest/[month]/page.js` | Keep `generateStaticParams` + `dynamicParams = false` + `notFound()` verbatim; swap the body. |
| `package.json`, `.gitignore`, `eslint.config.mjs`, `jsconfig.json`, `next.config.mjs`, `app/layout.js`, `app/globals.css` | same paths | Adopt as-is, add `@anthropic-ai/sdk` + `fast-xml-parser` + digest scripts. |
| `CLAUDE.md` document map + "Working Efficiently" | `CLAUDE.md` | Same structure, this project's content. |

### Do not copy

`lib/tickers.js`, `lib/tracker.js`, the fib/allocations/quotes rendering, `scripts/fetch-metrics.mjs`, `scripts/fetch-quotes.mjs`, `scripts/push-to-gdocs.mjs`, `docs/gdocs-webhook.gs` — all finance-domain. Also **not** `app/api/quote/route.js`: it's TrendTracker's one deliberate dynamic endpoint, and this brief forbids API routes outright.

### One deliberate inversion, flagged

TrendTracker's `CLAUDE.md` says of `writeReport`:

> Writing a week **overwrites** its file — re-running a routine updates, never duplicates. Don't "fix" this into append/versioning.

Your brief says the opposite: *"must not amend or rewrite prior months — each month is append-only once written, unless I re-run it deliberately with an explicit `--force` flag."*

I'm following your brief. Calling it out because it directly contradicts a documented invariant in the reference repo, and I don't want that to look like a porting mistake later.

---

## 3. Stack

- **JavaScript (ESM), not TypeScript** — matches TrendTracker and the brief's `lib/digest.js`.
- **Next.js App Router**, static generation only. No API routes at all.
- **Dependencies:** `next`, `react`, `react-dom`, `@anthropic-ai/sdk`, `fast-xml-parser` (parses both PubMed `efetch` XML and RSS/Atom — one parser, two jobs). Groq via plain `fetch`. Config validation hand-rolled (~60 lines, better errors than a generic validator).
- **Env:** `ANTHROPIC_API_KEY`, `NCBI_API_KEY`, optional `GROQ_API_KEY`. Actions secrets + `.env.local`, never committed.

---

## 4. Layout

```
config/
  digest.config.js          # categories, sources, RSS feeds, per-stage models+rates, thresholds
lib/
  digestDir.js              # DIGEST_DIR — single source of truth (from TrendTracker)
  digest.js                 # READ path: getAllMonths / getReport / getLatest (from TrendTracker)
  pipeline/
    fetch.js  normalize.js  score.js  summarize.js  synthesize.js  write.js
  adapters/
    pubmed.js  europepmc.js  biorxiv.js  arxiv.js  crossref.js  rss.js  index.js
  providers/
    index.js                # createProvider(cfg) -> { complete({system, messages, schema}) }
    anthropic.js  groq.js   # groq.js is ~40 lines of fetch, OpenAI-compatible
  generate/
    index.js                # createGenerator(config) -> { generate(items, kind) }
    anthropic-api.js        # AnthropicApiGenerator (delegates to providers/)
  util/
    throttle.js  dedupe.js  usage.js  ledger.js  window.js  log.js
scripts/
  digest.mjs                # CLI: --stage --month --dry-run --force --since
data/digest/
  YYYY-MM.json
  index/articles.json
  staging/YYYY-MM/{raw,normalized,scored}.json
app/
  digest/page.js  digest/[month]/page.js  digest/[month]/not-found.jsx
.github/workflows/digest.yml
```

---

## 5. Design decisions

**5.1 Staging artifacts.** `staging/YYYY-MM/scored.json` **is committed** — the brief requires a future routine to read the scored list from the repo. `raw.json` and `normalized.json` are gitignored: large, free to regenerate, no LLM spend behind them.

**5.2 Idempotency.** Each stage writes its artifact and skips work whose output exists. Re-running `--stage summarize` after a mid-stage failure reuses `scored.json` — no re-fetch, no re-score, no duplicate spend. On a fresh runner `raw.json` is absent so fetch repeats; that's intentional and free. The stages that cost money are the ones protected by committed artifacts.

**5.3 Date window, no extra state file.** Precedence: `--since` → `--month YYYY-MM` (that calendar month) → newest committed report's `generated_at` → now − 35 days. Deriving from *committed* reports means the watermark only advances on a successful committed run, and dry runs can't move it.

**5.4 Failure notification.** On workflow failure, open-or-update a GitHub issue `digest run failed: YYYY-MM` via the built-in `GITHUB_TOKEN` — needs `issues: write` alongside `contents: write`. No external service. Say so if you'd rather it just fail loudly in the Actions tab.

**5.5 Rate limiting.** Shared token-bucket keyed by host, with per-host concurrency caps. NCBI: 10/s with `NCBI_API_KEY`, 3/s without — a config value, not a code path, and logged so a missing key shows in `source_health` rather than silently halving throughput.

**5.6 Ledger sharding.** Reader merges `articles.json` + any `articles-YYYY.json`. Writer migrates to year shards past 5,000 entries. Built from the start so the migration is tested rather than discovered.

**5.7 Scoring call shape.** One call per category per ~25-item chunk, items keyed by index, strict JSON schema so the response is structurally guaranteed. Anthropic path uses `output_config.format`; Groq path uses its OpenAI-compatible JSON-schema mode. Both behind the same provider interface.

**5.8 Vercel redeploy.** Pushes made with `GITHUB_TOKEN` don't trigger *GitHub Actions* workflows, but they do fire the webhooks third-party apps subscribe to — Vercel's Git integration deploys normally. Flagging it because that rule gets over-generalized. Note TrendTracker's stranded-report bug is the *inverse* problem (pushing to a non-`main` branch), which Actions-to-default-branch avoids.

---

## 6. Phases

Stop after each for review.

### Phase 1 — Scaffold, config, read module, adapters
Port the TrendTracker scaffolding (`package.json`, eslint/jsconfig/next config, `.gitignore`, `app/layout.js`, `globals.css`) and the read/write layer (`digestDir.js`, `digest.js`). Write `CLAUDE.md` adopting their document-map + efficiency conventions. Config schema: all eight categories, per-source overrides, per-category `max_items`, per-stage model+rate table. All six adapters behind the common interface, failing soft into `{ records, health }`. Shared throttle. `scripts/digest.mjs --stage fetch --dry-run` dumps raw results to stdout. Unit tests over fixture payloads.

**No LLM calls, no file writes.** Deliverable: real per-category, per-source counts from a live 35-day window, so you can see what the queries actually pull before spending anything.

### Phase 2 — Normalize, dedupe, score
Normalization; dedupe on `external_id` (DOI → PMID → normalized-title hash) then fuzzy title match to catch the same paper via PubMed and Europe PMC; ledger read/write. Provider abstraction + both adapters. Scoring with strict JSON, batching, ≥3 gate.

**Deliverable per the brief:** a real month scored with an explicit kept/dropped table per category including rationales for borderline items, plus the stage cost table — and, since the provider seam exists by then, the same month scored on **both** Haiku and Groq side by side so the model choice is made on evidence rather than my estimates.

### Phase 3 — Summarize, synthesize, write
`generate(items, kind)` + `AnthropicApiGenerator` over the provider layer. Per-item summary and `why_it_matters`; per-category synthesis; cross-category Top 5; editorial overview. Month JSON + ledger + `run_stats`. Full three-stage cost table with per-kept-item cost.

### Phase 4 — GitHub Actions workflow
`schedule` on the 1st plus `workflow_dispatch` with `dry_run`, `month`, `force`. `permissions: contents: write, issues: write`. Single commit `digest: YYYY-MM` carrying month file + ledger + `scored.json`. No commit when the run produced nothing. Append-only unless `--force`. Failure issue. **Commits to the default branch** — explicitly avoiding TrendTracker's stranded-branch failure.

### Phase 5 — Rendering
`/digest` and `/digest/[month]`, adapted from `app/reports/`, statically generated. Editorial summary → Top 5 → per-category sections with synthesis and items. New-vs-recurring markers. `source_health` footer. README covering: add a category, add an RSS feed, tune the threshold, re-run a month, switch a stage's provider, and which env vars a routine-based generator would need.

---

## 7. Cost instrumentation

`usage.js` accumulator every provider call reports into: `{ stage, provider, model, input_tokens, output_tokens, cached_input_tokens }`. Rates live in config beside the model IDs, per stage. Every run — dry runs included — prints tokens and estimated USD by stage and model, with a run total and per-kept-item figure. Same totals persist into the month JSON under `run_stats`.

Given §1's numbers this is less about controlling spend than about *proving* what spend is, so the provider choice is evidence-based and stays honest if rates or volumes shift.

---

## 8. Error handling

Adapter failures are caught, recorded in `source_health` as `failed`/`degraded` with the error, and the run continues. Everything else — config validation, LLM failures after retry, write failures — halts with a non-zero exit. No third category, no silent catch.

---

## 9. Phase-two seam

`createGenerator(config)` returns `{ generate(items, kind) }`, `kind ∈ {summary, synthesis, overview}`. Fetch/normalize/dedupe/score import nothing from `lib/generate/` — dependency runs one direction. Scored list is a committed on-disk artifact. Adding `RoutineGenerator` means one new module and one config value.

Worth noting: TrendTracker *is* the working proof that a Claude Code routine can produce and commit these reports — including the failure modes its `CLAUDE.md` documents (routines must be created via the claude.ai UI, not the API; runs land on `claude/*` branches). Those are the two things a `RoutineGenerator` will have to handle, and they're already written down.

---

## 10. Testing

`node:test`. Adapter parsers against checked-in fixtures. Dedupe (both paths). Ledger sharding at the boundary. Config validation rejects malformed categories. Window resolution across all four precedence branches. Provider adapters against recorded responses. No test makes a network or LLM call.

---

## 11. Open items

**11.1 bioRxiv's API has no keyword search.** `api.biorxiv.org` exposes `/details/{server}/{interval}/{cursor}` — a date-window dump, no query parameter. Options: **(a)** get preprints via Europe PMC's `SRC:PPR` filter, which indexes bioRxiv/medRxiv and supports real query syntax; **(b)** page the bioRxiv window (several thousand/month across all subjects) and keyword-filter client-side. I'll verify empirically in Phase 1 and show counts. Absent direction I'll implement (a), with (b) behind a config flag.

**11.2 Confirm `ANTHROPIC_API_KEY`.** Nothing blocks until Phase 3. `GROQ_API_KEY` optional and only needed if you want the Phase 2 side-by-side.

**11.3 Should this repo keep TrendTracker's doc set?** TrendTracker runs `CLAUDE.md` + `TODO.md` + `PLAN.md` + `Status_update.md` with an explicit update cadence, and it clearly works — that repo's institutional memory is unusually good. I'd adopt `CLAUDE.md` and keep this `PLAN.md`, and add `TODO.md`/`Status_update.md` only if you want them. Your call; no code depends on it.

---

## 12. Not doing

No database; no article-body scraping or paywall circumvention (title/abstract/metadata/link only); no Next.js API routes; no `force-dynamic` or runtime filesystem reads; no `RoutineGenerator`; no secrets committed. Not porting TrendTracker's finance domain code.

---

Approve, or tell me what to change. On approval I'll build Phase 1 and stop.
