import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { trapTab } from '../../../lib/focusTrap';
import { subtitleText, usePortfolioKind } from './portfolioKind';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine } from './rowParts';
import { ICON_BUTTON, NUM, PRIMARY, TYPE } from '../../ui';

/** The opened row on phones (spec §1 "Phones"): a modal bottom sheet with
 *  the row's signals on top and the kind's panels below (Organizations' six,
 *  Accounts' four). Focus moves in, Tab is trapped, and Escape or Close
 *  returns focus to whatever opened it. */
export function AccountSheet<R extends PortfolioRowBase>({
  row,
  currency,
  onClose,
  onEdit,
}: {
  row: R;
  currency: CurrencyCode;
  onClose: () => void;
  onEdit?: (id: number) => void;
}) {
  const kind = usePortfolioKind();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // A caller re-rendering with a brand new inline `onClose` (the common
  // case) must not re-run the effect below — that would re-focus Close and
  // steal focus back from wherever the visitor has since tabbed to. Kept in
  // a ref so Escape always calls whatever `onClose` is current.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    // A background body scrolling under a fixed sheet is the one thing that
    // makes a bottom sheet feel broken on a phone — lock it while open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      // Escape belongs to whatever is on top: a modal opened from the sheet
      // (Edit details) holds focus outside it, or a handler already took it.
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
    // Deliberately once on mount (see onCloseRef above) — not keyed on
    // `onClose`.
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[85dvh] overflow-y-auto rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line-subtle bg-surface px-4 py-3">
          <HealthRing score={row.health.score} category={row.health.category} />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={`truncate ${TYPE.title}`}>
              {row.name}
            </h2>
            <p className={`truncate ${TYPE.meta}`}>{subtitleText(kind.subtitle(row))}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={ICON_BUTTON}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className={`${TYPE.title} ${NUM}`}>
            {row.arr == null ? '—' : formatCompactMoney(row.arr, currency)}
          </span>
          <SignalTag signal={row.signal} />
          <TrendLine trend={row.health.trend} category={row.health.category} />
          <RenewalRunway renewal={row.renewal} className="flex" />
          <PulsePair pulse={row.pulse} className="flex" />
        </div>
        {kind.renderDetails({ row, currency, onEdit: kind.editable(row) ? onEdit : undefined })}
        <div className="px-4 pb-4">
          <Link
            to={kind.href(row)}
            state={kind.linkState(row)}
            className={`${PRIMARY} justify-center`}
          >
            {`Open ${kind.noun.one} page`}
          </Link>
        </div>
      </div>
    </div>
  );
}
