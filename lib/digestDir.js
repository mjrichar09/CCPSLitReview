import path from 'node:path';

// Single source of truth for where digest JSON lives.
// Resolved from the process cwd so it works for both the Next.js server and
// the standalone pipeline scripts, which both run from the repo root.
export const DIGEST_DIR = path.join(process.cwd(), 'data', 'digest');

/** Dedupe ledger + any year shards. */
export const INDEX_DIR = path.join(DIGEST_DIR, 'index');

/** Per-month pipeline artifacts (raw/normalized gitignored, scored committed). */
export const STAGING_DIR = path.join(DIGEST_DIR, 'staging');

/** Absolute path of the staging directory for one month. */
export function stagingDir(month) {
  return path.join(STAGING_DIR, month);
}
