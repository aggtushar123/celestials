import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { SegmentRef } from '../../features/surveys/surveyTypes';
import type { SelectGroup, SelectOption } from '../ui';

export const KIND_ORDER: readonly SegmentKind[] = ['customer', 'account', 'contact'];

/** The same options for the shared `Select`: the placeholder, the saved
 *  segment when it is not among the caller's own, then a group per kind. */
export function segmentSelectOptions(rows: SegmentListRow[] | null, fallback: SegmentRef | null): (SelectOption<string> | SelectGroup<string>)[] {
  const listed = rows ?? [];
  const extra = fallback && fallback.id !== null && !listed.some((row) => row.id === fallback.id) ? fallback : null;
  return [
    { value: '', label: rows === null ? 'Loading your segments…' : 'Choose a segment…' },
    ...(extra ? [{ value: String(extra.id), label: extra.name }] : []),
    ...KIND_ORDER.map((group) => ({
      label: KIND_LABEL[group],
      options: listed.filter((row) => row.kind === group).map((row) => ({ value: String(row.id), label: row.name })),
    })).filter((group) => group.options.length > 0),
  ];
}
