import { Save } from 'lucide-react';
import { NAME_MAX, SAY } from '../../features/canvas/canvasOptions';
import { editedBy } from '../../features/canvas/canvasText';
import { MadeByLine } from '../agents/MadeByLine';
import { RecordLink } from '../plans/parts';
import { DetailHeader, FOCUS } from '../ui';
import { RelativeTime } from './MapRow';
import type { MapApi } from './useMap';

// The display size: the input is the page's name; -ml-2 cancels its padding
// so the text meets the content's left edge.
const NAME = `-ml-2 min-h-11 sm:min-h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-[22px] leading-7 font-semibold tracking-tight text-ink hover:border-line focus:border-line-strong disabled:text-ink-muted ${FOCUS}`;

/** The editor's header (spec §2.2): the name (inline), the record, who
 *  edited, Unsaved changes, Save, and ⋯ with Delete for those who may.
 *  The name input locks while a save is in flight (MapEditor locks the
 *  board the same way): simpler and still correct than reconciling a
 *  mid-save edit against the save's answer, and nothing is lost: the
 *  typed value just sits disabled until the save settles. */
export function MapHeader({ map, editable, onDelete }: { map: MapApi; editable: boolean; onDelete: () => void }) {
  const canvas = map.canvas!;
  const { who } = editedBy(canvas);
  const heading = editable ? (
    <>
      <h1 className="sr-only">{canvas.name}</h1>
      <input aria-label="Map name" value={map.name} maxLength={NAME_MAX} disabled={map.saving} onChange={(e) => map.setName(e.target.value)} className={NAME} />
    </>
  ) : undefined;
  return (
    <DetailHeader
      title={canvas.name}
      heading={heading}
      actions={editable ? [{ key: 'save', label: 'Save', icon: Save, onSelect: () => void map.save(), primary: true, disabled: !map.dirty || map.saving, busyLabel: map.saving ? 'Saving…' : undefined }] : []}
      menu={editable && canvas.can_delete ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, danger: true }] : []}
      menuLabel="Map actions"
      meta={
        <>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <RecordLink record={canvas.record} /> ·
          </span>
          {who ? (
            <>
              <span>Edited by {who} ·</span>
              <span>
                <RelativeTime iso={canvas.updated_at} />
              </span>
            </>
          ) : (
            <span>
              Edited <RelativeTime iso={canvas.updated_at} />
            </span>
          )}
        </>
      }
      status={editable && map.dirty ? SAY.UNSAVED : null}
    >
      <MadeByLine madeBy={canvas.made_by} />
    </DetailHeader>
  );
}
