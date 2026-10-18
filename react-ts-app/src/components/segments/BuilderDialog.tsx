import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { trapTab } from '../../lib/focusTrap';
import { FOCUS } from '../organizations/portfolio/styles';

const FIELD = 'input:not([disabled]):not([type="radio"]):not([type="checkbox"]), textarea:not([disabled]), select:not([disabled])';

/** The segment builder's modal: centred from `sm`, the whole screen below
 *  it. Focus moves to its first field; Tab stays inside; the page behind
 *  does not scroll; Escape or Close closes it and focus goes back to
 *  whatever opened it. A click on the scrim does not close it: the builder
 *  holds a draft, and a stray click should not throw it away. The children
 *  own the scrolling body and the footer. */
export function BuilderDialog({ title, onClose, size = 'wide', children }: { title: string; onClose: () => void; size?: 'wide' | 'narrow'; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // A caller passing a new inline onClose each render must not re-run the
  // mount effect (it would steal focus back to the first field).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = ref.current;
    (root?.querySelector<HTMLElement>(FIELD) ?? root?.querySelector<HTMLElement>('button'))?.focus();
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
      opener?.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overscroll-contain sm:items-center sm:p-6">
      <div data-scrim="" aria-hidden="true" className="absolute inset-0 bg-scrim" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex h-[100dvh] w-full flex-col bg-surface pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90dvh] ${size === 'narrow' ? 'sm:max-w-lg' : 'sm:max-w-[1100px]'} sm:rounded-xl sm:border sm:border-line sm:pb-0 sm:shadow-lg`}
      >
        <header className="flex items-center gap-3 border-b border-line-subtle px-4 py-2">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
