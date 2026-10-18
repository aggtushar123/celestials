// The tiles' figures (spec §3: members, ARR covered, average health,
// average CSAT, entered and left in the last 7 days), shared by the segment
// page's tiles and the builder's preview totals.
import { countText } from '../organizations/filterChips';
import { formatCompactMoney } from '../customers/formatters';
import { KIND_NOUN } from './segmentFields';
import type { DayMoves, SegmentKind, SegmentSummary } from './segmentTypes';

/** What "—" means on someone else's segment (Ruling S8 / Decision 14). */
export const OWNER_ONLY = 'Only the owner sees this figure';

export interface Figure {
  key: string;
  label: string;
  value: string;
  detail?: string;
}

export function movesText(moves: DayMoves): string {
  return `+${moves.entered} / −${moves.left}`;
}

/** Contacts have no ARR, health or CSAT (always null): only Members and the
 *  last 7 days (Decision 13). The preview has no last 7 days. */
export function summaryFigures(summary: SegmentSummary, kind: SegmentKind): Figure[] {
  const figures: Figure[] = [{ key: 'members', label: 'Members', value: String(summary.members) }];
  if (kind !== 'contact') {
    figures.push({
      key: 'arr',
      label: 'ARR covered',
      value: summary.arr === null ? '—' : formatCompactMoney(summary.arr, summary.currency),
      detail: summary.unconverted_count ? `${summary.unconverted_count} not converted` : undefined,
    });
    figures.push({
      key: 'health',
      label: 'Average health',
      value: summary.avg_health === null ? '—' : summary.avg_health.toFixed(1),
    });
    figures.push({
      key: 'csat',
      label: 'Average CSAT',
      value: summary.avg_csat === null ? '—' : `${Math.round(summary.avg_csat)}%`,
    });
  }
  if (summary.entered_7d !== null && summary.left_7d !== null) {
    figures.push({
      key: 'moves',
      label: 'Last 7 days',
      value: movesText({ entered: summary.entered_7d, left: summary.left_7d }),
      detail: 'entered / left',
    });
  }
  return figures;
}

/** "3 organisations", or "1 of 3 accounts" while a search narrows the rows.
 *  A thin wrapper over the portfolio's own `countText` (Ruling G4): the
 *  singular/plural and "N of M" logic lives there, not copied here. */
export function memberCountText(count: number, total: number, search: string, kind: SegmentKind): string {
  return countText(count, total, Boolean(search), false, KIND_NOUN[kind]);
}
