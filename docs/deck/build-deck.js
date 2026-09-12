const pptxgen = require("pptxgenjs");

const INK = "06313A";
const INK2 = "0B4550";
const TEAL = "028090";
const MINT = "02C39A";
const WHITE = "FFFFFF";
const TINT = "EAF3F4";
const BODY = "33474D";
const MUTED = "70898F";

const HF = "Cambria";
const BF = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "CCPSLitReview";
pres.title = "CCPSLitReview";

const W = 13.333;
const M = 0.7;
const CW = W - M * 2; // 11.933

// ---------- helpers ----------

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: INK };
  return s;
}

function lightSlide() {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  return s;
}

// Eyebrow + title block. Returns the y where content can start.
function heading(s, eyebrow, title, dark) {
  let y = 0.52;
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: M, y, w: CW, h: 0.28,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12, bold: true, charSpacing: 2,
      color: dark ? MINT : TEAL,
    });
    y += 0.34;
  }
  s.addText(title, {
    x: M, y, w: CW, h: 0.95,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 32, bold: true,
    color: dark ? WHITE : INK,
    valign: "top",
  });
  return y + 1.05;
}

// Rounded card with a subtle tint.
function card(s, x, y, w, h, fill, shadow) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.1,
    fill: { color: fill },
    line: { color: fill },
    ...(shadow
      ? { shadow: { type: "outer", angle: 90, blur: 10, offset: 0.06, opacity: 0.12, color: "000000" } }
      : {}),
  });
}

// Circular numeral badge — the deck's repeating motif.
function badge(s, x, y, d, text, fill, color) {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d,
    fill: { color: fill },
    line: { color: fill },
  });
  s.addText(text, {
    x, y, w: d, h: d,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 14, bold: true,
    color, align: "center", valign: "middle",
  });
}

// ---------- 1. Title ----------
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.9, y: -1.5, w: 5.4, h: 5.4,
    fill: { color: INK2 }, line: { color: INK2 },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 11.5, y: 4.6, w: 2.6, h: 2.6,
    fill: { color: INK2 }, line: { color: INK2 },
  });

  s.addText("CCPSLitReview", {
    x: M, y: 1.5, w: 9, h: 0.4,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 14, bold: true, charSpacing: 3, color: MINT,
  });
  s.addText("Reading 1,900 papers a month\nso nobody has to", {
    x: M, y: 2.05, w: 9.2, h: 1.9,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 42, bold: true, color: WHITE, lineSpacing: 48,
  });
  s.addText(
    "A small, boring, fully automated system for putting a language model somewhere useful — and what it taught us",
    {
      x: M, y: 4.15, w: 8.6, h: 0.9,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 17, color: "A8C6CB", lineSpacing: 26,
    }
  );
  s.addShape(pres.ShapeType.rect, {
    x: M, y: 5.35, w: 1.1, h: 0.035,
    fill: { color: MINT }, line: { color: MINT },
  });
  s.addText("Internal AI group  ·  overview and lessons", {
    x: M, y: 5.6, w: 8, h: 0.35,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 13, color: "7FA3A9",
  });
  s.addNotes(
    "Set expectations up front: this is an overview, not a deep dive. The subject isn't biology - it's what it takes to run a language model in a loop nobody babysits. Ask them to hold questions to the end, or take them as they come if the group is small."
  );
}

// ---------- 2. The problem ----------
{
  const s = lightSlide();
  const y0 = heading(s, "The problem", "One reader. Eleven topics. Far too much to read.", false);

  const stats = [
    ["11", "topic areas to follow", "cell culture, analytics, regulatory, industry news"],
    ["~1,900", "new items every month", "journals, preprints, FDA, trade press"],
    ["~60", "actually worth reading", "the ones that change what you do on Monday"],
  ];
  const cw = (CW - 0.6) / 3;
  stats.forEach(([n, label, sub], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, y0, cw, 2.0, TINT, false);
    s.addText(n, {
      x: x + 0.35, y: y0 + 0.22, w: cw - 0.7, h: 0.75,
      isTextBox: true, margin: 0,
      fontFace: HF, fontSize: 40, bold: true, color: TEAL,
    });
    s.addText(label, {
      x: x + 0.35, y: y0 + 1.0, w: cw - 0.7, h: 0.32,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, bold: true, color: INK,
    });
    s.addText(sub, {
      x: x + 0.35, y: y0 + 1.35, w: cw - 0.7, h: 0.55,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12, color: MUTED, lineSpacing: 15,
    });
  });

  s.addText(
    [
      { text: "Every literature alert fails the same way. ", options: { bold: true, color: INK } },
      { text: "Not because it misses things — because it sends too many, so you stop opening it.", options: { color: BODY } },
    ],
    {
      x: M, y: y0 + 2.45, w: CW, h: 0.8,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 17, lineSpacing: 24,
    }
  );
  s.addNotes(
    "The point of this slide: the bottleneck is not finding papers. Search already works. The bottleneck is deciding which ones matter, and that is the part nobody has time for. If the group has their own alert fatigue story, invite it here - it buys you attention for the rest."
  );
}

// ---------- 3. The reframe ----------
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: -1.4, y: 4.2, w: 4.6, h: 4.6,
    fill: { color: INK2 }, line: { color: INK2 },
  });
  s.addText("The reframe", {
    x: M, y: 1.35, w: CW, h: 0.3,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 12, bold: true, charSpacing: 2, color: MINT,
  });
  s.addText("This isn't a search problem.\nIt's a judgment problem — at a volume\nno human will keep up with.", {
    x: M, y: 1.95, w: 11.4, h: 2.6,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 34, bold: true, color: WHITE, lineSpacing: 52,
  });
  s.addText(
    "That shape — lots of small judgments, each one easy for an expert, all of them together impossible — is the shape most “AI for X” problems actually have.",
    {
      x: M, y: 5.0, w: 10.4, h: 0.9,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, color: "A8C6CB", lineSpacing: 24,
    }
  );
  s.addNotes(
    "This is the slide to slow down on. The claim worth making: a lot of teams reach for a chatbot when what they actually have is a high-volume judgment problem, which wants a pipeline instead. Everything after this is one worked example of that."
  );
}

// ---------- 4. What it produces ----------
{
  const s = lightSlide();
  const y0 = heading(s, "The output", "One page a month, written for one reader", false);

  const rows = [
    ["1", "An opening paragraph", "What the month was actually about — the throughline, not a list."],
    ["2", "A Top 5 across every topic", "If you read nothing else, read these, and here's why each one."],
    ["3", "Per-topic sections", "A short narrative, then each paper: what was done, and why it matters to you."],
    ["4", "An archive, and memory", "Months link to each other — “this follows last month's negative result.”"],
  ];
  const rh = 0.92;
  rows.forEach(([n, title, sub], i) => {
    const y = y0 + i * (rh + 0.16);
    badge(s, M, y + 0.06, 0.52, n, TEAL, WHITE);
    s.addText(title, {
      x: M + 0.78, y: y + 0.02, w: 4.1, h: 0.36,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, bold: true, color: INK,
    });
    s.addText(sub, {
      x: M + 0.78, y: y + 0.38, w: 7.9, h: 0.42,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13, color: MUTED, lineSpacing: 17,
    });
  });

  card(s, 9.15, y0, 3.48, 3.14, TINT, false);
  s.addText("Live demo", {
    x: 9.45, y: y0 + 0.35, w: 2.9, h: 0.35,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 20, bold: true, color: INK,
  });
  s.addText(
    "Show the real site here — latest month, one topic section, the archive, and the footer that reports which sources worked.",
    {
      x: 9.45, y: y0 + 0.82, w: 2.9, h: 1.5,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13, color: BODY, lineSpacing: 18,
    }
  );
  s.addText("Have a screenshot as backup.", {
    x: 9.45, y: y0 + 2.5, w: 2.9, h: 0.4,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 11, italic: true, color: MUTED,
  });
  s.addNotes(
    "Do the demo here, before any architecture - let them wonder how it works. Two things to point at while you're in there: a paper marked as recurring, and a sentence that references last month. Both pay off later. Never demo live without a screenshot ready."
  );
}

// ---------- 5. The funnel ----------
{
  const s = lightSlide();
  const y0 = heading(s, "In numbers", "What one month looks like end to end", false);

  const steps = [
    ["1,899", "collected", "six sources,\ndeliberately wide"],
    ["754", "unique papers", "the same paper\nfound many ways"],
    ["1,039", "judgments", "each paper judged\nagainst each topic"],
    ["180", "kept", "scored 3 or better\nout of 5"],
    ["112", "published", "trimmed to a\nper-topic cap"],
  ];
  const cw = 2.15, gap = 0.3;
  const totalW = steps.length * cw + (steps.length - 1) * gap;
  const x0 = (W - totalW) / 2;
  steps.forEach(([n, label, sub], i) => {
    const x = x0 + i * (cw + gap);
    const last = i === steps.length - 1;
    card(s, x, y0, cw, 2.35, last ? TEAL : TINT, false);
    s.addText(n, {
      x: x + 0.18, y: y0 + 0.28, w: cw - 0.36, h: 0.62,
      isTextBox: true, margin: 0,
      fontFace: HF, fontSize: 28, bold: true,
      color: last ? WHITE : TEAL, align: "center",
    });
    s.addText(label, {
      x: x + 0.18, y: y0 + 0.95, w: cw - 0.36, h: 0.32,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14, bold: true,
      color: last ? WHITE : INK, align: "center",
    });
    s.addText(sub, {
      x: x + 0.18, y: y0 + 1.34, w: cw - 0.36, h: 0.8,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 11.5, color: last ? "CDECE5" : MUTED,
      align: "center", lineSpacing: 15,
    });
    if (!last) {
      s.addText("›", {
        x: x + cw, y: y0 + 0.75, w: gap, h: 0.5,
        isTextBox: true, margin: 0,
        fontFace: BF, fontSize: 22, bold: true, color: "B5CFD3", align: "center",
      });
    }
  });

  s.addText(
    "94% of what comes in never reaches the page. That discard rate is the whole product.",
    {
      x: M, y: y0 + 2.7, w: CW, h: 0.45,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 17, bold: true, color: INK, align: "center",
    }
  );
  s.addNotes(
    "Refer back to this slide three or four times later - it's the spine of the talk. Worth saying plainly: the search queries are deliberately too broad. Casting a wide net is only affordable because the filter is cheap and good, and that trade is the core design choice."
  );
}

// ---------- 6. The pipeline ----------
{
  const s = lightSlide();
  const y0 = heading(s, "How it works", "Six steps, run by a scheduled job, once a month", false);

  const stages = [
    ["Collect", "six sources", false],
    ["Tidy up", "dedupe, clean text", false],
    ["Score", "is this relevant?", true],
    ["Prepare", "cap, sort, group", false],
    ["Write", "summaries, narrative", true],
    ["Publish", "commit + deploy", false],
  ];
  const cw = 1.85, gap = 0.2;
  const totalW = stages.length * cw + (stages.length - 1) * gap;
  const x0 = (W - totalW) / 2;
  stages.forEach(([t, sub, isAI], i) => {
    const x = x0 + i * (cw + gap);
    card(s, x, y0, cw, 1.5, isAI ? TEAL : TINT, false);
    s.addText(t, {
      x: x + 0.12, y: y0 + 0.35, w: cw - 0.24, h: 0.38,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, bold: true,
      color: isAI ? WHITE : INK, align: "center",
    });
    s.addText(sub, {
      x: x + 0.12, y: y0 + 0.76, w: cw - 0.24, h: 0.5,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 11.5, color: isAI ? "CDECE5" : MUTED,
      align: "center", lineSpacing: 14,
    });
  });

  s.addShape(pres.ShapeType.ellipse, {
    x: x0 + 0.3, y: y0 + 1.75, w: 0.14, h: 0.14,
    fill: { color: TEAL }, line: { color: TEAL },
  });
  s.addText("Teal steps are the ones a language model does. The other four are ordinary code.", {
    x: x0 + 0.58, y: y0 + 1.62, w: 9, h: 0.4,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 13.5, color: BODY,
  });

  const notes = [
    ["No database.", "The month is one file, committed to the repo. The website is rebuilt from it."],
    ["Every step saves its work.", "If step 4 fails, you restart at 4 — you don't re-do the expensive steps."],
    ["Nobody presses anything.", "It runs on the 2nd of the month and publishes itself."],
  ];
  const ncw = (CW - 0.6) / 3;
  notes.forEach(([t, sub], i) => {
    const x = M + i * (ncw + 0.3);
    const y = y0 + 2.3;
    s.addText(t, {
      x, y, w: ncw, h: 0.32,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14, bold: true, color: TEAL,
    });
    s.addText(sub, {
      x, y: y + 0.34, w: ncw, h: 0.8,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12.5, color: BODY, lineSpacing: 17,
    });
  });
  s.addNotes(
    "Keep this quick and don't dwell on the plumbing. The one line that matters: the model appears at exactly two places, and everything else is deliberately ordinary code. That sets up the next slide."
  );
}

// ---------- 7. Model vs code ----------
{
  const s = darkSlide();
  const y0 = heading(s, "The main idea", "Let the model judge. Code does the bookkeeping.", true);

  const colW = (CW - 0.5) / 2;
  card(s, M, y0, colW, 3.0, INK2, false);
  card(s, M + colW + 0.5, y0, colW, 3.0, "0A5B5F", false);

  s.addText("Code does", {
    x: M + 0.4, y: y0 + 0.3, w: colW - 0.8, h: 0.35,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 15, bold: true, charSpacing: 1.5, color: "8FB6BC",
  });
  s.addText(
    [
      { text: "Fetching from every source", options: { bullet: true, breakLine: true } },
      { text: "Spotting the same paper twice", options: { bullet: true, breakLine: true } },
      { text: "Cleaning up messy text", options: { bullet: true, breakLine: true } },
      { text: "Applying the per-topic caps", options: { bullet: true, breakLine: true } },
      { text: "Deciding the reading order", options: { bullet: true, breakLine: true } },
      { text: "Remembering what we've seen before", options: { bullet: true } },
    ],
    {
      x: M + 0.4, y: y0 + 0.8, w: colW - 0.8, h: 2.0,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14, color: WHITE, paraSpaceAfter: 8,
    }
  );

  s.addText("The model does", {
    x: M + colW + 0.9, y: y0 + 0.3, w: colW - 0.8, h: 0.35,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 15, bold: true, charSpacing: 1.5, color: MINT,
  });
  s.addText(
    [
      { text: "Is this paper relevant to this topic?", options: { bullet: true, breakLine: true } },
      { text: "What did this paper actually find?", options: { bullet: true, breakLine: true } },
      { text: "Why would this reader care?", options: { bullet: true, breakLine: true } },
      { text: "What was this month about?", options: { bullet: true } },
    ],
    {
      x: M + colW + 0.9, y: y0 + 0.8, w: colW - 0.8, h: 1.6,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14, color: WHITE, paraSpaceAfter: 8,
    }
  );

  s.addText(
    "Every time you let a model re-derive something code already knows, you buy yourself randomness you didn't need.",
    {
      x: M, y: y0 + 3.25, w: CW, h: 0.5,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, italic: true, color: "A8C6CB", align: "center",
    }
  );
  s.addNotes(
    "The single most transferable idea in the talk. The right-hand list is all questions a smart colleague could answer and a program cannot. The left-hand list is all things a program does perfectly and a model does approximately. Sorting your problem into those two columns is most of the design work."
  );
}

// ---------- 8. The gate ----------
{
  const s = lightSlide();
  const y0 = heading(s, "Step 3: the filter", "Score every paper, against every topic, 0 to 5", false);

  s.addText(
    "The model gets a batch of papers and one topic's description, and returns a number for each. Anything under 3 is thrown away and never seen again.",
    {
      x: M, y: y0, w: 7.4, h: 1.0,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, color: BODY, lineSpacing: 23,
    }
  );

  const pts = [
    ["It's cheap on purpose", "A small, fast model. One thousand judgments costs about 30 cents."],
    ["It answers in a fixed format", "Numbers keyed to papers — not prose we'd have to parse and hope."],
    ["It never sees the full paper", "Title, abstract and metadata only. No scraping, no paywalls."],
  ];
  pts.forEach(([t, sub], i) => {
    const y = y0 + 1.15 + i * 0.95;
    badge(s, M, y + 0.02, 0.46, String(i + 1), MINT, INK);
    s.addText(t, {
      x: M + 0.7, y, w: 6.6, h: 0.32,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, bold: true, color: INK,
    });
    s.addText(sub, {
      x: M + 0.7, y: y + 0.33, w: 6.6, h: 0.45,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12.5, color: MUTED, lineSpacing: 16,
    });
  });

  card(s, 8.55, y0, 4.08, 3.75, INK, true);
  s.addText("What the model is asked", {
    x: 8.85, y: y0 + 0.3, w: 3.5, h: 0.3,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 12, bold: true, charSpacing: 1.5, color: MINT,
  });
  s.addText(
    "“Here are 25 papers. Here is what this\ntopic covers, in plain English.\n\nGive each paper a score from 0 to 5 for\nhow well it fits, keyed by its number.\n\nIf an abstract is too thin to judge,\nsay so — don't guess.”",
    {
      x: 8.85, y: y0 + 0.78, w: 3.5, h: 2.7,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13.5, color: WHITE, lineSpacing: 20,
    }
  );
  s.addNotes(
    "Emphasize how unglamorous this is: no fine-tuning, no embeddings, no vector database. It's a prompt, a batch, and a number. People consistently over-engineer this step. Mention that scoring runs in parallel and the whole month takes about five minutes."
  );
}

// ---------- 9. Rubrics as config ----------
{
  const s = lightSlide();
  const y0 = heading(s, "What makes it work", "The topic description is the product", false);

  s.addText(
    "Each topic is one entry in a settings file — a name, a cap, and a paragraph describing what belongs. That paragraph is written for the model to read, and it lives in version control like any other code.",
    {
      x: M, y: y0, w: 6.5, h: 1.4,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, color: BODY, lineSpacing: 23,
    }
  );

  const facts = [
    "Adding a new topic is one entry. No code changes.",
    "When a topic goes wrong, you fix the paragraph, not the program.",
    "Changes are reviewable in a diff, like everything else.",
  ];
  facts.forEach((t, i) => {
    const y = y0 + 1.55 + i * 0.62;
    s.addShape(pres.ShapeType.ellipse, {
      x: M + 0.04, y: y + 0.1, w: 0.16, h: 0.16,
      fill: { color: MINT }, line: { color: MINT },
    });
    s.addText(t, {
      x: M + 0.42, y, w: 6.1, h: 0.5,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14, color: INK, lineSpacing: 19,
    });
  });

  card(s, 7.6, y0, 5.03, 3.55, INK, true);
  s.addText("One topic, in full", {
    x: 7.95, y: y0 + 0.28, w: 4.4, h: 0.3,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 12, bold: true, charSpacing: 1.5, color: MINT,
  });
  s.addText(
    "name:  Modeling & Machine Learning\ncap:   15 papers\n\nscope: Mechanistic and data-driven\n       models of cell culture. Must\n       show an actual bioprocess\n       application — a passing\n       mention of a bioreactor is\n       not enough.\n\nqueries: ...",
    {
      x: 7.95, y: y0 + 0.72, w: 4.4, h: 2.6,
      isTextBox: true, margin: 0,
      fontFace: "Courier New", fontSize: 11.5, color: "D9EDEF", lineSpacing: 17,
    }
  );
  s.addNotes(
    "Tell the story behind the example: this topic was a false-positive machine, dragging in anything that said 'neural network' near the word 'bioreactor'. The fix wasn't a better model or a smarter algorithm - it was one added sentence. Prompt wording is product work, and treating it as config rather than as code buried in a function is what makes it maintainable."
  );
}

// ---------- 10. How do you test it ----------
{
  const s = lightSlide();
  const y0 = heading(s, "The hard question", "How do you check a system with no right answers?", false);

  s.addChart(
    pres.ChartType.bar,
    [{
      name: "Judgments",
      labels: ["0", "1", "2", "3", "4", "5"],
      values: [621, 127, 111, 79, 63, 38],
    }],
    {
      x: M, y: y0, w: 6.5, h: 3.3,
      barDir: "col",
      chartColors: [TEAL],
      showTitle: true,
      title: "Scores given across 1,039 judgments",
      titleFontFace: BF, titleFontSize: 13, titleColor: INK,
      showValue: true,
      dataLabelPosition: "outEnd",
      dataLabelFontFace: BF, dataLabelFontSize: 10, dataLabelColor: MUTED,
      showLegend: false,
      catAxisLabelFontFace: BF, catAxisLabelFontSize: 12, catAxisLabelColor: MUTED,
      valAxisHidden: true,
      valGridLine: { style: "none" },
      catGridLine: { style: "none" },
      barGapWidthPct: 55,
    }
  );

  const checks = [
    ["Read the extremes", "The 5s were all genuinely excellent. The 0s were genuinely junk — microplastics in sludge, cosmetics research."],
    ["Design one case you already know the answer to", "A cell-line paper scored 2 under one topic and 5 under another — which is exactly what the two topic descriptions say should happen. That's as close to a unit test as a judgment gets."],
  ];
  checks.forEach(([t, sub], i) => {
    const y = y0 + i * 1.65;
    s.addText(t, {
      x: 7.6, y, w: 5.03, h: 0.35,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, bold: true, color: TEAL,
    });
    s.addText(sub, {
      x: 7.6, y: y + 0.4, w: 5.03, h: 1.1,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13, color: BODY, lineSpacing: 18,
    });
  });
  s.addNotes(
    "Nobody has a labelled dataset for 'papers this specific person should read'. So: read both ends of the distribution by hand, and construct one boundary case whose correct answer your own topic descriptions already state. The big pile of zeros is not a problem - it's the wide net working as intended."
  );
}

// ---------- 11. The rule worth stealing ----------
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.6, y: 3.8, w: 5.2, h: 5.2,
    fill: { color: INK2 }, line: { color: INK2 },
  });
  s.addText("One rule worth stealing", {
    x: M, y: 1.35, w: CW, h: 0.3,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 12, bold: true, charSpacing: 2, color: MINT,
  });
  s.addText("If the model skips an answer,\nthe whole run stops.", {
    x: M, y: 1.95, w: 10.6, h: 1.6,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 36, bold: true, color: WHITE, lineSpacing: 50,
  });
  s.addText(
    "A paper the model forgot to score and a paper it judged irrelevant look identical further down the line — both are simply absent. So the code refuses to guess: a missing answer is a loud failure, not a quiet gap.",
    {
      x: M, y: 3.85, w: 9.4, h: 1.1,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, color: "A8C6CB", lineSpacing: 24,
    }
  );
  s.addText(
    "Cheap to write. It's the difference between a system that degrades silently and one that tells you.",
    {
      x: M, y: 5.25, w: 9.4, h: 0.8,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, bold: true, color: MINT, lineSpacing: 22,
    }
  );
  s.addNotes(
    "Generalize it for the room: anywhere a model's output feeds something downstream, work out what an omission looks like on the other side. If 'it skipped it' and 'it said no' are indistinguishable, you have a silent quality leak that will never show up in any dashboard."
  );
}

// ---------- 12. Cost ----------
{
  const s = lightSlide();
  const y0 = heading(s, "What it costs", "Less than a sandwich", false);

  const stats = [
    ["$2.34", "a month, all in", "at full price, before any optimization"],
    ["$0.0036", "per paper kept", "the filtering step, per survivor"],
    ["~5 min", "of compute", "the whole month, start to finish"],
    ["0", "human steps", "it publishes itself on the 2nd"],
  ];
  const cw = (CW - 0.9) / 4;
  stats.forEach(([n, label, sub], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, y0, cw, 1.95, TINT, false);
    s.addText(n, {
      x: x + 0.2, y: y0 + 0.25, w: cw - 0.4, h: 0.6,
      isTextBox: true, margin: 0,
      fontFace: HF, fontSize: 30, bold: true, color: TEAL, align: "center",
    });
    s.addText(label, {
      x: x + 0.2, y: y0 + 0.88, w: cw - 0.4, h: 0.3,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13.5, bold: true, color: INK, align: "center",
    });
    s.addText(sub, {
      x: x + 0.2, y: y0 + 1.2, w: cw - 0.4, h: 0.6,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 11.5, color: MUTED, align: "center", lineSpacing: 15,
    });
  });

  card(s, M, y0 + 2.3, CW, 1.6, INK, false);
  s.addText("The mistake worth admitting", {
    x: M + 0.45, y: y0 + 2.5, w: CW - 0.9, h: 0.3,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 12.5, bold: true, charSpacing: 1.5, color: MINT,
  });
  s.addText(
    "We built a whole switch to move the filtering onto a cheaper model. Then we measured: it would have saved 33 cents a month. There was no cost problem — so the real decision was always about quality, and we'd been treating it as a budget question.",
    {
      x: M + 0.45, y: y0 + 2.85, w: CW - 0.9, h: 1.0,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14.5, color: WHITE, lineSpacing: 20,
    }
  );
  s.addNotes(
    "Land this as a genuine lesson, not a humblebrag. We spent real effort on a cost optimization before knowing the cost. Measure first - most of the time at this scale there's nothing there, and then you get to choose on quality instead, which is the better conversation anyway."
  );
}

// ---------- 13. Two models, two jobs ----------
{
  const s = lightSlide();
  const y0 = heading(s, "Model choice", "Two different jobs, two different models", false);

  const cols = [
    [
      "Filtering", "A small, fast model",
      "1,000+ judgments a month. The task is narrow: read a rubric, give a number. Volume matters more than eloquence.",
      "Bounded judgment · high volume",
    ],
    [
      "Writing", "The strongest model available",
      "About 100 summaries a month, read by a domain expert who will spot a wrong or invented claim instantly. This part is the product.",
      "Open-ended judgment · low volume",
    ],
  ];
  const colW = (CW - 0.5) / 2;
  cols.forEach(([label, title, body, foot], i) => {
    const x = M + i * (colW + 0.5);
    card(s, x, y0, colW, 3.45, i === 1 ? TEAL : TINT, false);
    s.addText(label.toUpperCase(), {
      x: x + 0.45, y: y0 + 0.35, w: colW - 0.9, h: 0.3,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12, bold: true, charSpacing: 2,
      color: i === 1 ? "9EE5D4" : TEAL,
    });
    s.addText(title, {
      x: x + 0.45, y: y0 + 0.75, w: colW - 0.9, h: 0.85,
      isTextBox: true, margin: 0,
      fontFace: HF, fontSize: 24, bold: true, color: i === 1 ? WHITE : INK,
    });
    s.addText(body, {
      x: x + 0.45, y: y0 + 1.65, w: colW - 0.9, h: 1.2,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 14, color: i === 1 ? "E2F6F2" : BODY, lineSpacing: 20,
    });
    s.addText(foot, {
      x: x + 0.45, y: y0 + 2.9, w: colW - 0.9, h: 0.35,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12, italic: true,
      color: i === 1 ? "9EE5D4" : MUTED,
    });
  });

  s.addText(
    "The choice is made per step, not once for the whole system — which also means swapping either one is a settings change, not a rewrite.",
    {
      x: M, y: y0 + 3.6, w: CW, h: 0.45,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, color: BODY, align: "center",
    }
  );
  s.addNotes(
    "The useful framing: don't pick 'a model' for a system, pick one per step based on what that step actually needs. Filtering is bounded and high-volume; writing is open-ended and low-volume and is the thing the reader actually experiences. Cheapening the second to save a dollar would be a bad trade."
  );
}

// ---------- 14. The agent handoff ----------
{
  const s = lightSlide();
  const y0 = heading(s, "A recent change", "Handing the writing to an AI agent", false);

  s.addText(
    "The writing step no longer calls an API. The scheduled job prepares the work, then wakes up a Claude Code agent, which reads the prepared file, writes the month, and commits it.",
    {
      x: M, y: y0, w: CW, h: 0.7,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, color: BODY, lineSpacing: 23,
    }
  );

  const steps = [
    ["Code prepares", "Exactly which papers, already deduped, capped and in reading order — plus what we said last month."],
    ["The agent writes", "Summaries, per-topic narratives, the Top 5, the opening paragraph. Only the writing."],
    ["Code checks", "The result is validated against the expected shape before it is allowed to become a published month."],
  ];
  const cw = (CW - 0.6) / 3;
  steps.forEach(([t, sub], i) => {
    const x = M + i * (cw + 0.3);
    const y = y0 + 0.95;
    card(s, x, y, cw, 2.05, i === 1 ? TEAL : TINT, false);
    badge(s, x + 0.35, y + 0.3, 0.46, String(i + 1), i === 1 ? MINT : TEAL, i === 1 ? INK : WHITE);
    s.addText(t, {
      x: x + 0.35, y: y + 0.88, w: cw - 0.7, h: 0.32,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, bold: true, color: i === 1 ? WHITE : INK,
    });
    s.addText(sub, {
      x: x + 0.35, y: y + 1.22, w: cw - 0.7, h: 0.75,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12, color: i === 1 ? "CDECE5" : MUTED, lineSpacing: 16,
    });
  });

  s.addText(
    [
      { text: "Why bother?  ", options: { bold: true, color: TEAL } },
      {
        text: "It moves the expensive part onto a subscription instead of per-token billing — and it keeps the agent boxed in. It is handed the decisions and asked only to write. Nothing it does can change which papers appear.",
        options: { color: BODY },
      },
    ],
    {
      x: M, y: y0 + 3.1, w: CW, h: 0.8,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 15, lineSpacing: 22,
    }
  );
  s.addNotes(
    "This is the newest and least settled part of the system, so present it as such. The transferable idea is the sandwich: deterministic prep in front, deterministic validation behind, agent judgment in the middle. An agent with a narrow job and checked output is a very different risk profile from an agent given the run of the place."
  );
}

// ---------- 15. War stories ----------
{
  const s = lightSlide();
  const y0 = heading(s, "Things that went wrong", "Three that changed how I build these", false);

  const stories = [
    [
      "The four wrong diagnoses",
      "Trying a cheaper provider, four attempts scored zero papers. I misread the error three times — the real limit only became visible after a “fix” made the request bigger.",
      "We were throwing away the provider's error message and logging only a one-line summary. Log the full response.",
    ],
    [
      "The optimization that never ran",
      "A caching setting meant to cut costs did nothing for a month. Our prompt was just under the minimum size for it to apply, so it was silently ignored.",
      "We only caught it because we report cache usage separately. Measure the optimization, don't trust the comment next to it.",
    ],
    [
      "The reports nobody saw",
      "In an earlier project, two finished reports were written and committed — to the wrong branch. The site only builds one branch. Nothing errored. Nobody noticed.",
      "The job now verifies the result actually landed, rather than trusting a “success” message.",
    ],
  ];
  const cw = (CW - 0.6) / 3;
  stories.forEach(([t, body, lesson], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, y0, cw, 3.65, TINT, false);
    s.addText(t, {
      x: x + 0.32, y: y0 + 0.3, w: cw - 0.64, h: 0.7,
      isTextBox: true, margin: 0,
      fontFace: HF, fontSize: 18, bold: true, color: INK, lineSpacing: 23,
    });
    s.addText(body, {
      x: x + 0.32, y: y0 + 1.05, w: cw - 0.64, h: 1.35,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12.5, color: BODY, lineSpacing: 17,
    });
    s.addText(lesson, {
      x: x + 0.32, y: y0 + 2.5, w: cw - 0.64, h: 1.05,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 12.5, bold: true, color: TEAL, lineSpacing: 17,
    });
  });
  s.addNotes(
    "This is usually the part people remember, so don't rush it. All three share a theme: the system was wrong and cheerful about it. None of them threw an error. Pick one to tell properly if time is short - the third one is the best."
  );
}

// ---------- 16. The poster line ----------
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: -2.0, y: -2.0, w: 5.5, h: 5.5,
    fill: { color: INK2 }, line: { color: INK2 },
  });
  s.addText("If you remember one thing", {
    x: M, y: 1.5, w: CW, h: 0.3,
    isTextBox: true, margin: 0,
    fontFace: BF, fontSize: 12, bold: true, charSpacing: 2, color: MINT,
  });
  s.addText("“Done” is not evidence\nthat it happened.", {
    x: M, y: 2.1, w: 11.4, h: 1.8,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 44, bold: true, color: WHITE, lineSpacing: 58,
  });
  s.addText(
    "This is true of a scheduled job, a model, and an agent alike. Check the effect you wanted — the file exists, the page changed, the number moved — not the status it reported about itself.",
    {
      x: M, y: 4.25, w: 10.2, h: 1.25,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 17, color: "A8C6CB", lineSpacing: 26,
    }
  );
  s.addNotes(
    "Deliver this one slowly and then pause. It's the line most likely to survive the walk back to someone's desk, and it applies to plenty of work in the room that has nothing to do with literature."
  );
}

// ---------- 17. Takeaways ----------
{
  const s = lightSlide();
  const y0 = heading(s, "To take away", "Five things that transfer to almost any project", false);

  const items = [
    ["Put the model where the judgment is", "and let ordinary code do everything else."],
    ["Write the instructions for the model", "keep them in a settings file, and review changes like code."],
    ["Make a missing answer loud", "a silent gap is a quality leak you'll never see."],
    ["Measure the cost before optimizing it", "usually there's nothing there — then choose on quality."],
    ["Verify the effect, not the status", "especially when an agent tells you it's finished."],
  ];
  items.forEach(([t, sub], i) => {
    const y = y0 + i * 0.76;
    badge(s, M, y + 0.02, 0.5, String(i + 1), i === 4 ? MINT : TEAL, i === 4 ? INK : WHITE);
    s.addText(t, {
      x: M + 0.75, y, w: 6.0, h: 0.34,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 16, bold: true, color: INK,
    });
    s.addText(sub, {
      x: M + 0.75, y: y + 0.35, w: 6.4, h: 0.3,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13, color: MUTED,
    });
  });

  card(s, 8.3, y0, 4.33, 3.6, INK, true);
  s.addText("Questions", {
    x: 8.65, y: y0 + 0.35, w: 3.7, h: 0.45,
    isTextBox: true, margin: 0,
    fontFace: HF, fontSize: 26, bold: true, color: WHITE,
  });
  s.addText(
    [
      { text: "Why no vector database?", options: { bullet: true, breakLine: true } },
      { text: "How do you know the summaries are accurate?", options: { bullet: true, breakLine: true } },
      { text: "What about copyright and paywalls?", options: { bullet: true, breakLine: true } },
      { text: "Could this work for our team's sources?", options: { bullet: true } },
    ],
    {
      x: 8.65, y: y0 + 1.0, w: 3.7, h: 2.2,
      isTextBox: true, margin: 0,
      fontFace: BF, fontSize: 13, color: "CDECE5", paraSpaceAfter: 10, lineSpacing: 17,
    }
  );
  s.addNotes(
    "Short answers ready. No vector DB: nothing to retrieve over - the task is judging every item in a fixed monthly set, not recalling a few. Accuracy: prompts forbid claims not in the abstract and require flagging thin abstracts, plus the reader is an expert who can vote and comment - but be honest that there is no automated hallucination check, and that's a real gap. Copyright: titles, abstracts and links only, official APIs and RSS, no scraping. And yes, the topic-description-plus-filter pattern ports to any source with an API."
  );
}

pres.writeFile({ fileName: "ccpslitreview-deck.pptx" }).then((f) => console.log("wrote", f));
