import { useCallback, useRef, useState } from 'react';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';

/** What both Pipelines views need to add, edit and delete with the existing
 *  forms: every loaded row remembered by id (a bulk report names it), the
 *  row being edited (the form is built from it, plan Decision 2), the one
 *  being deleted, and whether Add is open (with the Board column's stage).
 *  Where a new item belongs is picked in the form itself (ParentPicker). */
export function usePipelineForms() {
  // Written in fetch callbacks, read in event handlers.
  const rows = useRef(new Map<number, PipelineRow>());
  const remember = useCallback((list: PipelineRow[]) => {
    for (const row of list) rows.current.set(row.id, row);
  }, []);
  const titleOf = useCallback((id: number) => rows.current.get(id)?.title ?? `Item ${id}`, []);

  const [editing, setEditing] = useState<PipelineRow | null>(null);
  const openEdit = useCallback((row: PipelineRow) => setEditing(row), []);
  const closeEdit = useCallback(() => setEditing(null), []);

  const [deleting, setDeleting] = useState<PipelineRow | null>(null);
  const requestDelete = useCallback((row: PipelineRow) => {
    setEditing(null);
    setDeleting(row);
  }, []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const [adding, setAdding] = useState<{ stage?: string } | null>(null);
  const openAdd = useCallback((stage?: string) => setAdding({ stage }), []);
  const closeAdd = useCallback(() => setAdding(null), []);

  return { remember, titleOf, editing, openEdit, closeEdit, deleting, requestDelete, closeDelete, adding, openAdd, closeAdd };
}

export type PipelineForms = ReturnType<typeof usePipelineForms>;
