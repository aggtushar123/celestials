import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { DayMoves, SegmentListRow } from '../../features/segments/segmentTypes';
import { movesText, OWNER_ONLY } from '../../features/segments/summaryFigures';
import { ListRow, NO_VALUE, NUM, TYPE } from '../ui';
import { SEGMENT_GRID } from './segmentGrid';
import { SizeSparkline } from './SizeSparkline';

const SHARING = { private: null, workspace: 'Workspace', people: 'Shared' } as const;

/** The no-value mark where the figure is the owner's alone (Ruling S8). */
function OwnerOnly() {
  return (
    <>
      <span aria-hidden="true">{NO_VALUE}</span>
      <span className="sr-only">{OWNER_ONLY}</span>
    </>
  );
}

/** Today's moves: "+2 / −1" in tabular figures, or the words "No change". */
function Today({ moves }: { moves: DayMoves }) {
  if (moves.entered === 0 && moves.left === 0) return <>No change</>;
  return <span className={NUM}>{movesText(moves)}</span>;
}

/** One segment (spec §3; UI foundations spec §4.2): the name opens it;
 *  kind, owner, sharing and Paused are the meta line's words; members,
 *  today's moves and the 30-day size sit in the Segments grid's columns
 *  from a 40rem list, and below it the meta line says the two figures. */
export function SegmentRow({ row }: { row: SegmentListRow }) {
  const sharing = SHARING[row.sharing];
  const members = row.member_count === null ? <OwnerOnly /> : <span className={NUM}>{row.member_count}</span>;
  const today = row.today === null ? <OwnerOnly /> : <Today moves={row.today} />;
  return (
    <ListRow
      dataAttrs={{ 'data-segment': row.id }}
      title={row.name}
      href={`/segments/${row.id}`}
      columns={SEGMENT_GRID.columns}
      gridAt={SEGMENT_GRID.gridAt}
      meta={
        <>
          {KIND_LABEL[row.kind]} · {row.is_owner ? 'You' : row.owner.name}
          {sharing ? ` · ${sharing}` : ''}
          {row.paused ? ' · Paused' : ''}
          <span className={SEGMENT_GRID.narrowOnly}>
            {' · '}
            {members} members · {today} today
          </span>
        </>
      }
      cells={[
        <span key="count" data-part="count" className={`block text-right ${TYPE.body} ${NUM}`}>
          {members}
        </span>,
        <span key="today" data-part="today" className={`block text-right ${TYPE.body}`}>
          {today}
        </span>,
        <span key="sparkline" data-part="sparkline" className="flex items-center">
          {row.sparkline === null ? <OwnerOnly /> : <SizeSparkline sizes={row.sparkline} />}
        </span>,
      ]}
    />
  );
}
