import type { ReactNode } from 'react';
import { Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { ChangedSkeleton } from '../../components/brain/ChangedSkeleton';
import { ChangedTiles } from '../../components/brain/ChangedTiles';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { MeasureTable } from '../../components/brain/MeasureTable';
import { MovesList } from '../../components/brain/MovesList';
import { ScopeBriefCard } from '../../components/brain/ScopeBriefCard';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useChanged } from '../../components/brain/useChanged';
import { Card, EmptyState as UiEmptyState, ErrorState as UiErrorState, LoadingState, QUIET, TYPE } from '../../components/ui';
import { emptyTitle, graphHref, SAY, sinceLine } from '../../features/brain/brainText';
import { useReportBrainScope } from './ask/brainScopeReport';

/** Two columns from lg, stacked below; the columns can shrink below their content. */
const PAIR = 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]';

/** /brain: What changed (spec 2026-10-05 §2.3), for every member, scoped Me ·
 *  My team · Company, in the Brain frame (brain UI spec 2026-10-06): the
 *  headline tiles, the since line and the graph link, then the brief beside
 *  What moved, and every metric beneath. */
export function WhatChangedPage() {
  const brain = useBrainScope();
  useReportBrainScope(brain.scope, brain.error !== null);
  const changed = useChanged(brain.scope, brain.refused);
  const data = changed.data;
  const scope = brain.scope;

  // Order (spec §4.3, audit S2): the tiles, or their skeleton, come first
  // under the notice, so the tile row sits at the same offset on every Brain
  // tab; the since line and graph link follow, then the pair and the measures.
  let lead: ReactNode = null;
  let rest: ReactNode;
  if (brain.error)
    rest = (
      <Card pad="none">
        <UiErrorState message={brain.error} onRetry={brain.retry} />
      </Card>
    );
  else if (changed.error)
    rest = (
      <Card pad="none">
        <UiErrorState message={changed.error} onRetry={changed.retry} />
      </Card>
    );
  else if (!scope || !data) {
    lead = (
      <div aria-hidden="true">
        <LoadingState label="Loading headline figures" variant="tiles" count={4} />
      </div>
    );
    rest = <ChangedSkeleton />;
  } else if (data.empty)
    rest = (
      <Card pad="none">
        <UiEmptyState title={emptyTitle(scope)} detail={SAY.EMPTY_DETAIL} />
      </Card>
    );
  else {
    lead = <ChangedTiles metrics={data.metrics} currency={data.currency} />;
    rest = (
      <>
        <div className={PAIR}>
          <ScopeBriefCard key={`brief-${scope}`} scope={scope} scopeLabel={brain.label} onRefused={brain.refused} />
          <MovesList key={`moves-${scope}`} changed={data} onRefused={brain.refused} />
        </div>
        <MeasureTable changed={data} />
      </>
    );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {lead}
      {scope ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {data ? <p className={TYPE.bodyMuted}>{sinceLine(data)}</p> : null}
          <Link to={graphHref(scope)} className={`${QUIET} gap-1.5`}>
            <Network className="h-4 w-4" aria-hidden="true" />
            {SAY.KNOWLEDGE_GRAPH}
          </Link>
        </div>
      ) : null}
      {rest}
    </BrainFrame>
  );
}
