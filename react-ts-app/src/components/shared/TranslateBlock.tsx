// A message you can read in your own language.
//
// The original is what shows until somebody asks; the translation then
// replaces it, with a line saying what it was written in, and "Show
// original" puts it back. Translating the same message twice costs
// nothing — the backend keeps it (see revenact-backend
// services/translation), and this keeps it for the life of the pane too.

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { LANGUAGES, languageName, translateRecord } from '../../features/translation/translationApi';
import type { TranslatableKind } from '../../features/translation/translationApi';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

export interface TranslateBlockProps {
  kind: TranslatableKind;
  id: number;
  /** The words as they arrived. Shown until a translation is asked for. */
  text: string;
  className?: string;
}

export function TranslateBlock({ kind, id, text, className }: TranslateBlockProps) {
  const [to, setTo] = useState('en');
  const [done, setDone] = useState<Record<string, { text: string; from: string }>>({});
  const [showing, setShowing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = showing ? done[showing] : null;
  const selectId = `translate-into-${kind}-${id}`;

  async function run() {
    setError(null);
    if (done[to]) {
      setShowing(to);
      return;
    }
    setBusy(true);
    try {
      const result = await translateRecord(kind, id, to);
      setDone((current) => ({ ...current, [to]: { text: result.text, from: result.detected_language } }));
      setShowing(to);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not translate this.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <p className="text-[13px] leading-relaxed text-ink max-w-[68ch] whitespace-pre-line">
        {shown ? shown.text : text}
      </p>

      {error ? <p className="text-[12px] text-danger" role="alert">{error}</p> : null}

      {text.trim() ? (
        <div className="flex flex-wrap items-center gap-2">
          {shown ? (
            <>
              <span className="text-[11.5px] text-ink-faint">
                Translated{shown.from ? ` from ${languageName(shown.from)}` : ''} into {languageName(showing ?? to)}
              </span>
              <button
                type="button"
                onClick={() => setShowing(null)}
                className={`text-[11.5px] font-semibold text-accent hover:underline rounded-sm ${FOCUS}`}
              >
                Show original
              </button>
            </>
          ) : (
            <>
              <label htmlFor={selectId} className="text-[11.5px] text-ink-faint">Translate into</label>
              <select
                id={selectId}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`px-2 py-1 bg-surface border border-line rounded-md text-[12px] text-ink focus:outline-none focus:border-accent ${FOCUS}`}
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>{language.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={run}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-subtle text-[12px] font-semibold text-ink-muted hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
              >
                <Languages className="w-3.5 h-3.5" aria-hidden="true" />
                {busy ? 'Translating…' : 'Translate'}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
