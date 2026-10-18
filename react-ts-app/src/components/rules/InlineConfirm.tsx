import { useEffect, useId, useRef } from 'react';
import { FOCUS, PRIMARY, QUIET, TYPE } from '../ui';

/** A question asked in place, inside the builder (plan Decision 5): a
 *  second dialog over BuilderDialog would fight its Escape and its focus
 *  trap. It takes focus; Escape cancels it and stops there, so the builder
 *  stays open. */
export function InlineConfirm({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-part="confirm"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      className="flex flex-col gap-2 border-l-2 border-line pl-3"
    >
      <p id={titleId} ref={titleRef} tabIndex={-1} className={`${TYPE.label} ${FOCUS}`}>
        {title}
      </p>
      <p className={TYPE.bodyMuted}>{message}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={QUIET}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={PRIMARY}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
