import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { ContactRole, SegmentRef } from '../../features/surveys/surveyTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS } from '../organizations/portfolio/styles';
import { RoleFields } from './RoleFields';
import { SegmentOptions } from './SegmentOptions';
import { TYPE } from '../ui';

const LABEL = TYPE.label;

/** Who the survey asks (spec §2.2): one of the caller's own segments,
 *  grouped by kind, and for an organisation or account segment the roles
 *  to ask there, in the order ticked (the backend asks in that order, at
 *  most 3 per record). */
export function AudienceFields({
  segments,
  segmentsError,
  segmentId,
  fallback,
  roles,
  kind,
  errors,
  onSegment,
  onRoles,
}: {
  /** null while loading. */
  segments: SegmentListRow[] | null;
  segmentsError: string | null;
  segmentId: number | null;
  /** The send's own segment, kept as an option when it is not among the
   *  caller's (a draft's segment, say). */
  fallback: SegmentRef | null;
  roles: ContactRole[];
  kind: SegmentKind | null;
  errors: { segment?: string; roles?: string };
  onSegment: (id: number | null) => void;
  onRoles: (roles: ContactRole[]) => void;
}) {
  const selectId = useId();
  const listed = segments ?? [];
  const describedBy = [`${selectId}-hint`, errors.segment ? `${selectId}-error` : null].filter(Boolean).join(' ');

  return (
    <section aria-label="Audience" className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-ink">Audience</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className={LABEL}>
          Segment
        </label>
        <select
          id={selectId}
          value={segmentId === null ? '' : String(segmentId)}
          disabled={segments === null}
          onChange={(event) => onSegment(event.target.value ? Number(event.target.value) : null)}
          aria-invalid={Boolean(errors.segment)}
          aria-describedby={describedBy}
          className={`${FILTER_SELECT} w-full ${errors.segment ? 'border-danger' : ''}`}
        >
          <SegmentOptions rows={segments} fallback={fallback} />
        </select>
        {errors.segment ? (
          <p id={`${selectId}-error`} role="alert" className="text-[11px] text-danger">
            {errors.segment}
          </p>
        ) : null}
        {segmentsError ? (
          <p role="alert" className="text-[11px] text-danger">
            {segmentsError}
          </p>
        ) : null}
        {segments !== null && listed.length === 0 && !segmentsError ? (
          <p className="text-[11px] text-ink-muted">
            You have no segments yet.{' '}
            <Link to="/segments/new" className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
              Make one
            </Link>
            , then survey it.
          </p>
        ) : null}
        <p id={`${selectId}-hint`} className="text-[11px] text-ink-muted">
          Only your own segments, and only people you can open.
        </p>
      </div>
      <RoleFields kind={kind} roles={roles} error={errors.roles} onRoles={onRoles} />
    </section>
  );
}
