# TODO

## Next session plan

**Phase 6 landed: cross-month memory, reader feedback, and a public repo.** See Status_update.md 2026-08-16 for the full account. State of play:

- `lib/util/history.js` feeds the last `config.history.back` (default 3) months of narratives into all three synthesize prompts, fenced by `CONTINUITY_GUARD`. Untested against real history - no second month exists yet.
- Votes and comments are live on Supabase project `cxghyhwovgbqaljmpahz` (CCPSLitReview). Sign-in is Google + GitHub; `profiles.approved` gates all writing and is flipped by hand in the Supabase table editor.
- Site title, sticky full-width header (title / archive / account / section banner), single-column layout.
- Repo public, proprietary LICENSE.

**Open items before this is finished:**

1. **Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.** Without them the deployed site builds and renders fine but shows no feedback widgets at all - the failure is silent by design, so it will not announce itself.
2. **Add the production URL to Supabase Auth -> URL Configuration** (Site URL + `https://<project>.vercel.app/**` in Redirect URLs). Only `http://localhost:3000/**` has been exercised; sign-in on the deployed site is unverified.
3. **Phase C of the feedback plan is not built:** votes do not yet reach `score.js`. Design is in the approved plan - `lib/feedback.js` loads votes, `buildSystem` gains a READER FEEDBACK block built like `historyBlock`, loaded once per run so the rubric cache stays warm, disabled when the Supabase env vars are absent and halting when they are present but unreadable (no new fail-soft category).
4. **Read the first month that actually has history behind it for invented continuity.** That is the one failure mode of the memory work that tests cannot catch.

## Backlog

- [ ] Optional: an owner-only `/digest/admin` page listing pending readers with an Approve button, gated by an `is_owner` flag and its own RLS policy. The Supabase table editor covers this until the list gets long.
- [ ] Optional: a Supabase database webhook on insert into `profiles`, so a new sign-up notifies you rather than waiting to be noticed.
- [ ] **Inline reference links in prose.** The overview and section synthesis paragraphs mention specific papers by finding but don't link to them — deliberately skipped rather than done with fragile text-matching (see Status_update.md, "restructured into front / section / article pages"). The real fix is upstream: have `synthesize.js` ask the model to tag each reference with the item's id/index as it writes (e.g. inline `[[doi:...]]` markers, or a structured `references: [{ span, id }]` array alongside the prose), then render those as links to the item's `#item-id` anchor on its section page (see the collapsible-item design above — there's no separate article page to link to anymore, just the anchor). Needs a prompt/schema change and a render-time parser; worth a dedicated pass rather than bolting on.
- [ ] Decide whether to keep `biorxiv.mode: 'europepmc-ppr'` (current default) or switch to `'api'` — see PLAN.md §11.1; the Europe PMC route returned 30 preprints across four categories with one request each
- [ ] `NCBI_API_KEY` is unset, so PubMed runs at the unkeyed 3 req/s. Supplying one cuts fetch wall time materially (PubMed is the slowest source at ~4s/category)
- [ ] Optional: a `STYLE_GUIDE.md` for the token set in `app/globals.css`, once a real design pass happens
- [ ] Optional: custom domain on Vercel

## Done (sweep to Status_update.md when this section outgrows the backlog)

- [x] Phase 6: cross-month memory in synthesize, reader votes + comments on Supabase, sticky site header, public repo + LICENSE (2026-08-16)
- [x] Phase 5: /digest and /digest/[month], Top 5, per-category sections, source-health footer (2026-08-14)
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
