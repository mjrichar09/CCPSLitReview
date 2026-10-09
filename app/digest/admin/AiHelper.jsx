'use client';

import { useState } from 'react';
import { parseAiJson } from '../../../lib/topicPrompts.js';

/**
 * Copy a ready-made prompt, ask any AI assistant, paste its JSON back.
 *
 * `buildPrompt` is called on click, not render, so the prompt always carries
 * the editor's current topics and feeds. `onApply` receives the parsed JSON
 * and returns a one-line summary of what it did, or throws to show an error.
 */
export default function AiHelper({ title, intro, buildPrompt, onApply, applyLabel, disabled }) {
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState('');
  const [message, setMessage] = useState(null);

  const copy = async () => {
    const text = buildPrompt();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard can be blocked (permissions, non-secure context); show the
      // prompt so it can be selected and copied by hand instead.
      setReply('');
      setMessage({ kind: 'info', text });
    }
  };

  const apply = () => {
    try {
      const summary = onApply(parseAiJson(reply));
      setMessage({ kind: 'ok', text: summary });
      setReply('');
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
    }
  };

  return (
    <section className="ai-helper">
      <h3>{title}</h3>
      <ol className="ai-steps">
        <li>
          <button type="button" className="editor-button" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy AI prompt'}
          </button>{' '}
          {intro}
        </li>
        <li>Paste it into Claude, ChatGPT or similar, and finish the last line with what you want.</li>
        <li>Paste the reply here and apply it. Nothing is saved until you press Save.</li>
      </ol>
      <textarea
        className="mono"
        rows={4}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Paste the assistant’s JSON reply"
        disabled={disabled}
      />
      <button type="button" className="editor-button" onClick={apply} disabled={disabled || !reply.trim()}>
        {applyLabel}
      </button>
      {message?.kind === 'info' && (
        <>
          <p className="hint">Copying was blocked by the browser. Select and copy the prompt below instead.</p>
          <textarea className="mono" rows={8} readOnly value={message.text} onFocus={(e) => e.target.select()} />
        </>
      )}
      {message?.kind === 'ok' && <p className="editor-ok">{message.text}</p>}
      {message?.kind === 'error' && <p className="editor-error">{message.text}</p>}
    </section>
  );
}
