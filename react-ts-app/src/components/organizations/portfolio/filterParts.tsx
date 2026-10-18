// The Filters sheet's frame and fields, shared by every portfolio's panel
// (Organizations, Accounts, Pipelines), with the select class they share.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, Download, Plus, X } from 'lucide-react';
import { trapTab } from '../../../lib/focusTrap';
import { BUTTON, ICON_BUTTON, OVERLAY, Select, TYPE } from '../../ui';
import { FOCUS, PRIMARY } from './styles';

export const FILTER_SELECT = `min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink hover:border-line-strong disabled:bg-subtle disabled:text-ink-faint ${FOCUS}`;

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className={`w-4 h-4 accent-accent ${FOCUS}`} />
      {label}
    </label>
  );
}

export function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] text-ink">
      <input type="radio" name={name} checked={checked} onChange={onChange} className={`w-4 h-4 accent-accent ${FOCUS}`} />
      {label}
    </label>
  );
}

export function FilterGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className={`mb-1 ${TYPE.label}`}>{legend}</legend>
      {children}
    </fieldset>
  );
}

/** Group and sort as two labelled selects and a direction toggle. `group`
 *  is an option value ('none' for no grouping); `sort` is a sort key with a
 *  '-' prefix when descending. */
export function GroupSortFields({
  group,
  sort,
  groupOptions,
  sortOptions,
  onGroup,
  onSort,
}: {
  group: string;
  sort: string;
  groupOptions: { value: string; label: string }[];
  sortOptions: { value: string; label: string }[];
  onGroup: (value: string) => void;
  onSort: (sort: string) => void;
}) {
  const descending = sort.startsWith('-');
  const field = sort.replace(/^-/, '');
  return (
    <>
      <Select label="Group" labelPosition="inline" value={group} onChange={onGroup} options={groupOptions} />
      <span className="flex items-center gap-1.5">
        <Select label="Sort by" labelPosition="inline" value={field} onChange={(value) => onSort(`${descending ? '-' : ''}${value}`)} options={sortOptions} />
        <button
          type="button"
          aria-pressed={descending}
          aria-label={descending ? 'Descending' : 'Ascending'}
          title={descending ? 'High to low' : 'Low to high'}
          onClick={() => onSort(descending ? field : `-${field}`)}
          className={`${ICON_BUTTON} border border-line`}
        >
          {descending ? <ArrowDown className="h-4 w-4" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
        </button>
      </span>
    </>
  );
}

/** The Filters sheet's phone-only footer: Export then "Add {noun}", shared
 *  by every portfolio (Organizations, Accounts, Pipelines) rather than
 *  hand-rolled per panel. From `sm` the toolbar carries these instead. */
export function FilterSheetFooter({
  onExport,
  exporting,
  onAdd,
  addLabel,
}: {
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line-subtle pt-4">
      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        className={`${BUTTON} justify-center`}
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        {exporting ? 'Exporting…' : 'Export'}
      </button>
      <button type="button" onClick={onAdd} className={`${PRIMARY} justify-center`}>
        <Plus className="w-4 h-4" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}

/** The Filters frame: from `sm` a popover under the toolbar, below `sm` a
 *  modal bottom sheet. Its first field takes focus (`initialFocusRef`).
 *  Escape, the close button and applying a choice hand focus back to the
 *  trigger; an outside click doesn't (the user moved focus on purpose). */
export function FilterSheet({
  isSm,
  onClose,
  triggerRef,
  initialFocusRef,
  children,
}: {
  isSm: boolean;
  onClose: () => void;
  /** The toolbar's "Filters" button. Excluded from the "click outside"
   *  close check entirely — not just from where the popover itself sits —
   *  so a click that reopens it (its own onClick toggle) never races a
   *  mousedown that would otherwise close it first. Also where focus goes
   *  back to on close. */
  triggerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);

  useEffect(() => {
    restoreFocus.current = true;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const trigger = triggerRef?.current ?? null;
    initialFocusRef?.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (!isSm && event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (trigger?.contains(target)) return;
      restoreFocus.current = false;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    if (isSm) document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (isSm) document.removeEventListener('mousedown', onPointerDown);
      if (restoreFocus.current) (trigger ?? previouslyFocused)?.focus();
    };
  }, [isSm, onClose, triggerRef, initialFocusRef]);

  const body = (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className={TYPE.title}>Filters</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className={ICON_BUTTON}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </header>
      {children}
    </div>
  );

  if (isSm) {
    return (
      <div ref={ref} role="dialog" aria-label="Filters" className={`absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[22rem] overflow-y-auto p-4 ${OVERLAY}`}>
        {body}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Filters" className="relative max-h-[85dvh] overflow-y-auto rounded-t-xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  );
}
