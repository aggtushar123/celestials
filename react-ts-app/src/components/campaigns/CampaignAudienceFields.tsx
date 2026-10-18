import { useId } from 'react';
import { Link } from 'react-router-dom';
import { segmentKindOf } from '../../features/campaigns/campaignText';
import type { SegmentRef } from '../../features/campaigns/campaignTypes';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { ContactRole } from '../../features/surveys/surveyTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS } from '../organizations/portfolio/styles';
import { TYPE } from '../ui';
import { RoleFields } from '../surveys/RoleFields';
import { SegmentOptions } from '../surveys/SegmentOptions';

const LABEL = TYPE.label;

/** Who it emails (spec §2.2): one of the owner's segments, grouped by kind,
 *  and for an organisation or account segment the roles to email there. */
export function CampaignAudienceFields({ segments, segmentsError, segmentId, fallback, roles, kind, errors, onSegment, onRoles }: {
  /** null while loading. */
  segments: SegmentListRow[] | null;
  segmentsError: string | null;
  segmentId: number | null;
  /** The campaign's saved segment, kept as an option when it is not among mine. */
  fallback: SegmentRef;
  roles: ContactRole[];
  kind: SegmentKind | null;
  errors: { segment?: string; roles?: string };
  onSegment: (id: number | null) => void;
  onRoles: (roles: ContactRole[]) => void;
}) {
  const selectId = useId();
  const describedBy = [`${selectId}-hint`, errors.segment ? `${selectId}-error` : null].filter(Boolean).join(' ');
  const saved = fallback ? { id: fallback.id, name: fallback.name, kind: segmentKindOf(fallback.kind) } : null;
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
          <SegmentOptions rows={segments} fallback={saved} />
        </select>
        {errors.segment ? (
          <p id={`${selectId}-error`} role="alert" className="text-[11px] leading-4 text-danger-ink">
            {errors.segment}
          </p>
        ) : null}
        {segmentsError ? (
          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
            {segmentsError}
          </p>
        ) : null}
        {segments !== null && segments.length === 0 && !segmentsError ? (
          <p className="text-[11px] text-ink-muted">
            You have no segments yet.{' '}
            <Link to="/segments/new" className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
              Make one
            </Link>
            , then email it.
          </p>
        ) : null}
        <p id={`${selectId}-hint`} className="text-[11px] text-ink-muted">
          Only your own segments. It reaches the people you can open.
        </p>
      </div>
      <RoleFields kind={kind} roles={roles} error={errors.roles} onRoles={onRoles} verb="email" />
    </section>
  );
}
