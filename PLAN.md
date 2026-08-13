# PLAN.md — Monthly Biopharma Literature & News Digest

Status: **awaiting approval**. No implementation code has been written.

---

## 0. What I found in this repo

Nothing. This is a genuinely empty repository:

- `git ls-remote origin` returns **zero refs** — no default branch, no commits, no remote history.
- Working tree contains only `.git/`. No `CLAUDE.md`, no `package.json`, no `app/`, no `/reports` route, no existing report routine, no CI.

**Consequence for the brief:** there is no weekly trends routine to model on and no `/reports` pattern to extend. Every "reuse the existing X" instruction in the prompt resolves to "build it new." Concretely:

| Prompt says | Reality | Plan |
|---|---|---|
| "modeled on the weekly trends routine already in this repo" | No routine exists | Build the pattern from scratch, as the prompt's fallback clause allows |
| "Extend the existing `/reports` pattern rather than building a parallel one" | No `/reports` exists | Build `/digest` per the prompt's "If none exists, build:" branch |
| "Follow the repo's existing formatting, error handling, and env var patterns" | No conventions exist | Establish them in Phase 1 and write them into `CLAUDE.md` so later phases are consistent |

Environment: Node v22.22.2, npm 10.9.7. Branch `claude/plan-review-repo-setup-8ikgmv`.

**Nothing in the brief is blocked.** No hard blockers found — all seven non-negotiables are implementable as specified. Two things I want you to look at before Phase 1 are flagged in §9.

---

## 1. Stack decisions

Settled unless you say otherwise:

- **JavaScript (ESM), not TypeScript.** The brief specifies `lib/digest.js`; I'm matching that throughout. Node 22 native `fetch`, `node:test` for tests.
- **Next.js App Router**, static generation only. No API routes at all — not just no mutating ones.
- **Dependencies, deliberately minimal:** `next`, `react`, `react-dom`, `@anthropic-ai/sdk`, `fast-xml-parser` (parses both PubMed `efetch` XML and RSS/Atom — one parser, two jobs). Nothing else. No HTTP client, no RSS library, no schema validator — config validation is ~60 lines of hand-rolled checks that produce better error messages than a generic validator would.
- **Models** (in config with per-token rates, per the brief):
  | Stage | Model | Input $/MTok | Output $/MTok |
  |---|---|---|---|
  | score | `claude-haiku-4-5` | $1.00 | $5.00 |
  | summarize / synthesize | `claude-opus-5` | $5.00 | $25.00 |

  **Cost note, your call:** `claude-sonnet-5` ($3/$15, currently $2/$10 introductory through 2026-08-31) would roughly halve the dominant cost line. I've defaulted to Opus 5 because summarization quality for an expert reader is the whole point of the product, and it's a one-line config change either way. The dry-run cost table will tell you concretely what you're paying per month before you decide.

---

## 2. Layout

```
config/
  digest.config.js          # categories, sources, RSS feeds, models, rates, thresholds
lib/
  digest.js                 # READ path: getAllMonths / getReport / getLatest
  pipeline/
    fetch.js  normalize.js  score.js  summarize.js  synthesize.js  write.js
  adapters/
    pubmed.js  europepmc.js  biorxiv.js  arxiv.js  crossref.js  rss.js
    index.js                # registry + common adapter interface
  generate/
    index.js                # createGenerator(config) -> { generate(items, kind) }
    anthropic-api.js        # AnthropicApiGenerator — the only implementation
  util/
    throttle.js  dedupe.js  usage.js  ledger.js  window.js  log.js
bin/
  digest.js                 # CLI entry: --stage, --month, --dry-run, --force, --since
data/digest/
  YYYY-MM.json
  index/articles.json
  staging/YYYY-MM/{raw,normalized,scored}.json
app/
  digest/page.js  digest/[month]/page.js
.github/workflows/digest.yml
```

---

## 3. Design decisions I'm making (flag any you disagree with)

**3.1 Staging artifacts — what's committed.** The brief requires the scored item list to be "a serializable artifact on disk… A routine will need to read that from the repo." So `staging/YYYY-MM/scored.json` **is committed**; `raw.json` and `normalized.json` are gitignored (large, cheap to regenerate, no LLM cost behind them). This satisfies the phase-two seam without bloating the repo with fetch dumps.

**3.2 Idempotency, precisely.** Each stage writes its output artifact and skips work whose output already exists. Within a run, re-running `--stage summarize` after a mid-stage failure reuses `scored.json` — no re-fetch, no re-score, no duplicate LLM spend. Across runs on a fresh runner, `raw.json` is absent so fetch repeats; that's intentional and free. The stages that cost money are the ones protected by committed artifacts.

**3.3 Date window, no extra state file.** Window resolution order: explicit `--since` → explicit `--month YYYY-MM` (that calendar month) → the newest committed report's `generated_at` → now − 35 days. Deriving the watermark from committed reports means it only advances on a *successful, committed* run, which is exactly "since the last successful run" — and dry runs can't move it, because they commit nothing.

**3.4 Failure notification.** No external service (none is allowed, and none is warranted). On workflow failure the job opens-or-updates a GitHub issue titled `digest run failed: YYYY-MM` using the built-in `GITHUB_TOKEN`, which needs `issues: write` alongside `contents: write`. Say the word if you'd rather it just fail loudly in the Actions tab.

**3.5 Rate limiting.** A shared token-bucket limiter keyed by host, with per-host concurrency caps. NCBI gets 10/s with `NCBI_API_KEY` present, 3/s without — the degradation is a config value, not a code path, and it's logged so a missing key shows up in `source_health` rather than silently halving throughput.

**3.6 Ledger sharding.** Reader merges `index/articles.json` plus any `index/articles-YYYY.json`. Writer keeps appending to the base file until it exceeds 5,000 entries, then migrates to year shards. Implemented from the start so the migration is tested, not discovered in production.

**3.7 Scoring call shape.** One call per category per chunk (~25 items), items keyed by index, using `output_config.format` with a JSON schema so the response is structurally guaranteed rather than parsed-and-prayed. Category rubric goes in a cached prompt prefix (Haiku 4.5's cacheable minimum is 4,096 tokens — rubrics may fall under it, in which case caching silently no-ops and costs nothing; the dry-run table will show whether reads are landing).

**3.8 Vercel redeploy.** Pushes made with `GITHUB_TOKEN` do not trigger *GitHub Actions* workflows, but they do fire the webhooks third-party apps subscribe to — so Vercel's Git integration will deploy the new month normally. Flagging it because the "GITHUB_TOKEN doesn't trigger workflows" rule gets over-generalized and it's the kind of thing that looks broken at 2am.

---

## 4. Phases

Stop after each for your review, per the brief.

### Phase 1 — Config, read module, adapters
Config schema with all eight categories, per-source overrides, and per-category `max_items`. `lib/digest.js` read module. All six adapters behind the common interface, each returning `{ records, health }` and failing soft. Shared throttle. `bin/digest.js --stage fetch --dry-run` dumps raw results to stdout. Unit tests over fixture payloads for each parser.

**No LLM calls, no file writes.** Deliverable: I run it against a real 35-day window and show you per-category, per-source counts so you can see what the queries actually pull before any money is spent.

### Phase 2 — Normalize, dedupe, score
Normalization to the common schema. Dedupe on `external_id` (DOI → PMID → normalized-title hash), then fuzzy title match to catch the same paper arriving via PubMed and Europe PMC. Ledger read/write. Scoring stage with strict JSON, batching, and the ≥3 gate.

**Deliverable per the brief:** a real month scored, with an explicit kept/dropped table per category including rationales for borderline items, so you can tune the threshold before it's load-bearing. Cost table printed for this stage.

### Phase 3 — Summarize, synthesize, write
`generate(items, kind)` interface + `AnthropicApiGenerator`, selected by `config.generator = "api"`. Per-item summary and `why_it_matters`; per-category synthesis; cross-category Top 5; editorial overview. Month JSON written, ledger updated, `run_stats` persisted. Full cost table across all three stages, per-kept-item cost included.

### Phase 4 — GitHub Actions workflow
`schedule` on the 1st, plus `workflow_dispatch` with `dry_run`, `month`, and `force` inputs. `permissions: contents: write, issues: write`. Single commit `digest: YYYY-MM` carrying the month file, the ledger, and `scored.json`. No commit when the run produced nothing. Append-only months unless `--force`. Failure issue.

### Phase 5 — Rendering
`/digest` (latest + sidebar index) and `/digest/[month]` via `generateStaticParams`, statically generated — no `force-dynamic`, no runtime filesystem reads. Editorial summary → Top 5 → per-category sections with synthesis and items. New-vs-recurring markers. `source_health` footer. `README` covering: add a category, add an RSS feed, tune the threshold, re-run a month, and which env vars a future routine-based generator would need.

---

## 5. Cost instrumentation

A `usage.js` accumulator every LLM call reports into: `{ stage, model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }`. Rates live in config beside the model IDs. Every run — dry runs included — prints a table of tokens and estimated USD broken out by stage and model, with a run total and a per-kept-item figure. The same totals land in the month JSON under `run_stats`, so cost is visible across months rather than only in a job log that ages out.

---

## 6. Error handling

Adapter failures are caught, recorded in `source_health` as `failed` or `degraded` with the error message, and the run continues. Everything else — config validation errors, LLM call failures after retry, write failures — halts the run with a non-zero exit. There is no third category. No caught exception disappears without either appearing in `source_health` or stopping the run.

---

## 7. Phase-two seam (built, not used)

`createGenerator(config)` returns `{ generate(items, kind) }` with `kind ∈ {summary, synthesis, overview}`. One implementation, `AnthropicApiGenerator`, selected by `generator: "api"`. Fetch/normalize/dedupe/score import nothing from `lib/generate/` — the dependency runs one direction only. The scored list is a committed on-disk artifact. Adding a `RoutineGenerator` later means one new module and one config value. The README will note which env vars such a generator would need, without adding them.

---

## 8. Testing

`node:test`. Adapter parsers against checked-in fixture payloads. Dedupe (identifier and fuzzy paths). Ledger sharding at the boundary. Config validation rejects malformed categories. Window resolution across all four precedence branches. No test makes a network or LLM call.

---

## 9. Two things to look at before I start

**9.1 bioRxiv's API has no keyword search.** `api.biorxiv.org` exposes `/details/{server}/{interval}/{cursor}` — a date-window dump, paginated, with no query parameter. There is no endpoint that takes search terms. Options:

- **(a) My recommendation:** get preprints via Europe PMC's `SRC:PPR` filter, which indexes bioRxiv/medRxiv and *does* support real query syntax. Keeps the bioRxiv adapter as a thin fallback.
- **(b) As literally specified:** page the bioRxiv window (several thousand preprints/month across all subjects) and keyword-filter client-side. Workable, just wasteful and cruder matching.

I'll verify the endpoint behavior empirically in Phase 1 and show you the numbers rather than asking you to decide on my say-so. Absent direction I'll implement (a) with (b) available behind a config flag.

**9.2 Anthropic API key on a subscription.** The brief has stages 3–5 on `ANTHROPIC_API_KEY` from repo secrets — metered billing, entirely correct for Actions. Just confirming you have or will create an API key, since phase two exists precisely because you'd rather bill summarization to a subscription. Nothing blocks on this until Phase 3.

---

## 10. Not doing

Not in scope, listed so the omissions are deliberate rather than forgotten: no database of any kind; no article body scraping or paywall circumvention (title/abstract/metadata/link only); no Next.js API routes; no `force-dynamic` or runtime filesystem reads; no `RoutineGenerator`; no secrets committed anywhere.

---

Approve, or tell me what to change. On approval I'll build Phase 1 and stop.
