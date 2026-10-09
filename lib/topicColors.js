import topicsDoc from '../config/topics.json' with { type: 'json' };
import { TOPIC_COLORS } from './topics.js';

/**
 * A topic's identity color name (a key of TOPIC_COLORS), for pills, cards,
 * the relevance meter and the per-topic chart.
 *
 * From config/topics.json when the topic has one. A topic that appears in an
 * old month but has since been removed from the config still needs a stable
 * color, so it falls back to a hash of its id — the same id always lands on
 * the same hue, independent of position, so reordering topics never repaints
 * them.
 */
const configured = new Map(topicsDoc.topics.filter((t) => t.color).map((t) => [t.id, t.color]));

export function topicColor(id) {
  if (configured.has(id)) return configured.get(id);
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TOPIC_COLORS[h % TOPIC_COLORS.length];
}

/** Inline style that sets `--topic` for everything inside an element. */
export function topicStyle(id) {
  return { '--topic': `var(--topic-${topicColor(id)})` };
}
