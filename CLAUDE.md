# CCPSLitReview — Monthly Biopharma Literature & News Digest

A monthly research digest for one expert reader (upstream CHO process development / CMC). A GitHub Actions job searches literature, preprints, regulatory sources, and trade press across eight bioprocessing topics, filters for relevance with an LLM, summarises what survives, and commits one JSON report per month. A Next.js viewer renders the latest month and an archive of past ones; it is read-only for content, and approved readers can rate and comment on papers.

- Repo: https://github.com/mjrichar09/CCPSLitReview (public, proprietary LICENSE)
- Reference implementation this repo's patterns came from: [TrendTracker](https://github.com/mjrichar09/TrendTracker) — its read/write layer, page structure, and scaffolding were ported; its finance domain code was not.
- **Status: Phases 1-6 complete.** The full pipeline runs in Actions and one month is committed; the viewer renders it; synthesize carries cross-month memory; readers with an approved account can rate and comment. The repo is public under a proprietary LICENSE. Feeding votes back into scoring is designed but not built. See PLAN.md for the phase plan and TODO.md for what's next.

## Document map — what to read when, what to update when

| Document | Read it when… | Update it when… |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | Every session start (automatic) | A convention, structure, or invariant changes — rare |
| [TODO.md](TODO.md) | **Start of every work session** — the "Next session plan" at its top is the entry point | A work item completes or a decision lands — batched at phase completion, not per-edit |
| [PLAN.md](PLAN.md) | Product/spec questions: phases, data shape, model choice, open decisions | A product-level decision is made or a phase completes |
| [Status_update.md](Status_update.md) | Catching up on what's already built ("did we already do X?") | **Once per session**, a summary entry at session end |
| [README.md](README.md) | Setup: install, commands, how to add a category or feed | Setup steps or commands change |

Git history carries everything else; don't duplicate what a commit message already says.

## Preferences

- **Doc-update cadence: batch, don't drip.** `TODO.md` at phase completion or when a decision lands; `Status_update.md` **one entry per session, at session end**; CLAUDE.md/PLAN.md only on real changes. Code commits stay frequent — it's the *prose* that batches.
- Work proceeds in the phases in PLAN.md, stopping after each for review.
- Periodically archive: when TODO.md's checked-off items outnumber the open ones, sweep the `[x]` entries into Status_update.md and delete them from TODO.

## Repo structure

```
config/
  digest.config.js    THE file to edit — categories, queries, rubrics, feeds, models, rates
lib/
  digestDir.js        DIGEST_DIR and friends — single source of truth for data paths
  digest.js           read helpers: getAllMonths / getReport / getLatest
  config.js           loadConfig (validation) + resolveSource / resolveFeeds
  adapters/           one module per source, all behind {records, health}
    index.js          registry + runAdapter (the fail-soft wrapper)
    record.js         makeRecord + XML/text helpers shared by every adapter
    pubmed.js europepmc.js biorxiv.js arxiv.js rss.js crossref.js
  pipeline/
    fetch.js          stage 1: run every enabled adapter for every category
  util/
    throttle.js       token-bucket limiter + per-host registry
    window.js         date-window precedence
    identity.js       DOI/PMID/title-hash identity, shared by adapters and dedupe
    http.js           fetch with timeout, retry, polite UA
    log.js            structured stderr logging
scripts/
  digest.mjs          CLI: --stage --month --since --category --source --dry-run --fresh --from-stage --force
  prep-for-routine.mjs           scored.json -> routine-input.json (deterministic prep for the routine)
  finalize-routine-output.mjs    routine-output.json -> summarized.json + synthesized.json (validate + assemble)
test/                 node:test over recorded fixtures; no network, no LLM calls
app/
  digest/             viewer pages + feedback client islands
    SessionProvider/SignIn/SignInButtons   auth state and sign-in (Google, GitHub)
    Engagement/VoteButtons/Comments        votes and comments, per page and per item
    ArchiveNav/CategoryNav                 the sticky header's two navs
data/digest/          (Phase 3) one YYYY-MM.json per month, plus index/ and staging/
```

Plain JavaScript (no TypeScript), ESM (`"type": "module"` so plain Node scripts import lib modules directly), App Router. Server components by default; the only client components are the reader-feedback islands and the two navs, and they are deliberately leaves - no page or layout becomes dynamic because of them.

`supabase/migrations/` holds the votes/comments schema; `lib/supabase/client.js` is the browser client, which returns null rather than throwing when unconfigured so a build without the env vars still ships the digest.

## Storage layer — build everything against this

Flat JSON files in `data/digest/`, one per month, named `${month}.json` (`YYYY-MM`), **committed to the repo**. The Actions job writes and commits; Vercel rebuilds on push, so the deployed site reads committed files at build time. **All reads go through `lib/digest.js`; pages and scripts must never touch the filesystem directly.**

```
data/digest/
  2026-09.json              one report per month
  index/articles.json       dedupe ledger, all items ever seen (shards by year past 5,000)
  staging/2026-09/
    raw.json                gitignored — large, free to regenerate
    normalized.json         gitignored — same
    scored.json             COMMITTED — a future routine-based generator reads it from the repo
```

## Conventions / invariants

- **`month` is always `YYYY-MM`** (it's the filename). ISO months sort lexically, so `b.localeCompare(a)` gives newest-first — don't parse dates for ordering.
- **Months are append-only.** Once written, a month is not rewritten except by a deliberate `--force`. *This is the opposite of TrendTracker's `writeReport`, which overwrites by design — a deliberate inversion, not a porting bug.*
- **Adapters fail soft; nothing else does.** A source that errors or times out is logged, marked `failed`/`degraded` in `source_health`, and the run continues. Every other error halts the run with a non-zero exit. There is no third category and no silent catch — every caught exception either lands in `source_health` or stops the run.
- **A source that failed in every category exits non-zero**, even though the run itself completed. Fail-soft otherwise means a total outage produces an empty digest and exit 0, which is indistinguishable from a quiet month.
- **A missing verdict in a scoring batch halts the run.** An item the model skipped and an item it judged irrelevant are indistinguishable downstream, so `score.js` refuses to guess.
- **`is_recurring` has a precise meaning:** the item was reported in an earlier month, but matched a category it has *not* been reported under. Items whose categories were all covered before are dropped outright. `lib/util/ledger.js` `classify()` is the definition.
- **Each stage reads its predecessor's staging artifact when one exists.** That is what makes re-runs cheap — a re-run after a mid-pipeline failure costs no re-fetching and no re-scoring. `--fresh` forces a rebuild from fetch.
- **Scoring batches run concurrently, in two waves: the first batch of every category, then all the rest.** Measured: 48 calls at ~14s each, so ~11 minutes sequential against ~3 minutes at concurrency 4. Sequential *did* fit the 45-minute job — this is a speed-up, not a rescue. The wave split is not cosmetic — a flat pool fires same-category batches together, and each then misses and re-writes the rubric cache. Verdicts are applied in batch order, never completion order, so concurrency cannot change the report.
- **Provider is per stage, not global** (`models.<stage>.provider`). Scoring is high-volume bounded judgement; generation is the product. Both answer the same `complete({ system, user, schema })`.
- **Pages are static/SSG — never add `force-dynamic` or runtime filesystem reads.** Vercel's runtime fs is read-only and ephemeral; the *content* write path is exclusively Actions → commit → push. There are still no API routes at all, unlike TrendTracker.
- **Reader feedback is the one exception, and it does not touch that path.** Votes and comments go browser → Supabase → Postgres, under row-level security, from client islands. No server, no API route, no fs. The consequence to remember: tallies are absent from the prerendered HTML and arrive after hydration.
- **`profiles.approved` is enforced in Postgres, never in the UI.** A hidden button proves nothing; the policies re-check every insert, so revoking approval stops writing immediately even on a live session. Test it as `anon` / unapproved / approved with SQL, not by clicking.
- **The Actions job commits to the default branch.** TrendTracker's routine committed to `claude/*` session branches and Vercel only builds `main`, which stranded two weekly reports invisibly. Committing straight to the default branch is why this design can't repeat that.
- **Generation runs on a routine, not the metered API — and pushes straight to `main` too.** Actions stops after `score` and fires a Claude Code routine (`docs/digest-routine-prompt.md`), which does summarize+synthesize as its own reasoning (subscription-billed) rather than an Anthropic API call, then commits the finished month directly to `main` — no PR, no `claude/*` branch. This works here specifically because `main` is unprotected and every commit on it already carries this account's identity: Claude Code checks a directed push and only redirects it to a session branch if the target is protected, has someone else's open PR, or carries a commit authored by someone else. If any of that ever stops being true (a collaborator merges under their own account, branch protection gets turned on), the routine's push would silently fall back to a `claude/*` branch and reintroduce exactly the stranded-report bug the line above describes — which is why the routine's prompt has it verify the push landed on `origin/main` rather than trusting a "success" status.
- **Never unref a timer in `lib/util/throttle.js`.** The refill timer is the only thing holding the event loop open while jobs wait on tokens; unref'ing it lets Node exit mid-run with code 0 and partial results. `test/throttle.test.js` guards this.
- **Strip inline tags before XML parsing, not after.** PubMed embeds `<i>`, `<sub>` etc. inside titles and abstracts; fast-xml-parser splits mixed content into `#text` plus siblings and loses the ordering, silently dropping words. `pubmed.js` strips them from the raw string first.
- **Store title, abstract, metadata, and link only.** No article bodies, no scraping, no paywall circumvention. Sources must be official APIs or RSS.
- **Redirect the CLI with `npm run --silent`.** Without `--silent`, npm prints a two-line banner to stdout ahead of the JSON and the captured artifact does not parse.
- Secrets (`ANTHROPIC_API_KEY`, `NCBI_API_KEY`, optionally `GROQ_API_KEY`) live in Actions secrets and `.env.local` — never committed.

## Environment notes

- **`NODE_USE_ENV_PROXY=1` is set in the npm scripts.** Node's `fetch` ignores `HTTPS_PROXY` by default. Behind a proxy (this dev sandbox, corporate networks) some hosts — the FDA feed in particular — reject the direct path with a 401. The flag is a harmless no-op where no proxy is configured, including GitHub Actions. Run the pipeline via `npm run digest` / `npm run fetch` rather than bare `node scripts/digest.mjs`.
- `NCBI_API_KEY` is optional: without it PubMed is throttled to 3 req/s instead of 10, which is reported as a note in `source_health` rather than failing.

## Working efficiently (session cost)

The whole transcript is re-sent every turn, so cost scales with session length. Without cutting rigor:

- Prefer targeted reads (Grep, or Read with offset/limit) over whole-file reads; don't re-read a file already in context, and don't re-read after an Edit to confirm it (Edit fails loudly if it didn't apply).
- Verify programmatically rather than by screenshot — run the CLI and assert on output.
- Prefer Edit over re-emitting whole blocks; don't paste large code into chat.
- Keep replies concise: what changed and the result, not a blow-by-blow.
