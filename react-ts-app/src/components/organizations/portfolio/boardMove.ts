import { useState } from 'react';
import { LIFECYCLE_LABELS } from '../../../features/customers/formatters';
import { LIFECYCLE_VALUES } from '../../../features/organizations/portfolioParams';
import type {
  GroupKey,
  LifecycleValue,
  PortfolioGroup,
  PortfolioRow,
  PortfolioRowBase,
} from '../../../features/organizations/portfolioTypes';

/** One record moving between stage columns: an account between lifecycle
 *  columns, a Pipelines item between stage columns. `token` is unique per
 *  move, so an overlay can tell a new move from one it has already seen. */
export interface StageMove<R, K extends string = string> {
  token: number;
  row: R;
  from: K;
  to: K;
  /** The PATCH has succeeded; the move now waits for its reloads to land. */
  saved?: boolean;
}

/** One account moving between lifecycle columns. */
export type BoardMove<R extends PortfolioRowBase = PortfolioRow> = StageMove<R, LifecycleValue>;

export interface BoardColumnSpec {
  /** The group key: the column's `group_value`. */
  key: string;
  label: string;
  count: number;
  arr: number;
  /** The Churn column while churned accounts are hidden: a drop target
   *  with no cards, no count and no read. */
  dropOnly: boolean;
}

/** The Board's columns. Grouped by lifecycle, every stage gets a column
 *  in stage order, empty ones included, so there is always somewhere to
 *  drop (`groups` lists only non-empty groups, so the count and ARR default
 *  to 0 and the label comes from LIFECYCLE_LABELS). Any other grouping shows
 *  the server's groups as they are. */
export function boardColumns(group: GroupKey, groups: PortfolioGroup[], churnVisible: boolean): BoardColumnSpec[] {
  if (group !== 'lifecycle') {
    return groups.map((g) => ({ key: g.key, label: g.label, count: g.count, arr: g.arr, dropOnly: false }));
  }
  return LIFECYCLE_VALUES.map((value) => {
    const found = groups.find((g) => g.key === value);
    const dropOnly = value === 'churn' && !churnVisible;
    return {
      key: value,
      label: found?.label ?? LIFECYCLE_LABELS[value],
      count: dropOnly ? 0 : (found?.count ?? 0),
      arr: dropOnly ? 0 : (found?.arr ?? 0),
      dropOnly,
    };
  });
}

/** A column header's count and `field` money with a move applied: one
 *  record (worth `amount`) out of `from`, into `to`. Shared by every board. */
export function withMovedTotals<F extends string, S extends { key: string; count: number } & Record<F, number>>(
  spec: S,
  move: { from: string; to: string } | null,
  field: F,
  amount: number,
): S {
  if (!move) return spec;
  const sign = spec.key === move.from ? -1 : spec.key === move.to ? 1 : 0;
  if (sign === 0) return spec;
  return { ...spec, count: Math.max(0, spec.count + sign), [field]: spec[field] + sign * amount };
}

/** A column's cards with a move applied: the moved card leaves every column
 *  but its new one, where it sits on top, once, as `restage` reads it in its
 *  new stage. Shared by every board. */
export function withMovedItem<R extends { id: number }>(
  rows: R[],
  key: string,
  move: StageMove<R> | null,
  restage: (row: R, to: string) => R,
): R[] {
  if (!move) return rows;
  const others = rows.filter((row) => row.id !== move.row.id);
  if (key !== move.to) return others;
  return [restage(move.row, move.to), ...others];
}

/** A column header's figures with a move applied: one account (and its
 *  ARR) out of `from`, into `to`. */
export function withMove(spec: BoardColumnSpec, move: BoardMove<PortfolioRowBase> | null): BoardColumnSpec {
  if (!move || spec.dropOnly) return spec;
  return withMovedTotals(spec, move, 'arr', move.row.arr ?? 0);
}

/** A column's cards with a move applied, the moved card showing its new stage. */
export function withMovedRow<R extends PortfolioRowBase>(rows: R[], key: string, move: BoardMove<R> | null): R[] {
  return withMovedItem(rows, key, move, (row, to) => ({ ...row, lifecycle: { value: to as LifecycleValue, label: LIFECYCLE_LABELS[to as LifecycleValue] } }));
}

/** Whether a read (the frame, or one column) should still show the move
 *  `token`. It notes the read's `loadedKey` when a move first appears, and it
 *  shows the move until that key changes, which happens only when a fresh
 *  page one lands (a `loadMore` append leaves it alone). So after a save
 *  bumps the reads, each one's own answer replaces the guess exactly when it
 *  arrives, with no flicker back. Adjusted during render, not in an effect. */
export function useOverlayActive(token: number | null, loadedKey: string | null): boolean {
  const [seen, setSeen] = useState<{ token: number; key: string | null } | null>(null);
  if (token === null) return false;
  if (seen?.token !== token) {
    setSeen({ token, key: loadedKey });
    return true;
  }
  return seen.key === loadedKey;
}
