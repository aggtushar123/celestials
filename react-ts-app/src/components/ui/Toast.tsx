import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { OVERLAY, QUIET } from './styles';
import { TYPE } from './type';
import { TOAST_MS, ToastContext, type ToastSpec } from './toastContext';

/** "Saved", with an Undo (settings production spec §5.4). One toast at a
 *  time, top right under the bar so it never covers the save bar; the
 *  region is always mounted so a new message is announced. The timer waits
 *  while the toast is hovered or holds focus, so its Undo can be reached by
 *  pointer or keyboard (WCAG 2.2.1), and starts again on leave or blur. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const next = useRef(0);
  const held = useRef({ hover: false, focus: false });
  const startTimer = useCallback(() => {
    window.clearTimeout(timer.current);
    if (held.current.hover || held.current.focus) return;
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const show = useCallback(
    (spec: ToastSpec) => {
      next.current += 1;
      // A new toast is a new element: whatever held the old one let go with it.
      held.current = { hover: false, focus: false };
      setToast({ ...spec, id: next.current });
      startTimer();
    },
    [startTimer],
  );
  const hold = (part: 'hover' | 'focus', on: boolean) => {
    held.current[part] = on;
    if (on) window.clearTimeout(timer.current);
    else startTimer();
  };
  const close = () => {
    window.clearTimeout(timer.current);
    held.current = { hover: false, focus: false };
    setToast(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 top-16 z-50 flex flex-col items-end">
        {toast ? (
          <div
            key={toast.id}
            onPointerEnter={() => hold('hover', true)}
            onPointerLeave={() => hold('hover', false)}
            onFocus={() => hold('focus', true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold('focus', false);
            }}
            className={`pointer-events-auto flex items-center gap-2 py-1 pl-4 pr-1 motion-safe:animate-fade-up ${OVERLAY}`}
          >
            <span className={TYPE.body}>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className={QUIET}
                onClick={() => {
                  const action = toast.action;
                  close();
                  action?.onAction();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
