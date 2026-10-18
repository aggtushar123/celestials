import { useId, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { STORY_KINDS } from '../../../features/organizations/storyKinds';
import type { StoryKind } from '../../../features/organizations/storyTypes';
import { useDismiss } from '../../../lib/useDismiss';
import { BUTTON, FOCUS, NUM, OVERLAY, QUIET, TYPE } from '../../ui';

/** Sources (spec §1.6): a multi-select of the exact kinds the chosen filter
 *  covers. Escape or a press outside closes it. */
export function SourcesPicker({
  offered,
  selected,
  onChange,
}: {
  offered: StoryKind[];
  selected: StoryKind[];
  onChange: (next: StoryKind[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useDismiss(
    [buttonRef, panelRef],
    (reason) => {
      setOpen(false);
      if (reason === 'escape') buttonRef.current?.focus();
    },
    open,
  );

  const toggle = (kind: StoryKind) => onChange(selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={BUTTON}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Sources
        {selected.length ? (
          <>
            {' '}
            <span className={NUM}>· {selected.length}</span>
          </>
        ) : null}
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className={`absolute right-0 top-full z-30 mt-1 w-64 p-2 ${OVERLAY}`}>
          <fieldset>
            <legend className={`px-1 pb-1 ${TYPE.label}`}>Sources</legend>
            {STORY_KINDS.filter((k) => offered.includes(k.kind)).map((k) => (
              <label
                key={k.kind}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] text-ink hover:bg-subtle sm:min-h-8"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(k.kind)}
                  onChange={() => toggle(k.kind)}
                  className={`h-4 w-4 accent-accent ${FOCUS}`}
                />
                {k.label}
              </label>
            ))}
          </fieldset>
          <button type="button" onClick={() => onChange([])} disabled={selected.length === 0} className={`${QUIET} mt-1 w-full`}>
            Every source
          </button>
        </div>
      ) : null}
    </div>
  );
}
