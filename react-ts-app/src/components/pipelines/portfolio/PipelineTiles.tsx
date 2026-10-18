import { useState } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineSummary } from '../../../features/pipelines/pipelineTypes';
import { Card, LoadingState, NUM, SegmentedControl, TYPE, Tile, tileRow } from '../../ui';

type Span = '30' | '90';
const SPANS: { value: Span; label: string }[] = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];
const only = (values: string[], value: string) => values.length === 1 && values[0] === value;
/** Whether `values` is exactly `target`, in any order: used to tell a
 *  Closing/Due tile's own open-stage restriction from any other stage
 *  filter the URL happens to carry. */
const sameStages = (values: string[], target: string[]) => values.length === target.length && target.every((value) => values.includes(value));

/** The four tiles (spec §1, and the backend ruling: they ignore only the
 *  stage filter). Every figure is the server's, over every filtered row. A
 *  tile sets its filter and pressing it again clears it; the first tile is
 *  the List's default view, so it is a figure only (plan Decision 3). The
 *  open stages moved to PipelineStagesCard (UI foundations spec §4.3).
 *
 *  Closing/Due within 30/90 days also pins the kind's open stages (a
 *  controller ruling): the backend's `date=30|90` window has no open
 *  condition of its own, so without it the list could show closed rows the
 *  tile never counted. Overdue needs no such pin: its window already
 *  requires an open stage (services/pipelines_portfolio's `matches_date`),
 *  so it lands on exactly its count with `date=overdue` alone.
 *
 *  On phones the row swipes sideways; the page never scrolls sideways. */
export function PipelineTiles({
  kind,
  summary,
  failed = false,
  currency,
  params,
  onFilter,
}: {
  kind: PipelineKind;
  summary: PipelineSummary | null;
  failed?: boolean;
  currency: CurrencyCode;
  params: PipelineParams;
  onFilter: (patch: Partial<PipelineParams>) => void;
}) {
  // The Closing tile's window follows a 30/90 date filter set elsewhere
  // (the Filters panel, a chip). Synced during render.
  const [span, setSpan] = useState<Span>(params.date === '90' ? '90' : '30');
  const [seenDate, setSeenDate] = useState(params.date);
  if (seenDate !== params.date) {
    setSeenDate(params.date);
    if (params.date === '30' || params.date === '90') setSpan(params.date);
  }

  if (!summary) {
    if (!failed) return <LoadingState label="Loading summary" variant="tiles" count={4} />;
    return (
      <Card pad="sm">
        <p className={TYPE.label}>Summary unavailable</p>
        <p className={TYPE.meta}>The tiles return once the list loads.</p>
      </Card>
    );
  }

  const meta = (mrr: number) => (
    <>
      <span className={NUM}>{formatCompactMoney(mrr, currency)}</span> MRR
    </>
  );
  const within = summary.within[span];
  const withinOn = params.date === span && sameStages(params.stage, kind.openStages);
  const done = summary.done_this_quarter;
  const doneOn = only(params.stage, done.stage) && params.changed === 'quarter';

  return (
    <div className={tileRow(4, 'container')}>
      <Tile label={kind.tiles.open} value={summary.open.count} meta={meta(summary.open.mrr)} />
      <Tile
        label={kind.tiles.within}
        value={within.count}
        meta={meta(within.mrr)}
        pressed={withinOn}
        onPress={() => onFilter(withinOn ? { date: '', stage: [] } : { date: span, stage: [...kind.openStages] })}
        buttonLabel={`${kind.tiles.within} within ${span} days: ${within.count}`}
        action={<SegmentedControl size="sm" label={`${kind.tiles.within} window`} value={span} onChange={setSpan} options={SPANS} />}
      />
      <Tile
        label="Overdue"
        value={summary.overdue.count}
        meta={meta(summary.overdue.mrr)}
        pressed={params.date === 'overdue'}
        onPress={() => onFilter({ date: params.date === 'overdue' ? '' : 'overdue' })}
        buttonLabel={`Overdue: ${summary.overdue.count}`}
      />
      <Tile
        label={kind.tiles.done}
        value={done.count}
        meta={meta(done.mrr)}
        pressed={doneOn}
        onPress={() => onFilter(doneOn ? { stage: [], changed: '' } : { stage: [done.stage], changed: 'quarter' })}
        buttonLabel={`${kind.tiles.done}: ${done.count}`}
      />
    </div>
  );
}
