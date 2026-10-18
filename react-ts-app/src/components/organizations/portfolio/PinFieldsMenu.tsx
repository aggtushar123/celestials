import { useEffect, useRef, type RefObject } from 'react';
import type { ColumnId } from '../tableData';
import { MAX_PINS } from '../../../features/organizations/pinnedFields';
import { PANELS, PANEL_ORDER, PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import { FOCUS } from './styles';
import { NUM, OVERLAY, TYPE } from '../../ui';
import { useDismiss } from '../../../lib/useDismiss';

/** Replaces the old "Edit columns" popover: pick up to three fields to show
 *  as chips on every row (spec §1 "Pin a field"). */
export function PinFieldsMenu({
  pins,
  onToggle,
  onClose,
  triggerRef,
}: {
  pins: ColumnId[];
  onToggle: (id: ColumnId) => void;
  onClose: () => void;
  /** The toolbar's "Pin fields" button, excluded from the "click outside"
   *  close check and where focus goes back to on close (see FiltersPanel's
   *  triggerRef for why the trigger itself must never count as outside). */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Escape hands focus back to the trigger. An outside press doesn't: the
  // user moved focus somewhere on purpose, so the browser's own focus change
  // is left alone instead of being fought right after.
  const restoreFocus = useRef(true);
  const fallbackRef = useRef<HTMLElement | null>(null);
  useDismiss(triggerRef ? [ref, triggerRef] : ref, (reason) => {
    restoreFocus.current = reason === 'escape';
    onClose();
  });
  useEffect(() => {
    restoreFocus.current = true;
    fallbackRef.current = document.activeElement as HTMLElement | null;
    const trigger = triggerRef?.current ?? null;
    ref.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      if (restoreFocus.current) (trigger ?? fallbackRef.current)?.focus();
    };
  }, [triggerRef]);

  const full = pins.length >= MAX_PINS;
  return (
    <div ref={ref} role="dialog" aria-label="Pin fields" className={`absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[20rem] overflow-y-auto p-4 ${OVERLAY}`}>
      <h2 className={TYPE.title}>Pin fields</h2>
      <p className={`mt-1 ${TYPE.meta}`}>Up to {MAX_PINS} fields show on every row.</p>
      <p className={`${NUM} ${TYPE.meta}`}>{`${pins.length} of ${MAX_PINS} pinned`}</p>
      <div className="mt-3 flex flex-col gap-3">
        {PANELS.map((panel) => (
          <fieldset key={panel.key}>
            <legend className={`mb-1 ${TYPE.label}`}>{panel.title}</legend>
            {PANEL_ORDER[panel.key].map((id) => {
              const checked = pins.includes(id);
              return (
                <label key={id} className={`flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] ${!checked && full ? 'text-ink-faint' : 'text-ink'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() => onToggle(id)}
                    className={`w-4 h-4 accent-accent ${FOCUS} disabled:cursor-not-allowed`}
                  />
                  {PORTFOLIO_FIELDS[id].label}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
