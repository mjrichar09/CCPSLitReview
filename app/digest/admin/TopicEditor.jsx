'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../../../lib/supabase/client.js';
import { useSession } from '../SessionProvider.jsx';
import baseConfig from '../../../config/digest.config.js';
import { loadConfig, resolveFeeds, resolveSource } from '../../../lib/config.js';
import { applyTopics, topicsDocErrors, topicErrors, pickNewer } from '../../../lib/topics.js';
import { topicPrompt, feedPrompt } from '../../../lib/topicPrompts.js';
import TopicForm from './TopicForm.jsx';
import FeedsEditor from './FeedsEditor.jsx';
import AiHelper from './AiHelper.jsx';
import Help from './Help.jsx';

/**
 * The topic and feed editor.
 *
 * Edits config/topics.json as data and saves each change as a new row in
 * `topic_config_versions`. Nothing here touches the repo: the monthly run
 * copies the newest saved version into config/topics.json before it fetches
 * (scripts/sync-topics.mjs), so a save takes effect at the next run, and the
 * deployed site picks it up when that run commits.
 *
 * Validation is the pipeline's own — `topicsDocErrors`, then `loadConfig` on
 * the built config — so a version that saves here cannot fail the run's
 * config check for a reason the editor did not show.
 *
 * Every row carries a client-only `_key`, stripped before validating or
 * saving: ids are editable and positions shift, and neither makes a stable
 * React key. `_new` marks a topic added in this editing session, the only
 * kind whose id may still be changed.
 */

let keySeq = 0;
const keyed = (x) => ({ ...x, _key: `k${(keySeq += 1)}` });
const strip = ({ _key, _new, ...rest }) => rest;
const toDoc = (state) => ({ topics: state.topics.map(strip), feeds: state.feeds.map(strip) });
const fromDoc = (doc) => ({ topics: doc.topics.map(keyed), feeds: doc.feeds.map(keyed) });

function validate(doc) {
  const errors = topicsDocErrors(doc);
  if (errors.length === 0) {
    try {
      loadConfig(applyTopics(baseConfig, doc), { env: {} });
    } catch (err) {
      errors.push(...err.message.split('\n  - ').slice(1));
    }
  }
  return errors;
}

function blankTopic(existing) {
  let n = 1;
  while (existing.some((t) => t.id === `new_topic_${n}`)) n += 1;
  return {
    id: `new_topic_${n}`,
    name: 'New topic',
    max_items: 10,
    rubric: '',
    mammalian_preference: true,
    keywords: [],
    anchor: 'bioprocess',
    sources: {},
  };
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function TopicEditor({ initialDoc }) {
  const supabase = useMemo(() => getSupabase(), []);
  const { ready, user, approved, isAdmin } = useSession();

  const [state, setState] = useState(() => fromDoc(initialDoc));
  const [base, setBase] = useState(() => ({
    source: 'file',
    version: initialDoc.version ?? null,
    at: initialDoc.updated_at ?? null,
    topicIds: new Set(initialDoc.topics.map((t) => t.id)),
    feedIds: new Set(initialDoc.feeds.map((f) => f.id)),
  }));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  // Read by the async initial load, which must not overwrite edits begun
  // while it was in flight.
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const [tab, setTab] = useState('topics');
  const [selectedKey, setSelectedKey] = useState(null);
  const [history, setHistory] = useState(null); // null = not loaded / unavailable
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const doc = useMemo(() => toDoc(state), [state]);
  const errors = useMemo(() => validate(doc), [doc]);
  const selected = state.topics.find((t) => t._key === selectedKey) ?? state.topics[0];

  const markBase = (source, version, at, d) =>
    setBase({
      source,
      version,
      at,
      topicIds: new Set(d.topics.map((t) => t.id)),
      feedIds: new Set(d.feeds.map((f) => f.id)),
    });

  const loadHistory = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('topic_config_versions')
      .select('id, note, created_at, profiles(display_name)')
      .order('id', { ascending: false })
      .limit(30);
    if (error) {
      setHistory(null);
      setStatus({ kind: 'error', text: `Saved versions are unavailable (${error.message}). Has the admin migration been applied?` });
      return null;
    }
    setHistory(data);
    return data;
  }, [supabase]);

  // Start from whichever is newer: the newest saved version, or the file this
  // build shipped with. Same rule as the monthly run (lib/topics.js pickNewer).
  useEffect(() => {
    if (!supabase || !ready || !user) return undefined;
    let alive = true;
    (async () => {
      const rows = await loadHistory();
      if (!alive || !rows?.length || dirtyRef.current) return;
      if (rows[0].id <= (initialDoc.version ?? 0)) return;
      const { data, error } = await supabase.from('topic_config_versions').select('id, body, created_at').eq('id', rows[0].id).single();
      if (!alive || error || dirtyRef.current) return;
      const picked = pickNewer(initialDoc, data);
      if (picked.source === 'saved') {
        setState(fromDoc(picked.doc));
        markBase('saved', data.id, data.created_at, picked.doc);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, ready, user, initialDoc, loadHistory]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (next) => {
    setState(next);
    setDirty(true);
    setStatus(null);
  };

  // --- topics ---------------------------------------------------------------
  const updateTopic = (key, topic) =>
    edit({ ...state, topics: state.topics.map((t) => (t._key === key ? { ...topic, _key: key, _new: t._new } : t)) });
  const addTopic = () => {
    const t = keyed({ ...blankTopic(state.topics), _new: true });
    edit({ ...state, topics: [...state.topics, t] });
    setSelectedKey(t._key);
  };
  const removeTopic = (key) => {
    const i = state.topics.findIndex((t) => t._key === key);
    const topics = state.topics.filter((t) => t._key !== key);
    edit({ ...state, topics });
    setSelectedKey(topics[Math.max(0, i - 1)]?._key ?? null);
  };
  const moveTopic = (key, dir) => {
    const i = state.topics.findIndex((t) => t._key === key);
    const j = i + dir;
    if (j < 0 || j >= state.topics.length) return;
    const topics = [...state.topics];
    [topics[i], topics[j]] = [topics[j], topics[i]];
    edit({ ...state, topics });
  };

  const applyAiTopics = (parsed) => {
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.topics) ? parsed.topics : [parsed];
    if (list.some((t) => !t || typeof t !== 'object' || typeof t.id !== 'string')) {
      throw new Error('Each topic needs at least an "id". Check the reply is the JSON object the prompt asked for.');
    }
    let topics = [...state.topics];
    const done = [];
    let last = null;
    for (const raw of list) {
      const t = keyed({ sources: {}, ...raw });
      const at = topics.findIndex((x) => x.id === t.id);
      if (at >= 0) {
        topics[at] = t;
        done.push(`replaced “${t.name ?? t.id}”`);
      } else {
        t._new = true;
        topics = [...topics, t];
        done.push(`added “${t.name ?? t.id}”`);
      }
      last = t._key;
    }
    edit({ ...state, topics });
    setSelectedKey(last);
    setTab('topics');
    const problems = list.flatMap((t) => topicErrors(t)).length;
    return `${done.join(', ')}.${problems ? ' It has problems to fix — see the topic form.' : ''} Review it, then save.`;
  };

  // --- feeds ----------------------------------------------------------------
  const setFeeds = (feeds) => edit({ ...state, feeds: feeds.map((f) => (f._key ? f : keyed(f))) });
  const addFeed = (feed) => edit({ ...state, feeds: [...state.feeds, keyed(feed)] });
  const applyAiFeeds = (parsed) => {
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.feeds) ? parsed.feeds : [parsed];
    if (list.some((f) => !f || typeof f !== 'object' || typeof f.id !== 'string')) {
      throw new Error('Each feed needs at least an "id". Check the reply is the JSON array the prompt asked for.');
    }
    let feeds = [...state.feeds];
    let added = 0;
    let changed = 0;
    for (const raw of list) {
      const at = feeds.findIndex((f) => f.id === raw.id);
      if (at >= 0) {
        feeds[at] = keyed({ ...strip(feeds[at]), ...raw });
        changed += 1;
      } else {
        feeds = [...feeds, keyed(raw)];
        added += 1;
      }
    }
    edit({ ...state, feeds });
    setTab('feeds');
    return `${added} added, ${changed} changed. Check the URLs, then save.`;
  };

  const usedBy = useMemo(() => {
    const map = new Map();
    try {
      const built = applyTopics(baseConfig, doc);
      for (const category of built.categories) {
        if (!resolveSource(built, category, 'rss').enabled) continue;
        for (const feed of resolveFeeds(built, category)) {
          map.set(feed.id, [...(map.get(feed.id) ?? []), category.name]);
        }
      }
    } catch {
      // An invalid document shows its errors elsewhere; "used by" just goes blank.
    }
    return map;
  }, [doc]);

  // --- save / restore -------------------------------------------------------
  const save = async () => {
    if (!supabase || errors.length > 0) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('topic_config_versions')
      .insert({ body: doc, note: note.trim() || null })
      .select('id, created_at')
      .single();
    setSaving(false);
    if (error) {
      setStatus({ kind: 'error', text: `Not saved: ${error.message}` });
      return;
    }
    markBase('saved', data.id, data.created_at, doc);
    setDirty(false);
    setNote('');
    setStatus({ kind: 'ok', text: `Saved as version ${data.id}. It takes effect at the next monthly run.` });
    loadHistory();
  };

  const loadVersion = async (id) => {
    const { data, error } = await supabase.from('topic_config_versions').select('id, body').eq('id', id).single();
    if (error) {
      setStatus({ kind: 'error', text: `Could not load version ${id}: ${error.message}` });
      return;
    }
    setState(fromDoc(data.body));
    setSelectedKey(null);
    setDirty(true);
    setTab('topics');
    setStatus({ kind: 'info', text: `Loaded version ${id} into the editor. Save to make it the current version again.` });
  };

  const discard = () => {
    // Back to the version the editor was last based on.
    if (base.source === 'saved' && base.version) {
      loadVersion(base.version).then(() => {
        setDirty(false);
        setStatus(null);
      });
    } else {
      setState(fromDoc(initialDoc));
      setDirty(false);
      setStatus(null);
    }
  };

  // --- render ---------------------------------------------------------------
  const readOnly = !isAdmin;
  const selectedErrors = selected
    ? [
        ...topicErrors(strip(selected)),
        ...(state.topics.filter((t) => t.id === selected.id).length > 1 ? [`id: “${selected.id}” is used by another topic`] : []),
      ]
    : [];

  return (
    <div className="topic-editor">
      <div className="editor-bar">
        <div className="editor-bar-state">
          <span>
            {base.source === 'saved'
              ? `Based on saved version ${base.version}${base.at ? `, ${fmt(base.at)}` : ''}`
              : `Based on the committed file${base.version ? ` (version ${base.version})` : ''}`}
          </span>
          {dirty && <span className="badge badge-degraded">Unsaved changes</span>}
          {errors.length > 0 && (
            <span className="badge badge-failed">
              {errors.length} problem{errors.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {isAdmin ? (
          <div className="editor-bar-save">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What changed? (optional)"
              maxLength={500}
              aria-label="Note for this version"
            />
            <button type="button" className="editor-button editor-primary" onClick={save} disabled={!dirty || saving || errors.length > 0}>
              {saving ? 'Saving…' : 'Save version'}
            </button>
            {dirty && (
              <button type="button" className="link-button" onClick={discard}>
                Discard
              </button>
            )}
          </div>
        ) : (
          <span className="hint">
            {approved ? 'Read-only: only admins can save changes.' : 'Sign in as an approved reader to view.'}
          </span>
        )}
      </div>
      {status && <p className={`editor-${status.kind}`}>{status.text}</p>}
      {dirty && errors.length > 0 && (
        <details className="editor-all-errors">
          <summary>Fix these before saving</summary>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      <Help title="How topic changes take effect">
        <p>
          Saving stores a new numbered version; nothing changes immediately. At the start of each monthly run (the 2nd,
          06:17 UTC) the newest saved version is checked and becomes the config that month is searched and scored
          with. Past months are never rewritten. Every saved version stays in History, so a bad change is undone by
          loading an earlier version and saving it again.
        </p>
        <p>
          A topic’s ID is fixed once saved, because past months, links and reader votes refer to it. To rename, change
          the Name. Removing a topic stops it being searched from the next run; past months keep it.
        </p>
      </Help>

      <div className="editor-tabs" role="tablist">
        {[
          ['topics', `Topics (${state.topics.length})`],
          ['feeds', `Feeds (${state.feeds.length})`],
          ['history', 'History'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'tab tab-on' : 'tab'} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'topics' && (
        <div className="editor-grid">
          <aside className="topic-list">
            <ol>
              {state.topics.map((t, i) => {
                const bad = topicErrors(strip(t)).length > 0;
                return (
                  <li key={t._key} className={t._key === selected?._key ? 'topic-item topic-item-on' : 'topic-item'}>
                    <button type="button" className="topic-pick" onClick={() => setSelectedKey(t._key)}>
                      <span className="topic-pick-name">
                        {bad && <span className="dot-bad" title="Has problems" aria-label="Has problems" />}
                        {t.name || t.id}
                      </span>
                      <span className="topic-pick-id">
                        {t.id}
                        {!base.topicIds.has(t.id) && ' · new'}
                      </span>
                    </button>
                    {!readOnly && (
                      <span className="topic-item-actions">
                        <button type="button" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => moveTopic(t._key, -1)}>
                          ↑
                        </button>
                        <button type="button" aria-label={`Move ${t.name} down`} disabled={i === state.topics.length - 1} onClick={() => moveTopic(t._key, 1)}>
                          ↓
                        </button>
                        <button type="button" aria-label={`Remove ${t.name}`} onClick={() => removeTopic(t._key)}>
                          ✕
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {!readOnly && (
              <button type="button" className="editor-button" onClick={addTopic}>
                Add topic
              </button>
            )}
          </aside>

          <div className="topic-main">
            {selected && (
              <TopicForm
                key={selected._key}
                topic={strip(selected)}
                onChange={(t) => updateTopic(selected._key, t)}
                idEditable={Boolean(selected._new)}
                feeds={doc.feeds}
                errors={selectedErrors}
                disabled={readOnly}
              />
            )}
            <AiHelper
              title="Draft or change a topic with AI"
              intro="It includes the format, guidance on rubrics and keywords, and your current topics so the AI can avoid overlap."
              buildPrompt={() => topicPrompt({ topics: doc.topics, feeds: doc.feeds })}
              onApply={applyAiTopics}
              applyLabel="Add to topics"
              disabled={readOnly}
            />
          </div>
        </div>
      )}

      {tab === 'feeds' && (
        <div>
          <Help title="How feeds are used">
            <p>
              Feeds are trade press and agency news, read as RSS. Each topic either reads every enabled feed or only
              the feeds carrying the tags it picks (on the topic form), and then keeps only headlines matching its
              trade-press terms. <strong>Used by</strong> shows which topics will actually read each feed.
            </p>
            <p>
              The URL must be the feed itself, usually ending in <code>/feed</code>, <code>/rss</code> or{' '}
              <code>.xml</code>, not the site’s home page. A feed that stops working does not break a run: it is
              marked failed in the source-health footer of that month and the rest continues.
            </p>
          </Help>
          <FeedsEditor
            feeds={state.feeds}
            onChange={setFeeds}
            onAdd={addFeed}
            usedBy={usedBy}
            savedIds={base.feedIds}
            disabled={readOnly}
          />
          <AiHelper
            title="Find or change feeds with AI"
            intro="It includes the format, your current feeds and tags, and which topics read which tags."
            buildPrompt={() => feedPrompt({ feeds: doc.feeds, topics: doc.topics })}
            onApply={applyAiFeeds}
            applyLabel="Apply to feeds"
            disabled={readOnly}
          />
        </div>
      )}

      {tab === 'history' && (
        <div className="history">
          {history === null ? (
            <p className="hint">{supabase ? 'Saved versions are unavailable.' : 'Sign-in is not configured for this deployment.'}</p>
          ) : history.length === 0 ? (
            <p className="hint">No versions saved yet. The digest runs on the committed file until the first save.</p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Saved</th>
                  <th>By</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {h.id}
                      {h.id === base.version && ' · current'}
                      {h.id === initialDoc.version && ' · live on site'}
                    </td>
                    <td>{fmt(h.created_at)}</td>
                    <td>{h.profiles?.display_name ?? '—'}</td>
                    <td>{h.note ?? ''}</td>
                    <td>
                      <button type="button" className="link-button" onClick={() => loadVersion(h.id)}>
                        Load into editor
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
