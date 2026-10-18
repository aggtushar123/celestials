import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { accountBase } from '../../../lib/accountPaths';
import { apiFetch } from '../../../lib/apiClient';
import { clearCallSaveError, logCall, type LogCallInput } from '../../../features/calls/callsSlice';
import { createNote, createTask, type Contact } from '../../../features/customers/customersSlice';
import type { FileParent } from '../../../features/files/filesSlice';
import { ADD_FLOWS, type AddKind } from '../../../features/organizations/storyKinds';
import { CallForm } from '../activity/CallSenseTab';
import { NoteForm } from '../activity/NotesTab';
import { LogSurveyForm } from '../activity/SurveysTab';
import { TaskForm } from '../activity/TasksTab';
import { MeetingForm } from '../../calendar/MeetingForm';
import { Sheet } from './Sheet';

/** `createTask`/`createNote` need a real `customerId` whenever there is no
 *  `accountId` — `AddFlowParent` guarantees that from any real caller; this
 *  turns the guarantee into a value without an unsound cast. */
function requireCustomerId(customerId: number | undefined): number {
  if (customerId === undefined) throw new Error('AddFlow needs an organization or an account to save on.');
  return customerId;
}

/** Exactly what every caller has, at the type level: an organisation (with
 *  an optional chosen account), or an account's own page — never neither
 *  (the bug a runtime `as number` cast used to paper over: see
 *  `requireCustomerId` below). */
export type AddFlowParent = { customerId: number; accountId?: number } | { accountId: number; customerId?: undefined };

/** "+ Add" (spec §1.6): one of the existing create flows in a sheet, saved on
 *  the organization, on the chosen account when an account chip is on, or,
 *  on an account's own page (no `customerId`), on that account through its
 *  flat routes. */
export function AddFlow(
  props: AddFlowParent & {
    what: AddKind;
    accountName?: string;
    isSm: boolean;
    onAdded: () => void;
    onClose: () => void;
  },
) {
  const { what, customerId, accountId, accountName, isSm, onAdded, onClose } = props;
  const dispatch = useAppDispatch();
  const { saving, saveError } = useAppSelector((state) => state.calls);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const parent: FileParent = accountId
    ? { entityType: 'account', customerId: customerId ?? null, accountId }
    : { entityType: 'organization', customerId: customerId ?? null };
  // createTask/createNote need customerId whenever there's no account — the
  // prop union above guarantees one is there; this is the one place that
  // turns that compile-time guarantee into a value, instead of the
  // `customerId as number` cast this replaced (unsound the moment a caller
  // slipped past the union, e.g. through a spread or an `any`). Lazy (called
  // from the two onCreate handlers, not evaluated for a call/survey sheet
  // that never needs it) so a caller who slips past the union still gets
  // TaskForm/NoteForm's own inline error, not a crash on open.
  function taskNoteParent() {
    return accountId != null ? { customerId, accountId } : { customerId: requireCustomerId(customerId) };
  }

  // The calls slice is global: an earlier sheet's (or CallSense's) failure
  // must not greet this one.
  useEffect(() => {
    if (what === 'call') dispatch(clearCallSaveError());
  }, [dispatch, what]);

  // A call offers the company's contacts as participants, as CallSense does;
  // a meeting offers them as invitees.
  useEffect(() => {
    if (what !== 'call' && what !== 'meeting') return;
    let cancelled = false;
    const path = accountId ? `${accountBase(accountId, customerId)}/contacts/` : `/customers/${customerId}/contacts/`;
    apiFetch<Contact[]>(path).then(
      (rows) => {
        if (!cancelled) setContacts(Array.isArray(rows) ? rows : []);
      },
      () => {
        if (!cancelled) setContacts([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [what, customerId, accountId]);

  const title = ADD_FLOWS.find((flow) => flow.key === what)?.label ?? 'Add';
  return (
    <Sheet title={title} description={`On ${accountName ?? 'the organization'}`} isSm={isSm} onClose={onClose}>
      {what === 'task' ? (
        <TaskForm
          parent={accountId != null ? { kind: 'account', id: accountId } : customerId != null ? { kind: 'customer', id: customerId } : undefined}
          onCreate={async (task) => createTask.fulfilled.match(await dispatch(createTask({ ...taskNoteParent(), ...task })))}
          onDone={onAdded}
        />
      ) : null}
      {what === 'note' ? (
        <NoteForm
          onCreate={async (note) => createNote.fulfilled.match(await dispatch(createNote({ ...taskNoteParent(), ...note })))}
          onDone={onAdded}
        />
      ) : null}
      {what === 'call' ? (
        <CallForm
          contacts={contacts}
          saving={saving}
          error={saveError}
          onLog={async (input: LogCallInput) => logCall.fulfilled.match(await dispatch(logCall({ ...parent, input })))}
          onDone={onAdded}
        />
      ) : null}
      {what === 'meeting' && customerId != null ? <MeetingForm customerId={customerId} contacts={contacts} onDone={onAdded} /> : null}
      {what === 'survey' ? (
        <LogSurveyForm customerId={customerId} accountId={accountId} allowCes={!accountId} onLogged={onAdded} onCancel={onClose} />
      ) : null}
    </Sheet>
  );
}
