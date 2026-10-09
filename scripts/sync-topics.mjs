#!/usr/bin/env node
/**
 * Copy the newest topic/feed configuration saved on the site into
 * config/topics.json, so this run — and the commit it makes — use it.
 *
 * Runs at the start of the monthly workflow, before config validation. The
 * rule for which copy wins is `pickNewer` (lib/topics.js): a saved version
 * newer than the one the file records is written over the file; otherwise the
 * file stands, which is what keeps a hand edit in git from being overwritten.
 *
 * Disabled, not failed, when SUPABASE_URL / SUPABASE_ANON_KEY are absent —
 * a deployment without the site editor still runs on the committed file.
 * Once configured, an unreadable table or a saved version that does not
 * validate halts the run: running a month on a config other than the one an
 * admin saved, without saying so, is the failure this exists to prevent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseServer, isSupabaseServerConfigured } from '../lib/supabase/server.js';
import { pickNewer, topicsDocErrors, applyTopics } from '../lib/topics.js';
import { loadConfig } from '../lib/config.js';
import baseConfig from '../config/digest.config.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'topics.json');

async function main() {
  if (!isSupabaseServerConfigured()) {
    console.log('sync-topics: SUPABASE_URL/SUPABASE_ANON_KEY not set; using the committed config/topics.json');
    return;
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('topic_config_versions')
    .select('id, body, note, created_at')
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw new Error(`sync-topics: could not read topic_config_versions: ${error.message}`);

  const fileDoc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const { source, doc } = pickNewer(fileDoc, data?.[0] ?? null);
  if (source === 'file') {
    console.log(`sync-topics: config/topics.json is current (version ${fileDoc.version ?? 'unsynced'})`);
    return;
  }

  const errors = topicsDocErrors(doc);
  if (errors.length > 0) {
    throw new Error(`sync-topics: saved version ${doc.version} is invalid:\n  - ${errors.join('\n  - ')}`);
  }
  // The same validation the pipeline applies at startup, on the built config.
  loadConfig(applyTopics(baseConfig, doc));

  const out = { version: doc.version, updated_at: doc.updated_at, topics: doc.topics, feeds: doc.feeds };
  fs.writeFileSync(FILE, `${JSON.stringify(out, null, 2)}\n`);
  const note = data[0].note ? ` — "${data[0].note}"` : '';
  console.log(
    `sync-topics: applied saved version ${doc.version}${note} (${doc.topics.length} topics, ${doc.feeds.length} feeds)`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
