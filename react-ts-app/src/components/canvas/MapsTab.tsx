import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SAY } from '../../features/canvas/canvasOptions';
import type { RecordKind } from '../../features/canvas/canvasTypes';
import { BUTTON, CardHeader, EmptyState, ErrorState, ListCard, LoadingState } from '../ui';
import { MapRow } from './MapRow';
import { NewMapDialog } from './NewMapDialog';
import { useRecordMaps } from './useRecordMaps';

/** Maps (spec §2.1): the record's stakeholder maps and New map. */
export function MapsTab({ record }: { record: { kind: RecordKind; id: number; name: string | null } }) {
  const { rows, error, retry } = useRecordMaps(record);
  const [creating, setCreating] = useState(false);
  const newMap = (
    <button type="button" onClick={() => setCreating(true)} className={BUTTON}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      New map
    </button>
  );
  const state = error ? (
    <ErrorState message={error} onRetry={retry} />
  ) : !rows ? (
    <LoadingState label="Loading maps" />
  ) : rows.length === 0 ? (
    <EmptyState title={SAY.NO_MAPS} detail="A map shows who matters on this record and how they connect." action={newMap} />
  ) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <ListCard label="Maps" header={<CardHeader title="Maps" action={rows && rows.length > 0 ? newMap : undefined} />} state={state}>
        {rows?.map((row) => <MapRow key={row.id} row={row} showRecord={row.record.kind !== record.kind || row.record.id !== record.id} />)}
      </ListCard>
      {creating ? <NewMapDialog record={record} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
