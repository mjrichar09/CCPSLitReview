import path from 'node:path';

// Single source of truth for where digest JSON lives.
// Resolved from the process cwd so it works for both the Next.js server and
// the standalone pipeline scripts, which both run from the repo root.
//
// DIGEST_DIR in the environment overrides it. That exists so the write stage can
// be tested against a temp directory rather than the repo's real data — the
// append-only guard is only meaningful if a test can create a month file and
// watch the second write refuse. Nothing in the app or the workflow sets it.
export const DIGEST_DIR = process.env.DIGEST_DIR || path.join(process.cwd(), 'data', 'digest');

/** Dedupe ledger + any year shards. */
export const INDEX_DIR = path.join(DIGEST_DIR, 'index');

/** Per-month pipeline artifacts (raw/normalized gitignored, scored committed). */
export const STAGING_DIR = path.join(DIGEST_DIR, 'staging');

/** Absolute path of the staging directory for one month. */
export function stagingDir(month) {
  return path.join(STAGING_DIR, month);
}
