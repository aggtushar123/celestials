import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { trapTab } from '../../../lib/focusTrap';
import { FOCUS } from '../portfolio/styles';

const FIELD = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** A modal over the organization page: a panel on the right from `sm`, a
 *  bottom sheet below it (spec §1.11). Focus moves to its first field, or to
 *  Close when it has none; Tab stays inside; the page behind does not
 *  scroll (it sits on the body, outside the page's own scroll column, so a
 *  wheel or swipe on the scrim has nothing to scroll); Escape, Close or the
 *  scrim close it and focus goes back to whatever opened it. */
export function Sheet({
  title,
  description,
  isSm,
  onClose,
  size = 'regular',
  phone = 'sheet',
  focus = 'field',
  footer,
  returnFocus,
  headingRef: outerHeadingRef,
  children,
}: {
  title: string;
  description?: string;
  isSm: boolean;
  onClose: () => void;
  /** `wide` is `max-w-2xl` from `sm`; `regular` is `max-w-lg`. */
  size?: 'regular' | 'wide';
  /** Below `sm`: a bottom sheet, or the full screen. */
  phone?: 'sheet' | 'full';
  /** What takes focus on open: the first field, or the heading. */
  focus?: 'field' | 'heading';
  /** Pinned under the scroll area. */
  footer?: ReactNode;
  /** Where focus goes on close when the opener has left the page. */
  returnFocus?: () => HTMLElement | null | undefined;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // Hand the heading to a caller that asked for it (the ref is set before layout effects run).
  useImperativeHandle(outerHeadingRef, () => headingRef.current as HTMLHeadingElement);
  const returnRef = useRef(returnFocus);
  useEffect(() => {
    returnRef.current = returnFocus;
  }, [returnFocus]);

  // A caller passing a new inline onClose each render must not re-run the
  // mount effect (it would steal focus back to the first field).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus goes back in the same commit that removes the sheet, not in a
  // passive effect after it: a sheet closed from an async answer (a save on
  // close) would otherwise leave focus on the body for a frame or more,
  // where a key press or a screen reader lands on nothing. Layout cleanups
  // run before the portal leaves the DOM, so focus never drops to the body.
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected) opener.focus();
      else returnRef.current?.()?.focus();
    };
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (focus === 'heading') headingRef.current?.focus();
    else (root?.querySelector<HTMLElement>(FIELD) ?? root?.querySelector<HTMLElement>('button'))?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        const target = event.target as Node | null;
        if (target === document.body || (target && ref.current?.contains(target))) onCloseRef.current();
      }
      if (event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
    // Mount only: the options are read once, when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div data-shape={isSm ? 'panel' : 'sheet'} className="fixed inset-0 z-50 flex overscroll-contain">
      <div data-scrim="" aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={
          isSm
            ? `relative ml-auto flex h-full w-full ${size === 'wide' ? 'max-w-2xl' : 'max-w-lg'} flex-col bg-surface shadow-lg`
            : phone === 'full'
              ? 'relative flex h-full w-full flex-col bg-surface pb-[env(safe-area-inset-bottom)]'
              : 'relative mt-auto flex max-h-[85dvh] w-full flex-col rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)]'
        }
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              tabIndex={-1}
              ref={headingRef}
              className={`${size === 'wide' ? 'break-words' : 'truncate'} text-[15px] font-semibold text-ink ${FOCUS}`}
            >
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className={`${size === 'wide' ? 'break-words' : 'truncate'} text-[11px] text-ink-muted`}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle ${FOCUS}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        {footer ? <footer className="border-t border-line-subtle px-4 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
