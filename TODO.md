# TODO

## Next session plan

**UX improvements landed on `claude/ux-improvements-cn248b`: pill reordering, vote-sorted lists, votes into scoring, @mentions/notifications, comment badges, dark mode.** Not yet merged or deployed. See Status_update.md 2026-08-17 for the full account.

**Before this branch is fully live, in order:**

1. **Apply the four new migrations** to the Supabase project (`category_order`, `comments.category_id`, unique `display_name` + collision-safe `handle_new_user`, `notifications` + its mention trigger). The unique-display-name index will fail to create if any two existing approved readers already share a display name case-insensitively — check for that first and rename one by hand if so.
2. **Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Actions secrets** (same project URL/anon key as the `NEXT_PUBLIC_` ones, just under non-`NEXT_PUBLIC_` names) so `lib/feedback.js` can read `vote_tallies` during the pipeline run. Absent, the feature disables itself rather than failing.
3. **Merge and deploy**, then verify votes/comments/mentions/notifications end to end against the real Supabase project — this session verified against a local build with no Supabase configured (dark mode, pill drag+persist via localStorage, comment badges, and the full test/lint/build suite all passed; nothing that talks to Postgres could be exercised without credentials).
4. **Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel**, still open from Phase 6. Without them the deployed site builds and renders fine but shows no feedback widgets at all — the failure is silent by design.
5. **Add the production URL to Supabase Auth -> URL Configuration** (Site URL + `https://<project>.vercel.app/**` in Redirect URLs), still open from Phase 6. Only `http://localhost:3000/**` has been exercised.
6. **Read the first month that actually has history behind it for invented continuity** (Phase 6 carryover) — the one failure mode neither the history nor the new feedback context can be tested against until a second real month exists.

## Backlog

- [ ] Optional: an owner-only `/digest/admin` page listing pending readers with an Approve button, gated by an `is_owner` flag and its own RLS policy. The Supabase table editor covers this until the list gets long.
- [ ] Optional: a Supabase database webhook on insert into `profiles`, so a new sign-up notifies you rather than waiting to be noticed.
- [ ] **Inline reference links in prose.** The overview and section synthesis paragraphs mention specific papers by finding but don't link to them — deliberately skipped rather than done with fragile text-matching (see Status_update.md, "restructured into front / section / article pages"). The real fix is upstream: have `synthesize.js` ask the model to tag each reference with the item's id/index as it writes (e.g. inline `[[doi:...]]` markers, or a structured `references: [{ span, id }]` array alongside the prose), then render those as links to the item's `#item-id` anchor on its section page (see the collapsible-item design above — there's no separate article page to link to anymore, just the anchor). Needs a prompt/schema change and a render-time parser; worth a dedicated pass rather than bolting on.
- [ ] Decide whether to keep `biorxiv.mode: 'europepmc-ppr'` (current default) or switch to `'api'` — see PLAN.md §11.1; the Europe PMC route returned 30 preprints across four categories with one request each
- [ ] `NCBI_API_KEY` is unset, so PubMed runs at the unkeyed 3 req/s. Supplying one cuts fetch wall time materially (PubMed is the slowest source at ~4s/category)
- [ ] Optional: a `STYLE_GUIDE.md` for the token set in `app/globals.css`, once a real design pass happens
- [ ] Optional: custom domain on Vercel

## Done (sweep to Status_update.md when this section outgrows the backlog)

- [x] Five reader UX improvements: draggable per-reader category order, live vote-sorted item lists, votes feeding score.js (Phase C of the feedback plan), @mentions with a notification bell, comment-count badges, manual dark/light toggle (2026-08-17)
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
