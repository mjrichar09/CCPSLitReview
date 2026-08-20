# CCPSLitReview generation routine — prompt

This is the exact text to paste into the routine's Instructions box at
claude.ai/code/routines. It is versioned here (not only pasted into the web
UI) because its exact wording is load-bearing — see `TODO.md` for the
one-time setup steps and `CLAUDE.md`'s "Generation runs on a routine"
invariant for why this exists at all.

Routine settings: repository `mjrichar09/CCPSLitReview`, model **Opus**,
default (Trusted) network access, trigger **API** only (no schedule — Actions
decides timing by firing this after it commits `scored.json`).

---

## Prompt text

You generate one month of the CCPSLitReview digest — the summarize and
synthesize stages — and commit the result straight to `main`. Everything
mechanical (which papers survive, their category caps, dedup, reading order,
cross-month history) is already done for you by code you run; your job is
only the writing: per-paper summaries, per-category narratives, the Top-5
picks, and the month's opening paragraph.

### 1. Find the target month

You were fired with a payload in the form `month=2026-09` inside a
`<routine-fire-payload>` block — use that month. If you were run manually
with no payload (e.g. "Run now" with no text), find it yourself: look at
`data/digest/staging/*/scored.json` and `data/digest/*.json`, and pick the
newest staging month that has a `scored.json` but no corresponding
`data/digest/<month>.json` yet. If every staged month already has a
published report, there is nothing to do — say so and stop; this is not a
failure.

### 2. Prepare your input

Run:

```
npm ci
node scripts/prep-for-routine.mjs --month <month>
```

This reads the committed `data/digest/staging/<month>/scored.json` and
writes `data/digest/staging/<month>/routine-input.json` — every distinct
paper you need to write about, already capped per category and deduped
(collapsed to one entry per paper, carrying every category it survived in as
`scored_in`), already grouped by category in the correct reading order, plus
cross-month history for continuity. Read that file now. Its shape:

```
{
  month, top_items_wanted,
  categories: [{ id, name, scope }],
  by_category: { "<category id>": [paper indices, in reading order] },
  papers: [{ index, external_id, title, authors, venue, published, url, doi,
             abstract, is_preprint, relevance, is_recurring, previously_seen,
             sources, scored_for, categories, scored_in }],
  history: {
    months: [...],
    by_category: { "<category id>": [{ month, synthesis }, ...] },   // oldest last
    overviews: [{ month, summary, top: [{ title, reason }] }]        // newest first
  },
  health
}
```

Do not re-derive any of this (the cap, the dedup, the sort order) yourself —
it is already correct. Your only inputs from here on are `papers`,
`by_category`, `categories`, and `history`.

### 3. Write the per-paper summaries

For every paper in `papers`, write:

- **summary**: 2-3 sentences, technical and specific. Lead with what was
  actually done and what was found — titers, fold-changes, conditions,
  scales, mechanisms. Numbers where the abstract gives them. No
  throat-clearing ("This study investigates…"), no restating the title.
- **why_it_matters**: ONE sentence, written for this reader's job (an
  upstream CHO cell culture process development and CMC scientist — assume
  deep domain fluency, never explain what a bioreactor, a fed-batch, a CQA
  or an HCP is). What would they do differently, watch for, or reconsider?
  If the honest answer is "nothing yet, but it signals a direction," say
  that plainly.
- **thin_abstract**: `true` when the paper's `abstract` field is absent or
  too thin to support a real summary.

Hard rule: never invent a finding not in the abstract you were given. If the
abstract is thin, set `thin_abstract: true`, keep the summary to what is
actually supported, and say what is not known. A confidently wrong summary
is far worse here than an admittedly thin one — this reader acts on these.
Trade press and regulatory notices are not papers — summarise what was
announced or published and by whom; do not dress a press release up as a
result.

Write every summary and why_it_matters in **plain ASCII**. Use a hyphen for
ranges (e.g. `1.6-7.4-fold`, `2012-2025`); do not use en or em dashes.

You must produce exactly one summary entry for **every** paper index in
`papers` — no skipping one because it seems marginal. A missing summary is
a failure, not an omission (see step 5).

### 4. Write the category narratives, Top 5, and overview

For **every** category id present in `by_category` (a category with no
surviving papers is simply absent — do not invent an empty section for it),
using that category's papers in the exact order given by `by_category[id]`:

- Write 3-5 sentences covering the through-line of the month in this
  category: what connects these items, what extends prior work, and above
  all what *contradicts* it. Name the specific papers by their finding, not
  by citation. If the items have no through-line, say that rather than
  inventing one — "Three unrelated results, of which the perfusion media
  work is the one worth reading" is a good answer. No preamble, no list,
  prose only.
- If `history.by_category[id]` has entries (oldest last), you have prior
  months' narratives for this category. Reference them **only** when this
  month's items genuinely extend, reverse, or leave unresolved something
  stated before, and say which. If there is no real connection, say nothing
  about previous months at all — an invented "building on last month's
  finding" is a factual error, not a stylistic one.

Then, across **all** categories together, pick the Top `top_items_wanted`
items of the month: rank on what would change this reader's thinking, not
on venue prestige or how comprehensive the work is. A result that
contradicts current practice outranks a thorough confirmation of it. A
preprint that matters outranks a journal paper that does not. Spread across
categories unless one area genuinely dominated the month. Return each pick
as `{ id: <external_id>, reason: <one line> }`, most important first — `id`
must be an `external_id` that actually appears in `papers` (an id you invent
will simply be dropped downstream, wasting the slot, so only use real ones).
If `history.overviews` has entries with a non-empty `top`, a theme shown
recently needs to earn its slot again — prefer the item that moves a theme
on to the item that restates it; this is a tiebreaker, not a ban.

Finally, write the month's opening paragraph: 4-6 sentences, one paragraph.
Say what actually happened this month — the through-line, what shifted,
what contradicted prior practice. Name specifics. If the month was quiet,
say so; a manufactured theme is worse than an honest "nothing moved much
this month, though X is worth watching." No greeting, no sign-off, no "in
this issue" — start with the substance. If `history.overviews` is
non-empty, do not re-announce a theme the reader already read about last
time — either say what moved it this month or leave it out; comparisons
across months ("quieter than July", "the third month running without X")
are welcome where true.

Plain ASCII throughout, same rule as step 3.

### 5. Write and validate your output

Write `data/digest/staging/<month>/routine-output.json` in exactly this
shape — nothing more, nothing less:

```json
{
  "summaries": [
    { "index": 0, "summary": "...", "why_it_matters": "...", "thin_abstract": false }
  ],
  "narratives": [
    { "id": "upstream_pd", "synthesis": "..." }
  ],
  "top": [
    { "id": "doi:10.1234/xyz", "reason": "..." }
  ],
  "overview": "..."
}
```

Then run:

```
node scripts/finalize-routine-output.mjs --month <month>
```

This checks your output for completeness (every paper has a summary, every
populated category has a narrative, every field is non-empty), constrains
your Top picks to ids that actually exist, and — only if everything
checks out — assembles `summarized.json` and `synthesized.json` and writes
them to the same staging directory. **If this command exits non-zero, stop
here.** Read its error, fix whatever it flagged in `routine-output.json`,
and re-run it. Do not proceed to step 6 on a failure, and do not try to
hand-assemble the final report yourself if it keeps failing — see step 8.

### 6. Assemble and write the month

```
node scripts/digest.mjs --stage write --from-stage write --month <month>
```

This is pure deterministic assembly (no LLM call, no network) — it reads
`synthesized.json`, writes `data/digest/<month>.json`, and advances the
dedupe ledger. If this fails, stop here and go to step 8; do not commit
whatever partial state exists.

### 7. Commit and push straight to `main`

```
git add data/digest
git commit -m "digest: <month>"
git push origin HEAD:main
```

**Push directly to `main` — not a pull request, not a `claude/`-prefixed
branch.** This is a deliberate instruction, not an oversight: `main` is
unprotected and every commit on it already carries this account's identity,
so a direct push is expected to succeed. This matters because a routine
that pushed to its default `claude/*` branch here would silently strand the
report — the site only deploys from `main`, so a report that lands anywhere
else was written but never published, with nothing telling you so. That is
exactly the failure this project's Actions-based pipeline was built to
avoid, and it is exactly what could happen again if this step is skipped or
weakened.

After pushing, **verify it actually landed** — do not trust a "success"
message alone:

```
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
```

Both must print the same commit hash. If they don't — the push was
rejected, redirected, or something else is on `main` now — this is a
failure. Go to step 8. Do not report success.

### 8. On any failure

If step 5, 6, or 7 fails and you cannot resolve it: do not commit or push
anything. Open or update a GitHub issue on `mjrichar09/CCPSLitReview` labeled
`digest-failure` (reuse the existing open one if there is one, the same way
the Actions workflow does, rather than opening a duplicate) explaining
which step failed and why, with enough detail that a human can pick up from
there. End the run there — do not silently finish.

### On success

Report, briefly, what you did: the month, how many papers, how many
category narratives, and confirmation that the commit landed on `origin/main`
(the hash from step 7's verification).
