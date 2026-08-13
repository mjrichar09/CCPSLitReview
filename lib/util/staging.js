import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { stagingDir } from '../digestDir.js';

/**
 * Per-month pipeline artifacts, the thing that makes each stage independently
 * re-runnable: a stage reads its predecessor's file rather than an in-memory
 * hand-off, so re-running summarize after a mid-stage failure costs no fetching
 * and no re-scoring.
 *
 * raw.json and normalized.json are gitignored — large and free to regenerate.
 * scored.json is committed, because a future routine-based generator has to
 * read it out of the repo (PLAN.md §7).
 */

export async function writeStage(month, name, value) {
  const dir = stagingDir(month);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

/** Returns null when the stage has not run, so callers can decide to run it. */
export async function readStage(month, name) {
  try {
    return JSON.parse(await readFile(path.join(stagingDir(month), `${name}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`staging: cannot read ${month}/${name}.json: ${err.message}`);
  }
}
