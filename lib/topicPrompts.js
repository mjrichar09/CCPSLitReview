/**
 * Copy-paste prompts for an AI assistant, so someone who has never seen the
 * config format can still get a well-formed topic or feed entry: copy the
 * prompt, add a sentence about what they want, paste the assistant's JSON
 * reply back into the editor. The prompts carry the current topics and feeds,
 * so the assistant can draw boundaries against what already exists instead of
 * duplicating it.
 *
 * Browser-safe and pure, like lib/topics.js.
 */

/** Short one-line summary of a topic, for listing the existing ones to the AI. */
function topicLine(t) {
  const firstSentence = (t.rubric ?? '').split(/(?<=[.;])\s/)[0].slice(0, 220);
  return `- ${t.id} — ${t.name}: ${firstSentence}`;
}

/** Every tag any feed carries, so the AI picks from the vocabulary instead of inventing one. */
export function feedTags(feeds) {
  return [...new Set(feeds.flatMap((f) => f.tags ?? []))].sort();
}

export function topicPrompt({ topics, feeds, example }) {
  const sample = example ?? topics.find((t) => t.keywords?.length) ?? topics[0];
  const exampleJson = JSON.stringify(
    {
      id: sample.id,
      name: sample.name,
      max_items: sample.max_items,
      rubric: sample.rubric,
      mammalian_preference: sample.mammalian_preference ?? false,
      keywords: sample.keywords ?? [],
      anchor: sample.anchor ?? 'bioprocess',
      sources: {
        biorxiv: sample.sources?.biorxiv ?? { enabled: false },
        rss: sample.sources?.rss ?? { enabled: false },
      },
    },
    null,
    2,
  );

  return `You are helping me configure a monthly literature digest for upstream biopharmaceutical process development (CHO cell culture, CMC). Each "topic" is a category of the digest. Papers are found by keyword searches of PubMed and Europe PMC (plus optional preprint, arXiv and trade-press RSS sources), then an AI model scores every paper 0-5 against the topic's rubric and keeps those scoring 3 or more.

I want to ADD or CHANGE a topic. My request is at the end of this message.

Reply with ONE JSON object only, no commentary and no code fence, in exactly this shape:

{
  "id": "lowercase_with_underscores, unique, never reuse an existing id for a new topic",
  "name": "Human-readable name shown on the site",
  "max_items": 10,
  "rubric": "The scoring rubric (see guidance)",
  "mammalian_preference": true,
  "keywords": ["phrase one", "phrase two"],
  "anchor": "bioprocess",
  "sources": {
    "biorxiv": { "enabled": true, "terms": ["lowercase", "terms"] },
    "rss": { "enabled": true, "terms": ["lowercase terms to filter trade-press headlines"] }
  }
}

Field guidance:
- rubric: written FOR THE SCORING MODEL, not for humans. 2-6 sentences listing what is in scope, as concrete subtopics, methods and parameters. Add "Boundary with <other_topic_id>: ..." sentences wherever the topic could overlap an existing one, saying which side each kind of paper belongs on. Add "REQUIRED: ..." for any hard requirement (for example, "must have an actual bioprocess application, not merely a mention").
- mammalian_preference: true for science topics, so microbial/plant/insect work scores 0 unless it transfers to mammalian culture. false for regulatory or industry-news topics.
- keywords: 8-15 specific phrases as they appear in titles and abstracts. Multi-word phrases are fine; a trailing * is a wildcard ("soft sensor*"). Avoid single generic words ("model", "cell", "protein") — they flood the search. Do not include quote marks.
- anchor: "bioprocess" (recommended) also requires a bioprocess/cell-culture context term in the paper, which removes most clinical noise. Use "none" only if the topic is not about bioprocessing (for example, regulatory guidance).
- max_items: how many papers this topic may show per month (usually 10-12).
- sources.biorxiv: preprints. Turn on for fast-moving science topics; terms are short lowercase words a matching preprint title would contain.
- sources.rss: trade press. "terms" keeps only headlines containing one of them (lowercase; a trailing space, like "pat ", avoids matching inside other words). Alternatively "tags" selects which feeds to read: ${feedTags(feeds).map((t) => `"${t}"`).join(', ')}.
- Leave out any source you want at its default. Only set "pubmed" or "europepmc" to { "enabled": false } if the topic should not search literature at all (for example, an industry-news topic fed only by RSS).

Existing topics (do not duplicate; draw boundaries against them):
${topics.map(topicLine).join('\n')}

An existing topic in the expected format, as an example:
${exampleJson}

My request: `;
}

export function feedPrompt({ feeds, topics }) {
  const current = feeds
    .map((f) => `- ${f.id}: ${f.name} — ${f.url} [${(f.tags ?? []).join(', ')}]${f.enabled === false ? ' (disabled)' : ''}`)
    .join('\n');
  const byTag = topics
    .filter((t) => t.sources?.rss?.tags?.length)
    .map((t) => `- ${t.id} reads feeds tagged ${t.sources.rss.tags.join(', ')}`)
    .join('\n');

  return `You are helping me configure the trade-press and news RSS feeds for a monthly biopharmaceutical process development literature digest. Only official RSS or Atom feeds are allowed: no scraping, no paywalled full text.

I want to ADD, CHANGE or REMOVE feeds. My request is at the end of this message.

Reply with a JSON ARRAY only, no commentary and no code fence. Each element is one feed:

[
  { "id": "lowercase-with-hyphens", "name": "Publication name", "url": "https://.../feed", "tags": ["trade"], "enabled": true }
]

Guidance:
- url must be the feed itself (the XML address), not the publication's home page. Give the URL you are most confident is current, and tell me nothing else; I will test it.
- tags decide which topics read the feed. Use the existing tags where they fit: ${feedTags(feeds).map((t) => `"${t}"`).join(', ')}. "trade" is general trade press, "manufacturing" is manufacturing/CDMO coverage, "industry" is business and capacity news, "regulatory" is agency guidance.
- To change an existing feed, reuse its id. To remove one, include it with "enabled": false.
- Include only the feeds you are adding or changing, not the whole list.

Current feeds:
${current}

Topics that select feeds by tag (every other topic reads all enabled feeds, filtered by its own keywords):
${byTag || '- none'}

My request: `;
}

/**
 * Pull JSON out of whatever the assistant actually replied with: tolerates a
 * code fence or a sentence around it, which assistants add despite being told
 * not to. Returns the parsed value or throws with a readable message.
 */
export function parseAiJson(text) {
  const raw = (text ?? '').trim();
  if (!raw) throw new Error('Nothing pasted.');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found — paste the assistant’s reply, which should start with { or [.');
  const open = body[start];
  const end = body.lastIndexOf(open === '{' ? '}' : ']');
  if (end <= start) throw new Error('The JSON looks cut off — check you copied the whole reply.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (err) {
    throw new Error(`That is not valid JSON: ${err.message}`);
  }
}
