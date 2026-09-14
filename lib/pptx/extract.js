import { unzip } from './unzip.js';

/**
 * A .pptx reduced to what a citation importer needs: per-slide body text and
 * per-slide speaker notes, in slide order.
 *
 * Text comes out of `<a:t>` runs by regex rather than a real XML parse. That
 * is the right tool here and not a shortcut: `<a:t>` elements cannot nest,
 * carry no attributes we read, and a deck routinely splits one sentence
 * across a dozen runs for formatting — so the work is concatenation, not tree
 * walking. `fast-xml-parser` is a dependency of this repo but a Node-oriented
 * one, and this module runs in the browser.
 *
 * Runs are joined without separators *within* a paragraph and with newlines
 * between paragraphs, because a DOI broken across two runs (common — a
 * hyperlink boundary does it) must come back out as one string.
 */

const SLIDE_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;
const NOTES_PATTERN = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;

/** Parse a .pptx into `{ deckTitle, slides: [{ number, text, notes }] }`. */
export async function extractPptx(buffer, { deckTitle = null } = {}) {
  const parts = await unzip(buffer, {
    wanted: (name) => SLIDE_PATTERN.test(name) || NOTES_PATTERN.test(name) || name === 'docProps/core.xml',
  });

  const slides = new Map();
  const notes = new Map();
  const decoder = new TextDecoder();

  for (const [name, body] of parts) {
    const slideMatch = name.match(SLIDE_PATTERN);
    if (slideMatch) {
      slides.set(Number(slideMatch[1]), textFromDrawingML(decoder.decode(body)));
      continue;
    }
    const notesMatch = name.match(NOTES_PATTERN);
    if (notesMatch) notes.set(Number(notesMatch[1]), textFromDrawingML(decoder.decode(body)));
  }

  if (slides.size === 0) throw new Error('no slides found — is this a .pptx file?');

  const core = parts.get('docProps/core.xml');
  const title = deckTitle ?? (core ? titleFromCore(decoder.decode(core)) : null);

  const ordered = [...slides.keys()].sort((a, b) => a - b);
  return {
    deckTitle: title,
    slides: ordered.map((number) => ({
      number,
      text: slides.get(number) ?? '',
      // notesSlideN.xml is numbered independently of slideN.xml in general,
      // but PowerPoint and every generator we have seen keep them in step.
      // A mismatch costs commentary on that slide, never a wrong pairing that
      // attributes one speaker's note to another slide's paper — the note is
      // simply absent.
      notes: notes.get(number) ?? '',
    })),
  };
}

/** Every `<a:t>` run in one DrawingML part, paragraphs separated by newlines. */
export function textFromDrawingML(xml) {
  if (!xml) return '';
  const paragraphs = [];

  for (const paragraph of xml.split(/<a:p[\s>]/).slice(1)) {
    const runs = [...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    if (!runs.length) continue;
    const line = runs.join('').replace(/[   ]/g, ' ').trim();
    if (line) paragraphs.push(line);
  }

  return paragraphs.join('\n');
}

/** `dc:title` from docProps/core.xml, which is the deck's own name. */
function titleFromCore(xml) {
  const match = xml.match(/<dc:title>([\s\S]*?)<\/dc:title>/);
  const title = match ? decodeXml(match[1]).trim() : '';
  return title || null;
}

/**
 * The five XML predefined entities plus numeric references.
 *
 * `&amp;` is resolved last so a literal `&amp;#8217;` in the source cannot
 * cascade into a live `’` — the same one-pass rule `cleanText` follows in
 * `lib/adapters/record.js`, for the same reason.
 */
function decodeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}
