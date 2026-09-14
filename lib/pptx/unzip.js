/**
 * The smallest zip reader that can open a .pptx, written to run unchanged in
 * the browser and in Node.
 *
 * Why not a library: the deck is parsed in the browser. This app has no API
 * routes and no server it could POST an upload to (see CLAUDE.md, "Pages are
 * static/SSG"), so the file is read on the reader's own machine and only the
 * extracted citations ever leave it. That makes the unzip a client-bundle
 * cost, and a general-purpose zip library is a large one for a format we need
 * exactly one shape of.
 *
 * `DecompressionStream('deflate-raw')` does the actual inflating — it is
 * built into both runtimes, so there is no inflate implementation here, only
 * the container parsing around it. Node has had it since 18 and every browser
 * this app supports has it; `openPptx` reports a clear error rather than
 * failing obscurely where it is missing.
 *
 * Not handled, deliberately: zip64 (a .pptx large enough to need it is not a
 * slide deck), encryption, and multi-disk archives. Each is detected and
 * reported rather than silently mis-parsed.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const ZIP64_MARKER = 0xffff;

/**
 * Entry names to file bytes, for the entries `wanted` selects.
 *
 * Selective by design: a deck's media (images, embedded video) is most of its
 * bytes and none of its citations, so the default caller asks only for the
 * handful of XML parts it reads.
 */
export async function unzip(buffer, { wanted = () => true } = {}) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = findEocd(view, bytes.length);
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record found)');

  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === ZIP64_MARKER || centralOffset === 0xffffffff) {
    throw new Error('zip64 archives are not supported');
  }

  const out = new Map();
  let cursor = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.length) throw new Error('truncated central directory');
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new Error('corrupt central directory');

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (!wanted(name)) continue;
    // Bit 0 is the encryption flag. An encrypted part would inflate to
    // garbage rather than fail, so it has to be caught here.
    if (flags & 0x0001) throw new Error(`encrypted zip entry: ${name}`);

    out.set(name, await readEntry({ view, bytes, localOffset, method, compressedSize, name }));
  }

  return out;
}

async function readEntry({ view, bytes, localOffset, method, compressedSize, name }) {
  if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
    throw new Error(`corrupt local header for ${name}`);
  }
  // The local header's own name/extra lengths are authoritative: the extra
  // field routinely differs in length from the central directory's copy, so
  // reusing that one lands mid-file.
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  const body = bytes.subarray(start, start + compressedSize);

  if (method === 0) return body.slice();
  if (method !== 8) throw new Error(`unsupported compression method ${method} for ${name}`);
  return inflateRaw(body);
}

async function inflateRaw(body) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot decompress zip files (DecompressionStream is unavailable)');
  }
  const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The end-of-central-directory record, scanned backwards.
 *
 * It sits at the very end unless the archive carries a trailing comment, so
 * the scan starts at the last possible position and walks back over the
 * comment's maximum length (64 KiB) rather than the whole file.
 */
function findEocd(view, size) {
  const earliest = Math.max(0, size - EOCD_MIN_SIZE - 0xffff);
  for (let i = size - EOCD_MIN_SIZE; i >= earliest; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}
