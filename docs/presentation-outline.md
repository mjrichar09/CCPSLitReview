# CCPSLitReview — presentation outline

For an internal AI group. Target: **35 minutes + 10 Q&A**. Adjust by cutting
§6 (war stories) to two items and dropping §8.

**Framing decision to make before you build slides:** this audience does not
care about CHO cells. They care about *what it takes to put an LLM in a
production loop nobody babysits*. So the biology is the setting, not the
subject. Every section below is written to answer "what would I steal from
this for my own project?"

**One-sentence pitch:** a scheduled job reads ~1,900 papers a month across
eleven bioprocessing topics, uses an LLM to throw away 94% of them against
written rubrics, has a second model write the survivors up, and commits a
static site — for about $2 a month and zero human steps.

---

## 1. Cold open — the problem (2 min)

- One expert reader. Eleven topic areas. The literature that actually matters
  is maybe 60 papers a month, scattered across PubMed, Europe PMC, bioRxiv,
  arXiv, Crossref, FDA and trade press.
- Nobody reads eleven weekly alert emails. The failure mode of every
  literature alert is *volume*, not *coverage*.
- The interesting reframe: **this is not a search problem, it is a judgement
  problem at a volume no human will sustain.** That is a specific shape of
  LLM problem, and it is very common — most "AI for X" projects at work are
  probably this shape and are being built as chatbots instead.

*Slide: the funnel, as a single visual, with the real numbers from §7. Put it
up early; you will refer back to it four times.*

---

## 2. Demo first (4-5 min)

Show the running site before any architecture. Live, not screenshots.

1. The latest month — editorial overview, then Top 5 across all categories.
2. One category section: synthesis paragraph, then papers with `summary` +
   `why_it_matters`.
3. Point out a **"recurring"** marker and a cross-month reference in the prose
   ("the constructive sequel to last month's negative result on Raman transfer
   learning") — this is the memory story in §5.5, plant it now.
4. The archive, and the `source_health` footer. Say out loud: *the footer is
   the honesty mechanism; silence is never evidence a source worked.*
5. Reader feedback: votes/comments, and the sign-in gate.

*Do not narrate the architecture during the demo.* Let them wonder how it
works; §3 is the payoff.

---

## 3. The architecture in one slide (6 min)

Six stages, each writing an artifact the next one reads:

```
fetch → normalize → score → [prep] → summarize → synthesize → write
  6 adapters      LLM gate         LLM writing        one JSON file
```

Points to land:

- **Adapters are boring on purpose.** Six sources, one interface returning
  `{records, health}`. No LLM anywhere in stage 1-2.
- **Stages are resumable.** Each stage reads its predecessor's artifact from
  disk if it exists. A mid-pipeline failure costs no re-fetching and — the
  part that matters — **no re-spending on tokens already spent.**
- **The output is a flat JSON file committed to git.** No database. The site
  is statically generated at build time; there are no API routes at all.
  Content write path is exclusively *Actions → commit → push → Vercel
  rebuild*.
- **Config is the product surface.** Adding a topic area is one object in
  `config/digest.config.js` — id, display name, cap, a prose rubric, per-source
  queries. No code change. Show that object on screen; it is the most
  copy-able idea in the talk.

*Slide: the pipeline diagram with the LLM stages highlighted in a different
color, so the "where is the model and where is it deliberately not" line
reads visually.*

---

## 4. The core idea: LLM as a gate, not as an oracle (7 min)

This is the technical heart of the talk. Spend real time here.

**4.1 The scoring gate.** ~510-1,039 category-level judgements a month.
One call per category per batch of items, items keyed by index, strict JSON
schema, 0-5 against a rubric, keep at ≥3.

**4.2 The rubric is config, written for the model, not for a human.**
Show `modeling_ml`'s rubric, which explicitly demands an actual bioprocess
application rather than a passing mention — because that category was a false
positive machine until the rubric said so. *Prompt engineering here is
product work, and it lives in a config file under version control, not in a
notebook.*

**4.3 The invariant worth stealing: a missing verdict halts the run.**
An item the model skipped and an item the model judged irrelevant are
indistinguishable downstream. The code refuses to guess. This is one line of
policy that converts a silent quality leak into a loud failure.

**4.4 Category boundaries are testable.** A CHO bispecific single-cell-cloning
paper scored **2 under `upstream_pd` and 5 under `cell_line_dev`** — exactly
the boundary the rubric spells out ("if the lever is the cell line, it belongs
here"). That is the closest thing to a unit test for a rubric, and it is how
you know the rubric is doing work rather than the model doing vibes.

**4.5 Spot-checking, honestly.** Score distribution on a real month across
1,039 judgements: `0→621, 1→127, 2→111, 3→79, 4→63, 5→38`. The zeros are real
noise the wide net drags in — microplastics in sludge, CO2 catalysis,
cosmetics keratinocytes. The twos are defensible near-misses. Say plainly:
**the wide query net is intentional and the gate is what makes it affordable.**

*Audience hook: ask them how they would validate a classifier with no labeled
set. Then show this — read the extremes, and design one boundary case whose
correct answer the rubric already states.*

---

## 5. Five design decisions worth arguing about (8 min)

Pick three if you are running long. 5.3 and 5.4 are the ones this audience
will not have seen elsewhere.

**5.1 Provider is per-stage, not global.** `models.<stage>.provider`. Scoring
is high-volume bounded judgement; generation is the product. Both answer the
same `complete({system, user, schema})`. Switching a stage is a config edit
and a workflow input, not a refactor.

**5.2 Cost turned out to be the wrong axis.** The whole point of the provider
seam was a Groq-vs-Anthropic bake-off. Measured result: a month costs
**$2.34** total. Moving scoring to a cheap open model saves about **$0.33 a
month.** Conclusion on the slide, in large type: *there was no cost problem;
choose on quality.* The seam still earned its keep — it made the question
answerable with evidence instead of estimates.

**5.3 Metered API vs. subscription agent.** Summarize + synthesize moved off
the Anthropic API onto a **Claude Code routine**: Actions runs the pipeline,
stops after `score`, commits `scored.json`, then fires the routine, which does
the writing as its own reasoning and commits the finished month. Same work,
billed to a subscription rather than per token — the August month cost $2.34
metered; the September month's `run_stats` reads **$0.00** because generation
happened outside the meter.
  - The non-obvious engineering: the routine's *input is prepared
    deterministically* (`prep-for-routine.mjs`) and its *output is validated
    deterministically* (`finalize-routine-output.mjs`). The agent is handed
    exactly the papers, in exactly the reading order, with the caps and dedup
    already applied, and told: do not re-derive any of this, only write.
  - **Generalizable rule: agents are for the judgement, code is for the
    bookkeeping.** Every time you let an agent re-derive something code
    already knows, you buy nondeterminism you did not need.

**5.4 The failure mode inherited from the reference project.** The project this
repo was ported from ran its generation as a cloud routine that pushed to
generated `claude/*` session branches — and the deploy only builds `main`. Two
weekly reports were written, committed, and **never deployed.** Nobody
noticed. So: Actions commits to the default branch, and the routine's prompt
explicitly tells it to *verify the push landed on `origin/main`* rather than
trusting its own "success" status.
  - **The talk's best single line: an agent reporting success is not evidence
    the effect happened. Verify the effect, not the status.**

**5.5 Cross-month memory.** Synthesize receives prior months' per-category
syntheses and overviews, so it can write "this is the constructive sequel to
last month's negative result" — and `is_recurring` has a precise definition
(seen before, but under a category it has *not* been reported under; items
whose categories were all covered are dropped outright). Memory here is a
committed JSON ledger, not a vector store. Say that out loud; somebody will
have assumed embeddings.

---

## 6. What actually broke (6 min — the part people remember)

Pick 3-4. Ordered by how well they play to an AI audience.

1. **Groq never scored a single item — four dispatches, three real bugs, none
   of them Groq's.** The free tier caps at 8,000 tokens/minute; one 8-item
   batch requests 11,305. The chain of wrong diagnoses is the lesson: a 413
   read as a payload cap (wrong — it was TPM); an opaque `400` that was only
   opaque because the error body was being thrown away and only `err.message`
   logged; and a `json_validate_failed` with an empty `failed_generation`,
   which was not a schema problem at all — gpt-oss spent the completion budget
   on *reasoning* before emitting any content. **Raising the budget enough for
   reasoning is what finally surfaced the real TPM limit.** Two limits pulling
   against each other: too small a budget truncates, too large a request is
   refused.
   - Takeaway: **log the provider's response body.** Fix #2 is what made
     everything after it diagnosable in one round instead of by guesswork.
2. **I reported two run times that were simply wrong**, inferred from my own
   `sleep` calls in a container that suspends between turns — once concluding
   a provider was "slow" when two minutes had actually elapsed. Read the
   platform's `started_at`. Good self-deprecating beat, and a real lesson
   about agent-reported measurements.
3. **Prompt caching was a silent no-op.** Both cache counters read `0` for a
   month. The cacheable-prefix minimum is 2,048 tokens; the scoring system
   prompt is ~1k, so `cache_control` was being ignored. Forgone saving: ~$0.04
   a month. The fix was *not* to pad the prompt — it was to stop believing the
   code comment. **This is why usage accounting reports cache tokens
   separately: so an optimization can be caught not working.**
4. **Text encoding, twice.** PubMed embeds `<i>`/`<sub>` inside titles;
   the XML parser splits mixed content and silently *drops words* unless you
   strip inline tags from the raw string first. And undecoded entities reached
   the live site as `What&#8217;s`. Both now have dedicated tests. Unglamorous,
   universal, and the audience will nod.
5. **A `:target` CSS deep-link that worked on refresh and never in the app** —
   client-side routing changes the URL through the History API, which never
   re-fires `:target`. Cut this unless the audience is web-heavy.

*Slide suggestion: one slide, "four wrong diagnoses and the fix that made the
fifth possible" — the Groq chain as a little detective story.*

---

## 7. The numbers (2 min)

Put these on one table. They are the credibility slide.

| | |
|---|---|
| Sources | 6 adapters + 5 RSS feeds |
| Topic areas | 11, each with its own rubric and per-source queries |
| Fetched, one month | ~1,900 records → 754 unique after dedupe |
| Judgements | 1,039 category-level, 180 kept at threshold 3 |
| Published | 112 items (Aug), 64 (Sep) |
| Cost, fully metered | **$2.34/month** — $0.65 score, $0.80 summarize, $0.89 synthesize |
| Cost, current split | scoring only, **$0.29** — generation is subscription-billed |
| Per kept item | $0.0036 to score |
| Scoring wall time | 4m57s (48 calls, concurrency 4, two waves) |
| Code | ~9,700 lines JS, 123 tests, no network or LLM calls in the suite |
| Human steps per month | zero |

Two footnotes worth saying aloud:
- Concurrency is **two waves, not a flat pool** — wave one is the first batch
  of every category, because those are the calls that write the rubric cache;
  a flat pool fires same-category batches together and each one misses.
- Verdicts are applied **in batch order, never completion order**, so
  concurrency cannot change the report. There is a test with a deliberately
  out-of-order provider pinning that.

---

## 8. How it was built (2 min — optional, but this group will ask)

- Written almost entirely with Claude Code, in phases, stopping for review
  after each.
- The repo carries its own institutional memory: `CLAUDE.md` (invariants),
  `PLAN.md` (decisions), `TODO.md` (next session), `Status_update.md` (one
  entry per session). The invariants file is the interesting artifact — it is
  a list of *things that would otherwise be re-derived or re-broken*, each
  with the reason attached.
- Show one invariant verbatim. Suggested: "Never unref the refill timer in
  `throttle.js` — it is the only thing holding the event loop open while jobs
  wait on tokens; unref'ing lets Node exit mid-run with code 0 and partial
  results." That is a bug that would have cost someone a day, written down
  once, with a test guarding it.
- **Point for the group: the durable output of agent-assisted work is not the
  code, it is the written-down reasons.**

---

## 9. Takeaways (2 min)

Five lines, no elaboration — they are all now earned by the talk:

1. Put the model where the judgement is; let code do the bookkeeping.
2. Write the rubric for the model, keep it in config, version it.
3. Make a skipped answer a loud failure, never a silent drop.
4. Measure cost before optimizing it — you will usually find there is nothing
   there, and then you can choose on quality.
5. An agent's "success" is not evidence of the effect. Verify the effect.

---

## 10. Q&A — prepare these

- **"Why not RAG / a vector database?"** There is nothing to retrieve over.
  The corpus is a month's fixed candidate set and the task is judgement over
  every item, not recall of a few. Memory across months is a committed JSON
  ledger, which is inspectable in a diff.
- **"How do you know the summaries aren't confabulated?"** Prompts forbid
  findings not present in the abstract and require saying an abstract is thin
  rather than speculating; `thin_abstract` is a field on every item. Beyond
  that: the single reader is a domain expert who would catch it, and can vote
  and comment on individual papers. Be honest that there is no automated
  hallucination check — that is a real gap.
- **"What about paywalls / copyright?"** Title, abstract, metadata and link
  only. No article bodies, no scraping. Official APIs and RSS only. This is a
  stated invariant, not an accident.
- **"Why JSON files in git and not a database?"** Diffable, reviewable,
  free, and it makes the deploy a `git push`. The read layer is three
  functions. Volume is ~100 items/month.
- **"Does the reader feedback change the scoring?"** Votes feed into scoring
  as of one session; the fuller closed loop (votes reweighting rubrics) is
  designed and not built. Do not oversell this.
- **"What would you do differently?"** Have an answer ready. Candidates:
  build the cost instrumentation before the provider abstraction (the numbers
  would have told you not to build the abstraction for cost reasons); write
  the per-stage artifacts from day one; and don't trust a code comment
  describing an optimization — assert on the counter.

---

## Appendix — slide-count sketch

| § | Slides | Minutes |
|---|---|---|
| 1 Problem | 2 | 2 |
| 2 Demo | 0 (live) | 5 |
| 3 Architecture | 2 | 6 |
| 4 LLM as gate | 4 | 7 |
| 5 Design decisions | 5 | 8 |
| 6 War stories | 3 | 6 |
| 7 Numbers | 1 | 2 |
| 8 How it was built | 1 | 2 |
| 9 Takeaways | 1 | 2 |
| | **19** | **40** |

Have a backup screenshot of the site. Never demo live without one.
