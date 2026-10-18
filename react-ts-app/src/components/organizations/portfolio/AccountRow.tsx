import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { ColumnId } from '../tableData';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, SubtitleLine, TrendLine } from './rowParts';
import { Badge, FOCUS, ICON_BUTTON, NUM, TYPE } from '../../ui';
import { rowColumns } from './rowColumns';

export const LONG_PRESS_MS = 500;

export interface AccountRowProps<R extends PortfolioRowBase = PortfolioRow> {
  row: R;
  currency: CurrencyCode;
  pins: ColumnId[];
  /** From `sm` (the page's own media query, passed down so each row does
   *  not add a listener of its own). */
  isSm: boolean;
  /** Any row is selected: taps select instead of opening. */
  selecting: boolean;
  selected: boolean;
  /** While this row's own section (or the flat list) is loading, or a bulk
   *  action is running on it: its checkbox is disabled and a long press no
   *  longer starts selection. */
  selectDisabled?: boolean;
  /** The selection is at its 500-id cap. An unchecked checkbox is disabled
   *  (a checked one stays enabled, so it can still be unticked). */
  atLimit?: boolean;
  open: boolean;
  onToggleSelect: (id: number) => void;
  onLongPress: (id: number) => void;
  onToggleOpen: (row: R) => void;
  /** False where rows are never selected (a segment's Members tab): no
   *  checkbox, and a long press does nothing. */
  selectable?: boolean;
  /** A row menu (a segment's Pin and Keep out), before the open button.
   *  Its clicks never reach the row. */
  menu?: ReactNode;
  /** The opened row, inline (desktop). Phones open a sheet instead. */
  children?: ReactNode;
}

/** The row's own line: wraps below a 62rem column, a grid row from there
 *  (rowColumns), hover and press tints on the whole line. */
const HEADER =
  'flex flex-wrap @min-[62rem]:flex-nowrap @min-[62rem]:grid items-center gap-x-3 @min-[62rem]:gap-x-2 gap-y-1.5 px-4 py-3 cursor-pointer select-none sm:select-auto hover:bg-subtle active:bg-line-subtle';

/** One account as a row of the one list card (UI foundations spec §4.2).
 *  From a 62rem column it is a grid row on `rowColumns`; below, the same
 *  elements wrap into two lines (an `order-*` break element does the
 *  wrapping, so nothing renders twice). */
export function AccountRow<R extends PortfolioRowBase>({
  row,
  currency,
  pins,
  isSm,
  selecting,
  selected,
  selectDisabled = false,
  atLimit = false,
  open,
  onToggleSelect,
  onLongPress,
  onToggleOpen,
  selectable = true,
  menu,
  children,
}: AccountRowProps<R>) {
  const kind = usePortfolioKind();
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const detailsId = `account-${row.id}-details`;
  const arr = row.arr == null ? '—' : formatCompactMoney(row.arr, currency);
  const checkboxDisabled = selectDisabled || (atLimit && !selected);
  const limitHint = atLimit && !selected ? '500 is the most you can select at once' : undefined;
  const status = kind.status(row);

  const cancelPress = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Unmounting mid-press (e.g. the list re-renders under a filter change)
  // must not fire a stray onLongPress once the timer elapses.
  useEffect(() => cancelPress, []);

  const startPress = (event: PointerEvent) => {
    // A mouse selects with the checkbox; long-press is for touch and pen.
    if (event.pointerType === 'mouse' || selectDisabled || !selectable) return;
    longPressed.current = false;
    cancelPress();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      longPressed.current = true;
      onLongPress(row.id);
    }, LONG_PRESS_MS);
  };

  const onRowClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (selecting) onToggleSelect(row.id);
    else onToggleOpen(row);
  };

  return (
    <li data-row-id={row.id} className="group">
      <div
        data-part="header"
        onClick={onRowClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        className={`${HEADER} ${rowColumns(isSm && pins.length > 0)} ${selected || open ? 'bg-subtle' : ''}`}
      >
        <span className="flex shrink-0 items-center gap-2 @min-[62rem]:w-[4.5rem]">
          {selectable ? (
            <label
              onClick={(event) => event.stopPropagation()}
              className={`shrink-0 items-center justify-center w-11 h-11 -m-2 sm:w-6 sm:h-6 sm:m-0 ${
                selecting ? 'flex' : 'hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={checkboxDisabled}
                onChange={() => onToggleSelect(row.id)}
                aria-label={`Select ${row.name}`}
                title={limitHint}
                className={`w-4 h-4 cursor-pointer accent-accent ${FOCUS} disabled:cursor-not-allowed`}
              />
            </label>
          ) : null}

          <HealthRing score={row.health.score} category={row.health.category} />
        </span>

        <div className="min-w-0 flex-1 sm:min-w-40 sm:basis-56">
          <span className="flex min-w-0 items-center gap-1.5">
            <Link
              to={kind.href(row)}
              state={kind.linkState(row)}
              onClick={(event) => event.stopPropagation()}
              data-field={kind.nameField}
              className={`flex min-h-11 min-w-0 items-center sm:block sm:min-h-0 truncate rounded-sm ${TYPE.body} font-semibold hover:underline ${FOCUS}`}
            >
              <span className="truncate">{row.name}</span>
            </Link>
            {status ? (
              <Badge>{status}</Badge>
            ) : null}
          </span>
          <p className={`truncate ${TYPE.meta}`}>
            <SubtitleLine parts={kind.subtitle(row)} />
          </p>
        </div>

        <TrendLine trend={row.health.trend} category={row.health.category} className="order-4 sm:order-none" />
        {isSm ? <RenewalRunway renewal={row.renewal} /> : null}

        {isSm && pins.length > 0 ? (
          <span className="flex min-w-0 gap-x-2 overflow-hidden whitespace-nowrap">
            {pins.map((id) => {
              // Pins are Organizations' own (the Accounts pages pass none),
              // so a pinned row is an organisation.
              const field = PORTFOLIO_FIELDS[id];
              return (
                <span key={id} data-pin={id} className={`${TYPE.meta} truncate`}>
                  {field.short} <span className={`${NUM} text-ink`}>{field.value(row as unknown as PortfolioRow)}</span>
                </span>
              );
            })}
          </span>
        ) : null}

        <span className={`order-2 sm:order-none sm:w-20 sm:text-right ${TYPE.body} ${NUM}`}>
          {arr}
        </span>

        {isSm ? <PulsePair pulse={row.pulse} valueField={kind.pulseValueField} /> : null}

        <span className="order-3 sm:order-none sm:w-32 flex sm:justify-end @min-[62rem]:justify-start min-w-0">
          <SignalTag signal={row.signal} />
        </span>

        <span className="flex shrink-0 items-center justify-end gap-1 @min-[62rem]:w-20">
          {menu ? (
            <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
              {menu}
            </span>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleOpen(row);
            }}
            aria-expanded={open}
            aria-controls={open && children ? detailsId : undefined}
            aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
            className={ICON_BUTTON}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </span>

        {/* Phones: everything after this break wraps onto the card's second line. */}
        <span aria-hidden="true" className="order-1 basis-full h-0 sm:hidden" />
      </div>
      {children}
    </li>
  );
}
