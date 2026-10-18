import { useId } from 'react';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { hiddenLine, reach, sendBlocker, skipLines } from '../../features/surveys/surveyText';
import type { AudienceCounts } from '../../features/surveys/surveyTypes';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { Lines } from './Lines';
import type { AudienceState } from './useAudience';
import { NUM, TYPE } from '../ui';

const LABEL = TYPE.label;

/** "42 people at 18 organisations", the skips, those the builder can't
 *  open, and why a send can't go. Shared by the summary and the confirm. */
export function ReachLines({ counts, kind, blockerId }: { counts: AudienceCounts; kind: SegmentKind | null; blockerId?: string }) {
  const line = reach(counts, kind);
  const skips = skipLines(counts);
  const hidden = hiddenLine(counts);
  const blocker = sendBlocker(counts);
  return (
    <div className="flex flex-col gap-1">
      <p data-part="reach" className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-ink-muted">
        <span className={`${NUM} text-[22px] font-semibold text-ink`}>{line.people}</span> {line.peopleNoun} at <span className={NUM}>{line.records}</span>{' '}
        {line.recordNoun}
      </p>
      {skips.length > 0 ? (
        <p data-part="skips" className="text-[11px] text-ink-muted">
          <Lines lines={skips} />
        </p>
      ) : null}
      {hidden ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={NUM}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {blocker ? (
        <p id={blockerId} data-part="blocker" className="text-[13px] text-danger">
          {blocker}
        </p>
      ) : null}
    </div>
  );
}

/** Under the preview (spec §2.2): who the survey reaches, counted on the
 *  server from the builder's own view. */
export function AudienceSummary({ state, kind }: { state: AudienceState; kind: SegmentKind | null }) {
  const headingId = useId();
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.last : null;
  let body;
  if (state.status === 'incomplete') {
    body = <p className="text-[13px] text-ink-muted">Choose a segment, and who to ask at each organisation, to see who it reaches.</p>;
  } else if (state.status === 'error') {
    body = (
      <p role="alert" className="text-[13px] text-danger">
        {state.message}
      </p>
    );
  } else if (!data) {
    body = <ItemSkeleton count={1} label="Counting who it reaches" avatar={false} />;
  } else {
    body = (
      <div className={state.status === 'loading' ? 'opacity-60' : ''}>
        <ReachLines counts={data} kind={kind} />
      </div>
    );
  }
  return (
    <section aria-labelledby={headingId} aria-busy={state.status === 'loading'} className="flex flex-col gap-2 rounded-xl bg-subtle p-3">
      <h3 id={headingId} className={LABEL}>
        Who it reaches
      </h3>
      {body}
    </section>
  );
}
