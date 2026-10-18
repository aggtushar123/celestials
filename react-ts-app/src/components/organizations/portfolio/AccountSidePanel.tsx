import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { DETAILS_PANEL_ID } from './BoardCard';
import { subtitleText, usePortfolioKind } from './portfolioKind';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine } from './rowParts';
import { Card, ICON_BUTTON, NUM, PRIMARY, TYPE } from '../../ui';

/** The Board's opened card from `sm` (owner decision 2026-09-26): the
 *  row's signals and the kind's panels in a column beside the board, which
 *  stays in place and usable. It is not modal. Focus moves to Close on open
 *  and back to the opener on close, and Escape inside the panel closes it.
 *  A `bg-surface` item on the canvas, beside the columns, never inside one. */
export function AccountSidePanel<R extends PortfolioRowBase>({
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
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Once on mount: switching to another card keeps the panel mounted and
  // must not steal focus again.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape inside the panel closes it. Only keys pressed inside the aside
  // reach this handler (the DOM scopes it), which is what keeps a card's
  // Move to… menu, outside the panel, from closing it too.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <Card
      as="aside"
      pad="none"
      id={DETAILS_PANEL_ID}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="flex w-[26rem] shrink-0 flex-col overflow-y-auto"
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
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className={ICON_BUTTON}
        >
          <X className="w-4 h-4" aria-hidden="true" />
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
      {kind.renderDetails({ row, currency, onEdit: kind.editable(row) ? onEdit : undefined, stacked: true })}
      <div className="px-4 pb-4">
        <Link
          to={kind.href(row)}
          state={kind.linkState(row)}
          className={`${PRIMARY} justify-center`}
        >
          {`Open ${kind.noun.one} page`}
        </Link>
      </div>
    </Card>
  );
}
