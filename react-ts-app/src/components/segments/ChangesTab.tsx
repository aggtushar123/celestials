import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AIAttribute } from '../../features/attributes/types';
import { dayText, reasonText } from '../../features/segments/ruleSentence';
import { fetchChanges } from '../../features/segments/segmentApi';
import { recordHref } from '../../features/segments/segmentFields';
import { CHANGE_WINDOWS, type ChangeWindow } from '../../features/segments/segmentParams';
import type { ChangeDay, ChangeRecord, Segment, SegmentChanges } from '../../features/segments/segmentTypes';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, FOCUS, LoadingState, NUM, SegmentedControl, TYPE } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { tabPanelProps, type TabPanelIds } from './tabPanel';

const WINDOWS = CHANGE_WINDOWS.map((days) => ({ value: String(days), label: `${days} days` }));

type Answer = { key: string; data: SegmentChanges } | { key: string; error: string };

function Moves({
  title,
  direction,
  records,
  more,
  segment,
  attributes,
}: {
  title: string;
  direction: 'entered' | 'left';
  records: ChangeRecord[];
  more: number;
  segment: Segment;
  attributes: AIAttribute[];
}) {
  if (records.length === 0 && more === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className={TYPE.label}>{title}</p>
      <ul aria-label={title} className="flex flex-col gap-0.5">
        {records.map((record) => (
          <li key={record.id} className="flex min-w-0 flex-wrap items-center gap-x-2">
            <Link
              to={recordHref(segment.kind, record.id)}
              className={`inline-flex min-h-11 min-w-0 max-w-full items-center rounded-sm ${TYPE.body} font-semibold hover:underline sm:min-h-0 ${FOCUS}`}
            >
              {/* `truncate` on the inline-flex Link itself never ellipsizes
                  (no box to overflow); the span gives it one. */}
              <span className="truncate">{record.name}</span>
            </Link>{' '}
            <span className={TYPE.meta}>{reasonText(record.reason, direction, segment.kind, attributes)}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p data-part="more" className={TYPE.meta}>
          <span className={NUM}>+{more}</span> more
        </p>
      ) : null}
    </div>
  );
}

function DayItem({ day, segment, attributes }: { day: ChangeDay; segment: Segment; attributes: AIAttribute[] }) {
  return (
    <Card as="li" pad="none" data-day={day.date}>
      <CardHeader
        level={3}
        title={dayText(day.date)}
        meta={
          <>
            <span className={NUM}>{day.totals.entered}</span> entered · <span className={NUM}>{day.totals.left}</span> left
          </>
        }
      />
      <CardBody>
        <div className="flex flex-col gap-3">
          <Moves title="Entered" direction="entered" records={day.entered} more={day.more.entered} segment={segment} attributes={attributes} />
          <Moves title="Left" direction="left" records={day.left} more={day.more.left} segment={segment} attributes={attributes} />
        </div>
      </CardBody>
    </Card>
  );
}

/** A segment's Changes tab (spec §3): who entered and who left, day by day,
 *  with the reason; 7, 30 or 90 days (plan Decision 6). A day names at most
 *  100 each way, then "+N more"; moves of records the reader can't open are
 *  only counted. */
export function ChangesTab({
  segment,
  days,
  onDays,
  attributes,
  panel,
}: {
  segment: Segment;
  days: ChangeWindow;
  onDays: (days: ChangeWindow) => void;
  attributes: AIAttribute[];
  /** The page's Tabs ids (see MembersTab). */
  panel?: TabPanelIds;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = `${segment.id}#${days}#${attempt}`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchChanges(segment.id, days).then(
      (data) => {
        if (alive) setAnswer({ key, data });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, error: errorMessage(err, 'Could not load the changes.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [segment.id, days, key]);

  const current = answer?.key === key ? answer : null;
  let body;
  if (!current)
    body = (
      <Card pad="none">
        <LoadingState label="Loading changes" />
      </Card>
    );
  else if ('error' in current)
    body = (
      <Card pad="none">
        <ErrorState message={current.error} onRetry={() => setAttempt((n) => n + 1)} />
      </Card>
    );
  else if (current.data.days.length === 0)
    body = (
      <Card pad="none">
        <EmptyState title="No changes" detail={`Nobody entered or left in the last ${days} days.`} />
      </Card>
    );
  else {
    body = (
      <ol aria-label="Days" className="flex flex-col gap-3">
        {current.data.days.map((day) => (
          <DayItem key={day.date} day={day} segment={segment} attributes={attributes} />
        ))}
      </ol>
    );
  }
  const hidden = current && 'data' in current ? current.data.hidden_count : 0;

  return (
    <div role="tabpanel" {...tabPanelProps('Changes', panel)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={TYPE.bodyMuted}>Who entered and who left, newest day first.</p>
        <SegmentedControl label="Changes window" options={WINDOWS} value={String(days)} onChange={(value) => onDays(Number(value) as ChangeWindow)} />
      </div>
      {segment.paused ? (
        <p className={TYPE.bodyMuted}>Paused: its owner is inactive, so no changes are recorded until they are back.</p>
      ) : null}
      {body}
      {hidden > 0 ? (
        <p className={TYPE.bodyMuted}>
          <span className={NUM}>{hidden}</span> more {hidden === 1 ? 'change involves a record' : 'changes involve records'} you can't open.
        </p>
      ) : null}
    </div>
  );
}
