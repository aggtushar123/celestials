import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ESCALATION, fromMarkers, markerOf, toMarkers, withoutMarker } from '../../features/agents/escalationText';
import type { Placeholder } from '../../features/agents/bundleTypes';
import { FIELD_ERROR, ICON_BUTTON, INPUT, INVALID, TYPE } from '../ui';

const AREA = `${INPUT} ${INVALID} min-h-24 py-2`;

/** A Slack escalation's reply text (Slack escalations D4 frontend Decision 3;
 *  spec 5.5): each Jira placeholder reads as a bracketed marker and has a
 *  chip under the field that removes it. Markers the stored text had are
 *  kept; one typed beyond those stays words, so a chip is never typed. */
export function ReplyText({ id, label, value, stored, placeholders, error, onChange }: { id: string; label: string; value: string; stored: string; placeholders: Placeholder[]; error?: string; onChange: (raw: string) => void }) {
  const shown = toMarkers(value, placeholders);
  const mine = placeholders.filter((p) => p.field === 'text');
  const present = mine.filter((p) => shown.includes(markerOf(p)));
  const step = mine[0]?.step;
  const describedBy = [error ? `${id}-error` : null, `${id}-hint`].filter(Boolean).join(' ');
  // A removed chip's button unmounts: focus moves to the next chip's, else the field.
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    const label = focusNext.current;
    focusNext.current = null;
    const next = label ? chipsRef.current?.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(label)}"]`) : null;
    (next ?? areaRef.current)?.focus();
  });
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      <textarea ref={areaRef} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={AREA} value={shown} onChange={(event) => onChange(fromMarkers(event.target.value, stored, placeholders))} />
      <p id={`${id}-hint`} className={TYPE.meta}>
        {ESCALATION.KEEP_MARKERS}
      </p>
      {present.length > 0 && step !== undefined ? (
        <div ref={chipsRef} className="flex flex-wrap items-center gap-2">
          <span className={TYPE.meta}>{ESCALATION.fillsIn(step)}</span>
          {present.map((p, i) => (
            <span key={`${p.step}.${p.key}`} data-part="placeholder" className={`inline-flex items-center gap-1 rounded-full border border-line bg-subtle pl-2 ${TYPE.body} font-semibold`}>
              {p.label}
              <button type="button" aria-label={ESCALATION.remove(p.label)} onClick={() => {
                  const next = present[i + 1];
                  focusNext.current = next ? ESCALATION.remove(next.label) : '';
                  onChange(fromMarkers(withoutMarker(shown, markerOf(p)), stored, placeholders));
                }} className={ICON_BUTTON}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
