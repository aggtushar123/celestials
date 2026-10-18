import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useOverlayActive, type StageMove } from './boardMove';
import type { Paged, PagedRead } from './usePagedRead';

// The move-and-settle machinery every board shares (the Organizations and
// Accounts boards, the Pipelines board): the frame's inputs, dragging, the
// focus a Move to… keeps, when a saved move has settled, and each column's
// guess until its own fresh page lands. What differs (the columns, the
// cards, the save) stays with each board.

/** Moving is off while a saved move's frame reload keeps failing. */
export const PAUSED = 'Moving is paused until the board reloads.';

/** The columns belong to the frame on screen. While a new frame loads (a
 *  group, filter or sort change, or a reload), its data is still the old
 *  one, so the columns keep the inputs that frame was read with: no column
 *  reads `group=<new>&group_value=<old key>`, or enables on a stale count.
 *  They move on together once the new frame lands (`fresh`). Adjusted during
 *  render. */
export function useFrameInputs<T extends object>(current: T, fresh: boolean): T {
  const [frame, setFrame] = useState(current);
  const changed = (Object.keys(current) as (keyof T)[]).some((key) => frame[key] !== current[key]);
  if (fresh && changed) setFrame(current);
  return fresh ? current : frame;
}

export interface BoardMoves<R, K extends string> {
  /** The card being dragged (held here, not read back from dataTransfer). */
  dragging: R | null;
  startDrag: (row: R) => void;
  endDrag: () => void;
  /** Stable, for the memoised cards. `fromMenu`: a Move to… choice. */
  moveCard: (row: R, to: K, fromMenu?: boolean) => void;
  /** The card a Move to… sent to its new column, holding focus there. */
  focusId: number | null;
  onHandedOver: (key: string, token: number) => void;
  /** The header figures still show the move (the frame has not reloaded). */
  countsMoved: boolean;
}

/** A board's moves between its columns. A saved move settles (`onMoveSettled`)
 *  once the frame's reload has landed and each of its two columns has handed
 *  over to its own fresh page, or reads nothing (`reads`). */
export function useBoardMoves<R extends { id: number }, K extends string>({
  move,
  frameKey,
  fresh,
  reads,
  onMove,
  onMoveSettled,
  keepsFocus,
}: {
  move: StageMove<R, K> | null;
  /** The frame read's `loadedKey`. */
  frameKey: string | null;
  fresh: boolean;
  /** Whether a column reads its own rows (it has some, and is not drop-only or collapsed). */
  reads: (key: string) => boolean;
  onMove: (row: R, to: K) => void;
  onMoveSettled: (token: number) => void;
  /** Whether a Move to… to `to` keeps focus on the card (not when a form
   *  takes over, as Organizations' churn does). Stable. Default: always. */
  keepsFocus?: (to: K) => boolean;
}): BoardMoves<R, K> {
  const [dragging, setDragging] = useState<R | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [handed, setHanded] = useState<{ token: number; keys: string[] } | null>(null);
  // The header counts show the move until the frame's own reload lands.
  const countsMoved = useOverlayActive(move?.token ?? null, frameKey);

  const columnDone = (key: string) => (handed !== null && handed.token === move?.token && handed.keys.includes(key)) || !reads(key);
  const settled = move?.saved === true && fresh && !countsMoved && columnDone(move.from) && columnDone(move.to);
  useEffect(() => {
    if (settled && move) onMoveSettled(move.token);
  }, [settled, move, onMoveSettled]);

  const onHandedOver = useCallback((key: string, token: number) => {
    setHanded((was) =>
      was?.token === token ? (was.keys.includes(key) ? was : { token, keys: [...was.keys, key] }) : { token, keys: [key] },
    );
  }, []);

  const moveCard = useCallback(
    (row: R, to: K, fromMenu = false) => {
      setDragging(null);
      // A Move to… choice (keyboard or touch): the card remounts in its new
      // column and focus follows it there. A mouse drag leaves focus alone.
      if (fromMenu && (keepsFocus?.(to) ?? true)) setFocusId(row.id);
      onMove(row, to);
    },
    [onMove, keepsFocus],
  );
  const endDrag = useCallback(() => setDragging(null), []);

  // Focus is held on the moved card until its move settles (or fails, or is
  // reset): the move is then gone. Adjusted during render.
  const [focusFor, setFocusFor] = useState<number | null>(null);
  if (focusId !== null && move !== null && focusFor !== move.token) setFocusFor(move.token);
  if (focusId !== null && move === null && focusFor !== null) {
    setFocusId(null);
    setFocusFor(null);
  }

  // The user moving focus somewhere else themselves releases it.
  useEffect(() => {
    if (focusId === null) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(`[data-card-id="${focusId}"]`)) setFocusId(null);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [focusId]);

  // A drag the card never hears the end of (dropped outside the window, or
  // its card unmounted mid-drag by a reload) must not leave `dragging` set.
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('dragend', endDrag);
    window.addEventListener('drop', endDrag);
    return () => {
      window.removeEventListener('dragend', endDrag);
      window.removeEventListener('drop', endDrag);
    };
  }, [dragging, endDrag]);

  return { dragging, startDrag: setDragging, endDrag, moveCard, focusId, onHandedOver, countsMoved };
}

/** A column's rows with a move applied (`withMoved`) until its own fresh
 *  page one lands, telling the board when it has handed over (or its read
 *  failed, so it never will). After every render, a card a Move to… sent
 *  here gets focus back when the browser drops it to <body> (its node
 *  moved or remounted). */
export function useColumnRows<R extends { id: number }>({
  page,
  columnKey,
  enabled,
  move,
  withMoved,
  onHandedOver,
  focusId,
  sectionRef,
}: {
  page: PagedRead<R, Paged<R>>;
  columnKey: string;
  enabled: boolean;
  move: StageMove<R> | null;
  withMoved: (rows: R[]) => R[];
  onHandedOver: (key: string, token: number) => void;
  focusId: number | null;
  sectionRef: RefObject<HTMLElement | null>;
}): R[] {
  const overlay = useOverlayActive(move?.token ?? null, page.loadedKey);
  const loaded = enabled ? page.rows : [];
  const rows = overlay ? withMoved(loaded) : loaded;
  const handedOver = move?.saved === true && enabled && (!overlay || page.error !== null);
  useEffect(() => {
    if (handedOver && move) onHandedOver(columnKey, move.token);
  }, [handedOver, move, columnKey, onHandedOver]);
  useEffect(() => {
    if (focusId === null) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    sectionRef.current?.querySelector<HTMLElement>(`[data-card-id="${focusId}"] [data-part="open"]`)?.focus();
  });
  return rows;
}
