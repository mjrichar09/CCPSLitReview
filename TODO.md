# TODO

## Next session plan

**UX improvements from `claude/ux-improvements-cn248b` are merged and live on `main`** (pill reordering, vote-sorted lists, votes into scoring, @mentions/notifications, comment badges, dark mode, reader engagement — reads/favorites/discussion board, sign-in gate, reaction animations, site search). See Status_update.md for the full account.

**Generation split off Actions onto a Claude Code routine, on `claude/routine-generation-8f3k2p`** — summarize/synthesize now run as the routine's own reasoning (billed to subscription) instead of the metered Anthropic API; Actions stops after `score` and fires the routine. Code and docs are done and verified locally; **the routine itself does not exist yet** and needs one-time manual setup before this actually runs live, in order:

1. **Create the routine** at [claude.ai/code/routines](https://claude.ai/code/routines) — repository `mjrichar09/CCPSLitReview`, model **Opus**, default network access, no schedule trigger. Paste the exact prompt from `docs/digest-routine-prompt.md` into its Instructions box.
2. **Add an API trigger** to the routine (Edit routine → Select a trigger → Add another trigger → API), then **Generate token** and copy it immediately — it's shown once.
3. **Add two Actions secrets**: `DIGEST_ROUTINE_FIRE_URL` (the URL shown alongside the token) and `DIGEST_ROUTINE_FIRE_TOKEN` (the token itself). Absent, Actions still commits `scored.json` every month but warns instead of firing the routine — see the "Fire the generation routine" step in `.github/workflows/digest.yml`.
4. **Merge `claude/routine-generation-8f3k2p` to `main`** once 1-3 are done (or first, if you'd rather verify the workflow changes are live before wiring the routine up — the fire step no-ops cleanly without the secrets either way).
5. **Verify end to end** on the next real scheduled run (2nd of the month, 06:17 UTC): confirm Actions stops at `score` and fires the routine, the routine's run shows up at claude.ai/code/routines, and the finished month lands as a commit on `main` authored by the routine (not a stranded `claude/*` branch — check `git log origin/main` directly, don't just trust the routine's own "success").
6. Until then, a manual `workflow_dispatch` with `stage: all` still runs the complete metered pipeline as a fallback — nothing about the split blocks that path.

## Backlog

- [ ] Optional: an owner-only `/digest/admin` page listing pending readers with an Approve button, gated by an `is_owner` flag and its own RLS policy. The Supabase table editor covers this until the list gets long.
- [ ] **Inline reference links in prose.** The overview and section synthesis paragraphs mention specific papers by finding but don't link to them — deliberately skipped rather than done with fragile text-matching (see Status_update.md, "restructured into front / section / article pages"). The real fix is upstream: have `synthesize.js` ask the model to tag each reference with the item's id/index as it writes (e.g. inline `[[doi:...]]` markers, or a structured `references: [{ span, id }]` array alongside the prose), then render those as links to the item's `#item-id` anchor on its section page (see the collapsible-item design above — there's no separate article page to link to anymore, just the anchor). Needs a prompt/schema change and a render-time parser; worth a dedicated pass rather than bolting on.
- [ ] Decide whether to keep `biorxiv.mode: 'europepmc-ppr'` (current default) or switch to `'api'` — see PLAN.md §11.1; the Europe PMC route returned 30 preprints across four categories with one request each
- [ ] `NCBI_API_KEY` is unset, so PubMed runs at the unkeyed 3 req/s. Supplying one cuts fetch wall time materially (PubMed is the slowest source at ~4s/category)
- [ ] Optional: a `STYLE_GUIDE.md` for the token set in `app/globals.css`, once a real design pass happens
- [ ] Optional: custom domain on Vercel

## Done (sweep to Status_update.md when this section outgrows the backlog)

- [x] Push notification on new sign-up via a `pg_net` trigger on `profiles` insert -> ntfy.sh, so a pending approval doesn't wait to be noticed (2026-08-19)
- [x] Real sign-in gate: `proxy.js` (Next 16's renamed Middleware) blocks every `/digest/**` request unless signed in and approved, landing page at `/` (2026-08-18)
- [x] Per-reader read marks, favorites + `/digest/favorites`, cross-month discussion board at `/digest/discussion` (2026-08-18)
- [x] Fixed @mention notifications (the matching regex never actually matched a real display name) and added comment edit/delete (2026-08-18)
- [x] Fixed vote-based sorting (two layered bugs: `Children.toArray` key mangling, then `ItemRow` being a Server Component so `item` never reached the client as a prop) (2026-08-18)
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
