// Apply, remove and create Gmail labels on the open conversation or the
// selection (spec §4, Decision 13). A box per label: ticked when every
// message (or every selected conversation) carries it, mixed when some do.
// A new label is made at once and created in Gmail on the next tick
// (contract decision 20); the caller applies it straight away. The panel
// is portalled and fixed beside its button, so the mailbox's clipping glass
// shell never cuts it off (as ui/Menu does).

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Tag } from 'lucide-react';
import type { MailLabelEntry } from '../../features/mail/mailboxSlice';
import type { LabelState } from '../../features/mail/mailOptimistic';
import { LABELS_NONE, LABEL_CREATING, LABEL_PENDING } from '../../features/mail/mailText';
import { useDismiss } from '../../lib/useDismiss';
import { BUTTON, FOCUS, ICON_BUTTON, INPUT, INVALID, OVERLAY, TYPE } from '../../components/ui';
import { LabelDot } from './MailLabels';

/** Gap between the button and the panel (Tailwind's mt-1). */
const GAP = 4;
const FOCUSABLE = 'input:not([disabled]), button:not([disabled])';

/** Fixed beside the button: below it unless that runs off the bottom and it
 *  fits above, right edges aligned, never past either side of the viewport. */
function placeFor(button: HTMLElement, panel: HTMLElement): CSSProperties {
  const at = button.getBoundingClientRect();
  const { width, height } = panel.getBoundingClientRect();
  const viewHeight = window.innerHeight;
  const viewWidth = document.documentElement.clientWidth || window.innerWidth;
  const above = at.bottom + GAP + height > viewHeight && at.top - GAP - height >= 0;
  const left = Math.max(GAP, Math.min(at.right - width, viewWidth - width - GAP));
  return above ? { position: 'fixed', left, bottom: viewHeight - at.top + GAP } : { position: 'fixed', left, top: at.bottom + GAP };
}

export function LabelMenu({
  variant,
  labels,
  stateOf,
  disabled = false,
  disabledReason = null,
  onToggle,
  onCreate,
}: {
  /** An icon in the conversation's toolbar; a worded button in the bulk bar. */
  variant: 'icon' | 'button';
  labels: MailLabelEntry[];
  stateOf: (id: number) => LabelState;
  disabled?: boolean;
  disabledReason?: string | null;
  onToggle: (id: number, add: boolean) => void;
  /** Resolves to the refusal's sentence, or null once it is made and applied. */
  onCreate: (name: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  useDismiss(
    [triggerRef, panelRef],
    (reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    },
    open,
  );

  // A busy mailbox shuts the panel: no second label action while one is in flight.
  if (disabled && open) setOpen(false);

  // Placed before paint, and again if the page scrolls or resizes under it.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current && panelRef.current) setStyle(placeFor(triggerRef.current, panelRef.current));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      setStyle(null);
    };
  }, [open]);

  // Focus enters the panel once it is placed (a hidden element refuses it).
  const shown = open && style !== null;
  useEffect(() => {
    if (shown) panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [shown]);

  // The panel sits at the end of the page: Tab off either end hands focus
  // back to the button instead of leaving the page.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const edge = event.shiftKey ? all[0] : all[all.length - 1];
    if (document.activeElement === edge || all.length === 0) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    const refusal = await onCreate(trimmed);
    setCreating(false);
    if (refusal) setError(refusal);
    else setName('');
  }

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Labels"
      onKeyDown={onKeyDown}
      style={style ?? { position: 'fixed', visibility: 'hidden' }}
      className={`z-50 flex max-h-[60dvh] w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto p-3 ${OVERLAY}`}
    >
      <fieldset>
        <legend className={`mb-1 ${TYPE.label}`}>Apply labels</legend>
        {labels.length === 0 ? <p className={TYPE.bodyMuted}>{LABELS_NONE}</p> : null}
        {labels.map((label) => {
          const state = stateOf(label.id);
          return (
            <label key={label.id} className="flex min-h-11 items-center gap-2 text-[13px] leading-5 text-ink sm:min-h-8">
              <input
                type="checkbox"
                checked={state === 'all'}
                ref={(box) => {
                  if (box) box.indeterminate = state === 'some';
                }}
                onChange={() => onToggle(label.id, state !== 'all')}
                className={`h-4 w-4 accent-accent ${FOCUS}`}
              />
              <LabelDot label={label} />
              <span className="min-w-0 flex-1 truncate">{label.name}</span>
              {label.pending ? <span className={TYPE.meta}>{LABEL_PENDING}</span> : null}
            </label>
          );
        })}
      </fieldset>
      <form onSubmit={create} className="flex flex-col gap-1 border-t border-line-subtle pt-3">
        <label htmlFor={fieldId} className={TYPE.label}>
          New label
        </label>
        <div className="flex gap-2">
          <input
            id={fieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={225}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={`${INPUT} ${INVALID}`}
          />
          <button type="submit" disabled={creating || name.trim() === ''} className={BUTTON}>
            {creating ? LABEL_CREATING : 'Create'}
          </button>
        </div>
        {error ? (
          <p id={`${fieldId}-error`} role="alert" className="flex items-start gap-1 text-[11px] leading-4 text-danger-ink">
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </form>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        title={disabledReason ?? 'Labels'}
        aria-label={variant === 'icon' ? 'Labels' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={variant === 'icon' ? ICON_BUTTON : BUTTON}
      >
        <Tag className="h-4 w-4" aria-hidden="true" />
        {variant === 'button' ? 'Label' : null}
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </>
  );
}
