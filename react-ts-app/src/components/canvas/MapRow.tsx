import { Share2 } from 'lucide-react';
import { editedBy, peopleText } from '../../features/canvas/canvasText';
import type { CanvasRow } from '../../features/canvas/canvasTypes';
import { formatRelativeTime } from '../../features/customers/formatters';
import { RecordIcon } from '../plans/parts';
import { IconChip, ListRow, NUM } from '../ui';

/** "2 days ago", the leading number in tabular figures. */
export function RelativeTime({ iso }: { iso: string }) {
  const text = formatRelativeTime(iso);
  const match = /^(\d+)(\D.*)$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <span className={NUM}>{match[1]}</span>
      {match[2]}
    </>
  );
}

/** One map (spec §2.1, §2.3) as a list row: its name to the editor, its record when the
 *  list spans records, how many people, and who edited it last. */
export function MapRow({ row, showRecord }: { row: CanvasRow; showRecord: boolean }) {
  const { who } = editedBy(row);
  return (
    <ListRow
      dataAttrs={{ 'data-map': row.id }}
      title={row.name}
      href={`/canvas/${row.id}`}
      leading={<IconChip icon={Share2} />}
      meta={
        <>
          {showRecord ? (
            <>
              <span className="inline-flex items-center gap-1 align-middle">
                <RecordIcon kind={row.record.kind} />
                {row.record.name}
              </span>{' '}
              ·{' '}
            </>
          ) : null}
          <span className={NUM}>{row.people}</span> {peopleText(row.people)} · {who ? `Edited by ${who} · ` : 'Edited '}
          <RelativeTime iso={row.updated_at} />
        </>
      }
    />
  );
}
