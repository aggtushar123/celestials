import { dayLabel, segmentLabel } from '../../features/surveys/surveyText';
import type { SendListRow } from '../../features/surveys/surveyTypes';
import { TYPE_LABEL } from '../../features/surveys/questions';
import { Badge, ListRow, NO_VALUE, NUM, TYPE } from '../ui';
import { Rate } from './Rate';
import { SEND_GRID } from './sendGrid';

const SHARING = { private: null, workspace: 'Workspace', people: 'Shared' } as const;

/** One send (spec §2.1; UI foundations spec §4.2): the name opens it;
 *  segment, date, sender and sharing are the meta line; the type, answered
 *  of sent and the rate sit in the sends grid's columns from a 40rem list
 *  (a draft shows Draft there), and below it the meta line says them. */
export function SendRow({ row }: { row: SendListRow }) {
  const draft = row.status === 'draft';
  const sharing = SHARING[row.sharing];
  const when = draft ? `Edited ${dayLabel(row.updated_at)}` : row.sent_at ? `Sent ${dayLabel(row.sent_at)}` : 'Sending now';
  const answered = draft ? null : (
    <>
      <span className={NUM}>{row.answered}</span> of <span className={NUM}>{row.sent}</span>
    </>
  );
  return (
    <ListRow
      dataAttrs={{ 'data-send': row.id }}
      title={row.name}
      href={`/surveys/${row.id}`}
      columns={SEND_GRID.columns}
      gridAt={SEND_GRID.gridAt}
      meta={
        <>
          {segmentLabel(row.segment)} · {when} · {row.is_owner ? 'You' : row.owner.name}
          {sharing ? ` · ${sharing}` : ''}
          <span className={SEND_GRID.narrowOnly}>
            {' · '}
            {TYPE_LABEL[row.survey_type]} · {draft ? 'Draft' : <>{answered} answered</>}
          </span>
        </>
      }
      cells={[
        <span key="type" className={`block ${TYPE.bodyMuted}`}>
          {TYPE_LABEL[row.survey_type]}
        </span>,
        <span key="answered" data-part="answered" className={`block text-right ${TYPE.body}`}>
          {draft ? <Badge>Draft</Badge> : answered}
        </span>,
        <span key="rate" className={`block text-right ${TYPE.body} ${NUM}`}>
          {draft ? NO_VALUE : <Rate rate={row.rate} isOwner={row.is_owner} />}
        </span>,
      ]}
    />
  );
}
