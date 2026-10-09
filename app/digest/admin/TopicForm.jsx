'use client';

import { buildCategory } from '../../../lib/topics.js';
import { feedTags } from '../../../lib/topicPrompts.js';
import ListField from './ListField.jsx';
import Help from './Help.jsx';

/** What each source does when a topic says nothing about it — mirrors config/digest.config.js. */
const SOURCE_DEFAULT_ON = { pubmed: true, europepmc: true, biorxiv: false, arxiv: false, rss: true };

/**
 * Write one source's settings back, dropping anything equal to its default so
 * the saved JSON stays as small as the hand-written config was. Keys this form
 * does not know about (Europe PMC paging on modeling_ml) are kept.
 */
function withSource(topic, sid, patch) {
  const next = { ...(topic.sources?.[sid] ?? {}), ...patch };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[k];
  }
  if (next.enabled === SOURCE_DEFAULT_ON[sid]) delete next.enabled;
  const sources = { ...topic.sources };
  if (Object.keys(next).length === 0) delete sources[sid];
  else sources[sid] = next;
  return { ...topic, sources };
}

const isOn = (topic, sid) => topic.sources?.[sid]?.enabled ?? SOURCE_DEFAULT_ON[sid];

export default function TopicForm({ topic, onChange, idEditable, feeds, errors, disabled }) {
  const set = (patch) => onChange({ ...topic, ...patch });
  const setSource = (sid, patch) => onChange(withSource(topic, sid, patch));
  const f = (name) => `topic-${topic.id}-${name}`;

  let preview = null;
  try {
    preview = buildCategory(topic).sources;
  } catch {
    preview = null;
  }
  const tags = feedTags(feeds);
  const rssTags = topic.sources?.rss?.tags ?? [];

  return (
    <fieldset className="topic-form" disabled={disabled}>
      {errors.length > 0 && (
        <ul className="editor-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="form-row-3">
        <div className="field">
          <label htmlFor={f('name')}>Name</label>
          <input id={f('name')} type="text" value={topic.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={f('id')}>ID</label>
          <input
            id={f('id')}
            type="text"
            value={topic.id}
            onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
            disabled={!idEditable}
            title={idEditable ? '' : 'Fixed once saved: past months, links and reader votes refer to it'}
          />
        </div>
        <div className="field field-narrow">
          <label htmlFor={f('max')}>Papers per month</label>
          <input
            id={f('max')}
            type="number"
            min={1}
            max={50}
            value={topic.max_items}
            onChange={(e) => set({ max_items: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={f('rubric')}>Scoring rubric</label>
        <Help title="What makes a good rubric">
          <p>
            Every paper the searches find is scored 0-5 against this text by an AI model, and only papers scoring 3 or
            more are kept. It is written <strong>for the model</strong>, so be concrete: list the subtopics, methods,
            parameters and outcomes that count.
          </p>
          <ul>
            <li>
              Where this topic could overlap another, add a sentence like <em>“Boundary with upstream_pd: if the lever
              is the cell line, it belongs here; if it is how the bioreactor is run, it belongs there.”</em>
            </li>
            <li>
              Put hard requirements on their own line starting <em>“REQUIRED:”</em> — e.g. that the work must have an
              actual bioprocess application rather than a passing mention.
            </li>
            <li>Say what to exclude if the searches keep returning a kind of paper you never want.</li>
          </ul>
        </Help>
        <textarea id={f('rubric')} rows={9} value={topic.rubric} onChange={(e) => set({ rubric: e.target.value })} />
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(topic.mammalian_preference)}
          onChange={(e) => set({ mammalian_preference: e.target.checked })}
        />
        Prefer mammalian / CHO work when scoring
        <span className="check-hint">
          Adds the shared expression-system paragraph: microbial, plant and insect work scores 0 unless the method
          clearly transfers. Leave off for regulatory and industry-news topics.
        </span>
      </label>

      <div className="form-row-2">
        <div className="field">
          <label htmlFor={f('keywords')}>Search keywords — one per line</label>
          <Help title="How keywords become a search">
            <p>
              Each keyword is searched in paper titles and abstracts on PubMed (and Europe PMC, unless it has a custom
              query below). A paper matching <strong>any</strong> keyword is a candidate; the rubric then decides.
            </p>
            <ul>
              <li>Use specific phrases as authors write them: “depth filtration”, “N-1 perfusion”.</li>
              <li>A trailing * is a wildcard: “soft sensor*” also finds “soft sensors”.</li>
              <li>Avoid single generic words (“model”, “protein”) — they flood the search and cost scoring time.</li>
            </ul>
          </Help>
          <ListField
            key={f('kw')}
            id={f('keywords')}
            value={topic.keywords ?? []}
            onChange={(keywords) => set({ keywords })}
            rows={10}
            placeholder={'depth filtration\nharvest clarification\nflocculation'}
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor={f('anchor')}>Bioprocess context</label>
          <select id={f('anchor')} value={topic.anchor ?? 'bioprocess'} onChange={(e) => set({ anchor: e.target.value })}>
            <option value="bioprocess">Required (recommended)</option>
            <option value="none">Not required</option>
          </select>
          <p className="hint">
            “Required” also demands one of CHO, cell culture, bioreactor, biomanufacturing, monoclonal antibody or
            bioprocess in the paper, and drops papers whose title is about E. coli, yeast, plant or insect systems. It
            removes most clinical noise.
          </p>

          <p className="field-label">Sources</p>
          <div className="source-list">
            <label className="check">
              <input type="checkbox" checked={isOn(topic, 'pubmed')} onChange={(e) => setSource('pubmed', { enabled: e.target.checked })} />
              PubMed
            </label>
            <label className="check">
              <input type="checkbox" checked={isOn(topic, 'europepmc')} onChange={(e) => setSource('europepmc', { enabled: e.target.checked })} />
              Europe PMC
            </label>
            <label className="check">
              <input type="checkbox" checked={isOn(topic, 'biorxiv')} onChange={(e) => setSource('biorxiv', { enabled: e.target.checked })} />
              Preprints (bioRxiv / medRxiv)
              <span className="check-hint">Uses this topic’s Europe PMC search, limited to preprints.</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={isOn(topic, 'arxiv')} onChange={(e) => setSource('arxiv', { enabled: e.target.checked })} />
              arXiv
              <span className="check-hint">For modelling and ML work. Needs an arXiv query (Advanced).</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={isOn(topic, 'rss')} onChange={(e) => setSource('rss', { enabled: e.target.checked })} />
              Trade press (RSS feeds)
            </label>
          </div>
        </div>
      </div>

      {isOn(topic, 'rss') && (
        <div className="form-row-2">
          <div className="field">
            <label htmlFor={f('rssterms')}>Trade press: keep headlines containing — comma-separated</label>
            <ListField
              key={f('rss')}
              id={f('rssterms')}
              separator="comma"
              keepTrailingSpace
              value={topic.sources?.rss?.terms ?? []}
              onChange={(terms) => setSource('rss', { terms })}
              placeholder="perfusion, seed train, intensified"
              disabled={disabled}
            />
            <p className="hint">
              Lowercase. Empty keeps every article, which only suits a news topic. A trailing space (“pat ”) stops a
              short term matching inside longer words.
            </p>
          </div>
          <div className="field">
            <p className="field-label">Trade press: read feeds tagged</p>
            <div className="tag-picks">
              {tags.map((t) => (
                <label key={t} className="check check-inline">
                  <input
                    type="checkbox"
                    checked={rssTags.includes(t)}
                    onChange={(e) =>
                      setSource('rss', { tags: e.target.checked ? [...rssTags, t] : rssTags.filter((x) => x !== t) })
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
            <p className="hint">None ticked reads every enabled feed.</p>
          </div>
        </div>
      )}

      <details className="advanced">
        <summary>Advanced: custom queries and notes</summary>
        <p className="hint">
          A custom query replaces the keyword search for that source, for searches the keyword list cannot express.
          Leave blank to build it from the keywords.
        </p>
        {['pubmed', 'europepmc'].map((sid) => (
          <div className="field" key={sid}>
            <label htmlFor={f(`${sid}q`)}>
              {sid === 'pubmed' ? 'PubMed' : 'Europe PMC'} custom query
              {topic.sources?.[sid]?.query && (
                <button type="button" className="link-button" onClick={() => setSource(sid, { query: undefined })}>
                  Use keywords instead
                </button>
              )}
            </label>
            <textarea
              id={f(`${sid}q`)}
              className="mono"
              rows={3}
              value={topic.sources?.[sid]?.query ?? ''}
              onChange={(e) => setSource(sid, { query: e.target.value })}
              placeholder="Blank: built from the keywords"
            />
          </div>
        ))}
        <div className="field">
          <label htmlFor={f('arxivq')}>arXiv query</label>
          <textarea
            id={f('arxivq')}
            className="mono"
            rows={2}
            value={topic.sources?.arxiv?.query ?? ''}
            onChange={(e) => setSource('arxiv', { query: e.target.value })}
            placeholder={'"cell culture" OR bioreactor OR "monoclonal antibody"'}
          />
        </div>
        <div className="field">
          <label htmlFor={f('notes')}>Notes (for editors; not used in searching or scoring)</label>
          <textarea
            id={f('notes')}
            rows={2}
            value={topic.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value || undefined })}
          />
        </div>
        {preview?.pubmed?.query && (
          <div className="field">
            <p className="field-label">The PubMed search this topic will run</p>
            <pre className="query-preview">{preview.pubmed.query}</pre>
          </div>
        )}
      </details>
    </fieldset>
  );
}
