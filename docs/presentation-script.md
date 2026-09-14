# CCPSLitReview — demo script

A talk built around the live site, not around slides. Roughly **25 minutes +
Q&A**. The product is the spine; the engineering lessons are woven in as
asides at the moments the screen already makes them obvious.

**Format:** `DO` is what's on screen. `SAY` is speakable — the lines in quotes
are written to be said out loud, not read silently. `ASIDE` is the lesson to
drop in at that moment. `IF ASKED` is a ready answer you don't volunteer.

You do not need slides for this. If you want exactly one, see [The one
optional slide](#the-one-optional-slide) at the end.

---

## Before you start

- [ ] **Signed in already**, on the digest, at the latest month. Never open a
      talk on a login screen.
- [ ] Browser zoom at **125-150%**. What's readable on your laptop is not
      readable from the back of a conference room.
- [ ] Close every other tab. Notifications off, Slack quit.
- [ ] **Second tab**: the repo on GitHub, on `data/digest/2026-09.json`. You'll
      switch to it once, for fifteen seconds, in Act III.
- [ ] **Screenshots as backup** — capture these five in advance, in a folder,
      in order: the month overview, the Top 5, one category section, one
      expanded paper card, the source-health footer. If the site is down or
      the wifi dies, you present from these and barely break stride.
- [ ] Decide your example paper in advance. Defaults below use the September
      month; **swap in whatever the current month has** — a live example you
      can speak to fluently beats a stale one you memorized.
- [ ] Know the URL you'll be on: `<your site URL>/digest`.

---

## Act I — What it is (6 min)

### Beat 1 · Cold open, site already on screen (1 min)

`DO` The latest month, top of page. Say nothing for three seconds and let
them read the headline.

`SAY`
> "This is every paper worth reading in my field last month. There are about
> sixty of them. They came out of roughly nineteen hundred that weren't.
>
> Nobody wrote this page. It wrote itself on the second of the month, and it
> cost about two dollars."

`SAY`
> "I want to show you the thing first, and then tell you how it works —
> because the how is honestly the boring part, and that's sort of the point."

---

### Beat 2 · The problem, stated fast (1.5 min)

`DO` Stay on the page. Don't click anything yet.

`SAY`
> "I follow eleven topic areas — cell culture, analytics, regulatory, industry
> news. If I set up a literature alert for each one, I get eleven emails a
> week, and within a month I stop opening all of them.
>
> That's the actual failure mode. Not that alerts miss things — they don't.
> It's that they send everything, so the filtering lands on me, every week,
> forever. And I don't do it."

`SAY` — the reframe, slowly:
> "Which means this was never a search problem. Search already works. It's a
> *judgment* problem — thousands of small calls, each one easy for an expert,
> all of them together impossible. That shape is the whole reason there's a
> language model in here."

`ASIDE` — worth saying once, to this audience:
> "I'd argue a lot of 'AI for X' projects are actually that shape, and get
> built as chatbots instead."

---

### Beat 3 · The opening paragraph (3.5 min)

`DO` Scroll slowly through the month's opening paragraph. Let them see it's
real prose, not a bulleted list.

`SAY`
> "Every month opens with a paragraph about what the month was *about*. Not a
> summary of what was published — an argument about the throughline."

`DO` Point at a specific sentence. In September: the TPT1 / feed-enrichment /
perfusion trio — three results that partition growth, survival and
productivity three different ways.

`SAY`
> "Three separate papers, three different labs, no connection between them —
> and this noticed they're all making the same argument from different
> directions. That's the part I couldn't get from an alert."

`DO` Now scroll to a cross-month reference. In September: *"Read against
August's finding that titer gains driven by integral viable cell time strip
galactosylation, the TPT1 result is a real counterexample."*

`SAY` — this is your best single moment in the whole demo:
> "Look at this sentence. It's arguing with last month. It remembers what it
> told me in August and it's flagging that this month's result cuts against
> it.
>
> And here —" *(point to the Raman line)* "— it says August's negative result
> on Raman transfer learning just got its constructive answer. That thread
> gets picked back up a month later."

`ASIDE`
> "Under the hood that's not clever. Each month's write-up is handed the
> previous months' summaries as input. It's memory in the dumbest possible
> sense — a JSON file — and it's most of what makes this feel like a person
> wrote it."

`IF ASKED` *"Is that a vector database?"* — No. There's nothing to retrieve
over. It's a fixed set of papers each month, and the previous months get
passed in wholesale. Roughly a hundred items a month; you don't need
infrastructure for that.

---

## Act II — The product proper (10 min)

### Beat 4 · Top 5 (2.5 min)

`DO` Scroll to **"Top 5 this month."**

`SAY`
> "If I read nothing else, I read these. And each one comes with a sentence
> saying why it made the cut."

`DO` Read one aloud — the TPT1 one works well:
> *"A single-cassette host lever that raised titers in CHO monoclonal and
> bispecific platforms through culture longevity alone, beating BCL-2 and
> matching a BAK/BAX double knockout, with cell-specific productivity and the
> glycan profile both unchanged."*

`SAY`
> "That's the level I need. It's not 'this paper is about CHO cells.' It's
> what the lever was, what it beat, and what didn't get worse — which is the
> thing that usually kills a result like this."

`SAY` — the honest bit, say it before anyone asks:
> "It only ever sees the title and abstract. No full text, no scraping, no
> paywalls. Everything it says has to be in the abstract, and it's told to
> flag a thin abstract rather than guess at what's missing."

---

### Beat 5 · A category section (4 min)

`DO` Click into a category with real depth. **Product Quality** (12 items) or
**Cell Line Development** (8) are the good ones. Show the short narrative
paragraph at the top first.

`SAY`
> "Every topic gets its own paragraph before the papers — what happened in
> this area this month, as a story rather than a list."

`DO` Now scroll to the individual papers. Stop on one and walk the parts.

`SAY`
> "And then each paper has the same two things. What was done —" *(point at
> the summary)* "— with the actual numbers, conditions, scale. And then this
> second line, which is the one I actually care about: why it matters **to
> me**, in my job. Not why it matters in general."

`DO` Point out the supporting furniture, quickly — don't dwell:
- the relevance score
- the "recurring" marker on a paper seen before under a different topic
- the source badges — the same paper found via two different databases
- the link out to the real paper

`SAY`
> "Every claim on this page links back to the actual paper. Nothing here asks
> you to take its word for it."

`ASIDE` — the design point, if you want one here:
> "Which topic a paper lands in is decided by a paragraph I wrote describing
> what that topic covers, in plain English. When a topic starts dragging in
> junk, I fix the paragraph. I've never had to change the program."

---

### Beat 6 · The negative result (1.5 min)

This beat is the most persuasive thing in the demo. Don't skip it.

`DO` Navigate to the lectin-profiling paper (Top 5, #2 in September).

`SAY`
> "I want to show you one specific paper, because it's the kind of thing a
> keyword alert would never put in front of me.
>
> This result is *negative*. Lectin surface profiling tracks product glycans
> for two knockouts — and then fails for galactosylation and sialylation.
> Which means the cheap clone-screening shortcut everybody wants doesn't
> work."

`SAY`
> "That's genuinely valuable to me. It's a thing I now won't spend a quarter
> trying. And the system surfaced it as a top-five result *because* it closes
> a door — not despite it."

---

### Beat 7 · It's not read-only (2 min)

`DO` Vote on a paper. Favorite one. Mark one read. Let the small animations
play — they're fun and they land.

`SAY`
> "It's a digest, but it isn't a dead page. I can vote papers up, favorite
> them, mark them read."

`DO` Open a comment thread. If you have a real comment with an @mention, show
it. Then the **Discussion** page in the header.

`SAY`
> "Comments thread per paper, and there's a cross-month discussion board that
> collects them. A handful of approved colleagues can get accounts."

`DO` Use the search box. Search something you know returns results —
`Raman`, or `perfusion`.

`SAY`
> "And search runs across every month, so the archive is actually usable and
> not just a pile."

`ASIDE` — only if the group is technical enough to enjoy it:
> "Access is enforced in the database, not in the interface. Hiding a button
> proves nothing — if I revoke someone's approval, their writes stop
> immediately, mid-session. Worth doing that way from the start; it's very
> annoying to retrofit."

---

## Act III — How it works, briefly (5 min)

### Beat 8 · The honesty footer (1.5 min)

`DO` Scroll to the very bottom. **Source health.**

`SAY`
> "Last thing on the page, and it's my favorite. Every source, every topic,
> whether it worked, how many it returned, how long it took.
>
> The reason this is here: if a source quietly dies, the month still
> publishes. It just publishes *less*. And a quiet month and a broken pipe
> look exactly the same from the outside."

`ASIDE` — say this one deliberately, it's the best lesson in the talk:
> "Silence is never evidence that something worked. If a failure can look like
> a quiet month, you need a place on the page where it can't hide."

---

### Beat 9 · The machine, in ninety seconds (2 min)

`DO` Switch to your second tab: the repo, on the month's JSON file. Scroll it
for a few seconds.

`SAY`
> "Here's the whole product. One file per month, committed to a git repo.
> There's no database, no server, no API. A scheduled job writes this file
> once a month and the site rebuilds from it."

`SAY` — the pipeline, on your fingers, no diagram needed:
> "Six steps. Collect from six sources. Dedupe and clean up. **Score.**
> Prepare. **Write.** Publish.
>
> Only two of those involve a language model — scoring and writing. The other
> four are ordinary code, deliberately."

`SAY` — the scoring step, plainly:
> "Scoring is the filter, and it's simpler than people expect. It gets a batch
> of papers plus the paragraph describing a topic, and returns a number from
> zero to five for each one. Below three, gone. Nineteen hundred in, about a
> hundred out. No fine-tuning, no embeddings, no vector database — a prompt, a
> batch, and a number."

`DO` Back to the site.

---

### Beat 10 · The numbers (1.5 min)

`SAY`
> "Cost, since someone always asks. About **two dollars and thirty cents** a
> month, all in, at full price. Five minutes of compute. Zero human steps.
>
> And a confession: I built a whole mechanism to move the filtering onto a
> cheaper model, and then measured it. It would have saved thirty-three cents
> a month."

`SAY` — the lesson, which is the good part:
> "There was no cost problem. I'd spent effort optimizing a number I'd never
> looked at. Once I measured it, the decision stopped being about budget and
> became about quality — which is the conversation I should have been having
> the whole time."

`ASIDE` — model choice, one line:
> "Cheap fast model for the filtering, because it's a thousand narrow
> judgments a month. Strongest model available for the writing, because that
> part is the product and I'd notice immediately if it got worse."

---

## Act IV — Close (3 min)

### Beat 11 · The three things that went wrong (2 min)

Pick **one or two**, not all three. The third is the best.

**1 — The four wrong diagnoses.** Four attempts at a cheaper provider, zero
papers scored. I misread the error three times; the real limit only became
visible after a "fix" made the request bigger. Root cause of the confusion:
we were throwing away the provider's error message and logging a one-line
summary. *Log the whole response.*

**2 — The optimization that never ran.** A caching setting meant to cut costs
did nothing for a month — our prompt was just under the minimum size for it to
apply, so it was silently ignored. Caught it only because we report cache usage
as its own number. *Measure the optimization; don't trust the comment next to
it.*

**3 — The reports nobody saw.** On an earlier project, two finished reports
were written and committed — to the wrong branch. The site only builds one
branch. Nothing errored, nothing alerted, nobody noticed for two weeks.

`SAY` — after #3:
> "So now the job checks that the result actually landed, instead of trusting
> the word 'success.' Which is the thing I'd most want you to take away, and
> it's got nothing to do with literature:
>
> **'Done' is not evidence that it happened.** True of a scheduled job, true
> of a model, true of an agent. Check the effect — the file exists, the page
> changed — not the status it reported about itself."

---

### Beat 12 · Land it (1 min)

`DO` Back on the month overview, where you started.

`SAY`
> "So — one page a month, sixty papers out of nineteen hundred, two dollars,
> and nobody touches it.
>
> The transferable part isn't the biology. It's that this is a pile of small
> judgments nobody had time to make, and the trick was putting the model *only*
> where the judgment is and letting ordinary code do everything else.
>
> If you've got a pile like that, this pattern is about a weekend of work."

**Then stop talking.** Don't trail into a summary of what you just said.

---

## Q&A — ready answers

**"How do you know the summaries aren't made up?"**
> "Three things. It only gets the abstract, and it's instructed not to state
> anything that isn't in it. Thin abstracts get flagged rather than guessed
> at. And everything links back to the source. But I'll be straight with you:
> there's no automated hallucination check. The check is that I'm a domain
> expert reading my own field and I'd notice. That's a real gap, and it's the
> first thing I'd build next."

*(Concede this early and plainly — it's the question most likely to come from
this room, and conceding lands far better than defending.)*

**"Why not RAG / a vector database?"**
> "Nothing to retrieve over. It's a fixed set each month and every item gets
> judged. Retrieval solves 'find me the relevant few from millions.' My
> problem is 'judge all twelve hundred of these.' Different problem."

**"Copyright? Paywalls?"**
> "Titles, abstracts, metadata and links only. Official APIs and RSS feeds. No
> scraping, no full text. That was a constraint from day one, not a patch."

**"Could this work for our sources?"**
> "If your sources have an API or an RSS feed, yes, and the work is almost
> entirely in writing the topic paragraphs — which is the part only a domain
> expert can do. The code barely changes."

**"How long did it take to build?"**
> Have a real number ready, and mention it was built with Claude Code in
> reviewed phases. This group will want to know.

**"What would you do differently?"**
> "Measure the cost before building the thing that optimizes cost. And assert
> that an optimization is actually running, instead of believing the comment
> that says it is."

---

## The one optional slide

If the room expects at least one slide, make it the funnel, on screen while
you talk through Beat 9:

**1,899 collected → 754 unique → 1,039 judgments → 180 kept → 112 published**

Everything else in this talk is better as the live site than as a slide.
Slide 5 of `ccpslitreview-deck.pptx` is exactly this if you want to pull it
out; the rest of that deck is the no-demo version of this same talk.

---

## Timing

| Act | Beats | Min |
|---|---|---|
| I — What it is | 1-3 | 6 |
| II — The product | 4-7 | 10 |
| III — How it works | 8-10 | 5 |
| IV — Close | 11-12 | 3 |
| | **Total** | **24** |

Running long? Cut Beat 7 (reader features) to thirty seconds and drop two of
the three war stories. Running short? Beats 3 and 5 both expand naturally —
read another paper's summary out loud.
