# CCPSLitReview

A monthly automated research digest for upstream CHO process development and CMC. A scheduled GitHub Actions job searches literature, preprints, regulatory sources, and trade press across eleven bioprocessing topics, filters for relevance, summarises what survives, and commits one JSON report per month. A read-only Next.js viewer renders it.

**Status: all five phases are built.** The pipeline runs end to end in Actions, `data/digest/2026-08.json` is the first committed month, and the viewer renders it at `/digest`.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the keys you have
```

| Variable | Needed for | Notes |
|---|---|---|
| `NCBI_API_KEY` | PubMed | Optional. Without it PubMed is throttled to 3 req/s instead of 10; the run still succeeds and notes it in `source_health`. |
| `ANTHROPIC_API_KEY` | Scoring, summarising, synthesising | Phase 2 onward. |
| `GROQ_API_KEY` | Optional alternative provider | Only if you point a stage at Groq in `config/digest.config.js`. |

Secrets live in `.env.local` locally and in GitHub Actions secrets in CI. They are never committed.

## Commands

```bash
npm run fetch        # stage 1, dry run: fetch everything and print records to stdout
npm run digest -- --stage fetch --dry-run --category modeling_ml
npm test             # unit tests; no network, no LLM calls
npm run lint
npm run dev          # the viewer, at http://localhost:3000
```

**Use the npm scripts rather than `node scripts/digest.mjs` directly.** They set `NODE_USE_ENV_PROXY=1`, which Node needs in order to honour `HTTPS_PROXY`. Behind a proxy, some hosts (the FDA feed in particular) reject the unproxied path. The flag is a no-op where no proxy is configured, including in Actions.

### CLI options

```
--stage <name>      fetch | normalize | score | summarize | synthesize | write | all
--month YYYY-MM     target month (default: the month the window ends in)
--since YYYY-MM-DD  override the window start
--category <id>     restrict to one category (repeatable)
--source <id>       restrict to one source (repeatable)
--dry-run           write nothing; print the report to stdout
--fresh             ignore existing staging artifacts and re-run from fetch
--force             allow overwriting an already-written month
--log-level <lvl>   debug | info | warn | error
```

Progress goes to stderr and records go to stdout, so a dry run stays pipeable:

```bash
npm run --silent fetch 2>/dev/null | jq '.records | length'
```

## How to…

### Add a category

Append one entry to `categories` in [`config/digest.config.js`](config/digest.config.js). Nothing else changes — no code edit. Each entry needs:

- `id` — lowercase, digits, underscores; must be unique
- `name` — display name
- `max_items` — cap on how many items reach the report
- `scope` — **the verbatim rubric the scoring model judges against.** Write it for the model, not for a human reader. If a category is prone to false positives, state the requirement explicitly (see `modeling_ml`, which demands an actual bioprocess application rather than a passing mention).
- `sources` — per-source overrides; anything omitted inherits the global defaults in `sources`

```js
{
  id: 'single_use',
  name: 'Single-Use Systems',
  max_items: 10,
  scope: 'Extractables and leachables; film compatibility; ...',
  sources: {
    pubmed: { query: '("single-use"[tiab] OR "disposable bioreactor"[tiab]) AND ...' },
    europepmc: { query: '("single-use" OR "disposable bioreactor") AND ...' },
    rss: { terms: ['single-use', 'single use', 'disposable'] },
  },
}
```

Run `npm test` afterwards — config validation is covered, so a malformed entry fails with a message naming the offending path.

### Add or remove an RSS feed

Edit `sources.rss.feeds`. Each entry is `{ id, name, url, tags }`, plus optional `enabled: false` to keep a feed on the books without fetching it.

```js
{ id: 'pda', name: 'PDA Letter', url: 'https://www.pda.org/rss', tags: ['regulatory'] }
```

Categories select feeds by `tags` (default: all live feeds) or by explicit `ids`. A feed that starts failing is reported in `source_health` and the run continues — check the report footer rather than trusting silence.

### Tune the relevance threshold

`relevance.threshold` in the config; items scoring below it are discarded. The default is 3 on a 0–5 scale. Use a dry run to see what a change would keep and drop before committing to it.

### Re-run a single month

```bash
npm run digest -- --stage all --month 2026-09 --dry-run   # inspect first
npm run digest -- --stage all --month 2026-09 --force     # then overwrite
```

Months are append-only: without `--force`, writing a month that already exists is refused. Stages are independently runnable and each skips work whose output already exists, so re-running after a mid-pipeline failure does not re-fetch or re-score.

### Run the pipeline in Actions

`.github/workflows/digest.yml` runs on the 2nd of each month at 06:17 UTC and can be dispatched by hand from the Actions tab. Its inputs mirror the CLI: `stage`, `month`, `since`, `dry_run`, `force`, `log_level`, plus `score_model`.

`dry_run` defaults to **true** on a manual dispatch, so the safe thing is the default: the run fetches, normalizes and scores for real, prints the tables to the job log, uploads the full JSON as a `digest-<run_id>` artifact, and commits nothing.

Two behaviours worth knowing:

- **It only commits on the default branch.** Dispatch from a feature branch and the run still executes and uploads, but ends with a warning instead of a commit. The default branch is the only branch Vercel builds; committing anywhere else strands the report.
- **`score_model` must name a key of `knownModels`.** It overrides the scoring model for one run — the mechanism behind scoring the same month on Haiku and on Groq for comparison — and it carries the provider and the per-token rates with it. A free-text model name is rejected at config validation rather than accepted and cost-accounted at the wrong price. The same thing works locally: `DIGEST_MODEL_SCORE=openai/gpt-oss-120b npm run digest -- --stage score --dry-run`.

`.github/workflows/ci.yml` runs lint, tests and `next build` on every push.

### View it locally

```bash
npm run dev     # http://localhost:3000 redirects to /digest
```

`/digest` is the latest committed month; `/digest/YYYY-MM` is a specific one. Both are prerendered at build time from `data/digest/*.json`, and `dynamicParams = false` means a month that was never committed is a build-time 404 rather than a runtime read — Vercel's runtime filesystem is read-only, so a runtime read could not work anyway.

## Architecture

The pipeline runs **only** in GitHub Actions and is the sole writer. The Next.js app deploys to Vercel, reads the committed JSON at build time, and never writes — there are no API routes and no runtime filesystem reads. A new commit from Actions triggers a redeploy, which is what makes the no-database design work.

Data lives in `data/digest/`: one `YYYY-MM.json` per month, a dedupe ledger under `index/`, and per-month staging artifacts under `staging/`. All reads go through `lib/digest.js`.

### A note for a future routine-based generator

Summarisation is the dominant cost line, so it may later move onto a Claude Code routine billed against a subscription rather than the metered API. The seam is already in place: generation sits behind `generate(items, kind)` selected by the `generator` config key, the fetch/normalize/dedupe/score stages have no dependency on how generation happens, and the scored item list is a committed on-disk artifact (`staging/<month>/scored.json`) that a routine can read from the repo.

Such a generator would need credentials for whatever surface it runs on in place of `ANTHROPIC_API_KEY`; it would not need `NCBI_API_KEY` or any source credentials, since the deterministic stages stay in Actions. Those variables are deliberately not added yet.

## Conventions

See [CLAUDE.md](CLAUDE.md) for the full set. The load-bearing ones: months are append-only; adapters fail soft and everything else halts; pages are static and never read the filesystem at runtime; and only title, abstract, metadata, and links are stored — no article bodies, no paywall circumvention.

## License

Proprietary — see [LICENSE](LICENSE). The source is public for reading and
evaluation; commercial use, modification, distribution and sublicensing all
require written permission.
