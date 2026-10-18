import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../../../hooks';
import { LIFECYCLE_LABELS } from '../../../features/customers/formatters';
import type { LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import type { StageMove } from './boardMove';
import { usePortfolioKind } from './portfolioKind';

export interface StageMoveState<R, K extends string = string> {
  /** The current move. It shows at once, is marked `saved` when the save
   *  succeeds, and stays until the board reports that every reload it
   *  triggered has landed (`settle`), so a column that remounts later never
   *  replays it. Null after a failure, so the card goes back. */
  move: StageMove<R, K> | null;
  /** The save is in flight. */
  saving: boolean;
  /** A move is saving or settling. Moving is off until it clears: one at a
   *  time, so a second move can't drop the first card's guess before its
   *  fresh pages land. */
  busy: boolean;
  /** "Moved Pizza Hut to Adoption.", for a polite live region. */
  notice: string | null;
  /** The failure, ending with the server's reason. */
  error: string | null;
  moveTo: (row: R, to: K) => void;
  dismissError: () => void;
  /** The move `token`'s reloads have all landed: forget it. */
  settle: (token: number) => void;
  /** Forget the move whatever it is (a different list landed). */
  reset: () => void;
}

export type BoardMoveState<R extends PortfolioRowBase = PortfolioRow> = StageMoveState<R, LifecycleValue>;

export interface StageMoveRules<R, K extends string> {
  stageOf: (row: R) => K;
  /** The record's own name, for the notice and the error. */
  nameOf: (row: R) => string;
  stageLabel: (stage: K) => string;
  /** The error's reason when the server gives none. */
  fallbackReason: string;
  /** The record's single-record update, rejecting with the server's reason. */
  save: (row: R, to: K) => Promise<unknown>;
  onSaved: (move: StageMove<R, K>) => void;
  /** A move some other flow takes over (Organizations' churn form): true
   *  when it has, so nothing is saved from here. */
  divert?: (row: R, to: K) => boolean;
}

/** Moving one record between stage columns, for every board: optimistic,
 *  one at a time, saved through the record's own update (`rules.save`), and
 *  rolled back with the server's reason. The rules are read when a move
 *  starts, so a caller may pass them inline. */
export function useStageMove<R, K extends string>(rules: StageMoveRules<R, K>): StageMoveState<R, K> {
  const [move, setMove] = useState<StageMove<R, K> | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  // The latest rules, so moveTo (and every memoised card that holds it)
  // stays the same across renders.
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  });

  const moveTo = useCallback(
    (row: R, to: K) => {
      const { stageOf, nameOf, stageLabel, fallbackReason, save, onSaved, divert } = rulesRef.current;
      const from = stageOf(row);
      if (to === from || saving || move !== null) return;
      setError(null);
      setNotice(null);
      if (divert?.(row, to)) return;
      tokenRef.current += 1;
      const next: StageMove<R, K> = { token: tokenRef.current, row, from, to };
      setMove(next);
      setSaving(true);
      save(row, to)
        .then(
          () => {
            // Guarded by token only because a list change may have reset
            // the move meanwhile; a second move can't start while this one
            // is saving or settling.
            setMove((current) => (current?.token === next.token ? { ...current, saved: true } : current));
            setNotice(`Moved ${nameOf(row)} to ${stageLabel(to)}.`);
            onSaved(next);
          },
          (reason: unknown) => {
            setMove((current) => (current?.token === next.token ? null : current));
            const why = typeof reason === 'string' ? reason : fallbackReason;
            setError(`Couldn't move ${nameOf(row)} to ${stageLabel(to)}. ${why}`);
          },
        )
        .finally(() => setSaving(false));
    },
    [move, saving],
  );

  const dismissError = useCallback(() => setError(null), []);
  const settle = useCallback((token: number) => setMove((current) => (current?.token === token ? null : current)), []);
  const reset = useCallback(() => setMove(null), []);

  return { move, saving, busy: saving || move !== null, notice, error, moveTo, dismissError, settle, reset };
}

/** Moving one record between lifecycle columns (owner decisions
 *  2026-09-26), on useStageMove. It saves through the kind's single-record
 *  update (`kind.saveStage`: the customer PATCH on Organizations, which
 *  applies the archive gate, the inactive-owner rule and every other update
 *  rule; the account PATCH on Accounts). A kind whose churn has its own form
 *  (Organizations) never saves Churn from here: the row goes to `onChurn`,
 *  whose ChurnOrganizationModal records the date and reason. */
export function useBoardMove<R extends PortfolioRowBase = PortfolioRow>({
  onSaved,
  onChurn,
}: {
  onSaved: (move: StageMove<R, LifecycleValue>) => void;
  onChurn?: (row: R) => void;
}): BoardMoveState<R> {
  const dispatch = useAppDispatch();
  const kind = usePortfolioKind();
  return useStageMove<R, LifecycleValue>({
    stageOf: (row) => row.lifecycle.value,
    nameOf: (row) => row.name,
    stageLabel: (stage) => LIFECYCLE_LABELS[stage],
    fallbackReason: `Could not update ${kind.noun.one}.`,
    save: (row, to) => kind.saveStage(row, to, dispatch),
    onSaved,
    divert: (row, to) => {
      if (to !== 'churn' || !kind.churnByModal || !onChurn) return false;
      onChurn(row);
      return true;
    },
  });
}
