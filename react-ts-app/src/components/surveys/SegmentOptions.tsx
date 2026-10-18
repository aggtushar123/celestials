import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import type { SegmentRef } from '../../features/surveys/surveyTypes';
import { KIND_ORDER } from './segmentSelectOptions';

/** A segment select's options: the caller's own segments (null while
 *  loading) grouped by kind, and the saved one kept when it is not among
 *  them. Shared by the survey builder and a rule's trigger. */
export function SegmentOptions({ rows, fallback }: { rows: SegmentListRow[] | null; fallback: SegmentRef | null }) {
  const listed = rows ?? [];
  const extra = fallback && fallback.id !== null && !listed.some((row) => row.id === fallback.id) ? fallback : null;
  return (
    <>
      <option value="">{rows === null ? 'Loading your segments…' : 'Choose a segment…'}</option>
      {extra ? <option value={String(extra.id)}>{extra.name}</option> : null}
      {KIND_ORDER.map((group) => {
        const grouped = listed.filter((row) => row.kind === group);
        return grouped.length > 0 ? (
          <optgroup key={group} label={KIND_LABEL[group]}>
            {grouped.map((row) => (
              <option key={row.id} value={String(row.id)}>
                {row.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </>
  );
}
