import { useState } from 'react';
import { useAppDispatch } from '../../../hooks';
import { deleteOpportunity, deleteRisk, type Opportunity, type Risk } from '../../../features/customers/customersSlice';
import type { PipelineParentChoice } from '../../../features/pipelines/pipelineApi';
import { opportunityRecord, riskRecord, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import { ConfirmDialog } from '../../organizations/ConfirmDialog';
import { OpportunityFormModal } from '../OpportunityFormModal';
import { RiskFormModal } from '../RiskFormModal';
import { ParentPicker } from './ParentPicker';
import type { PipelineForms } from './usePipelineForms';

/** The existing Opportunity / Risk forms and the delete confirmation, for
 *  the kind on screen. Every save and delete reloads the page's book. */
export function PipelineModals({ kind, forms, onSaved }: { kind: PipelineKind; forms: PipelineForms; onSaved: () => void }) {
  const dispatch = useAppDispatch();
  const { adding, editing, deleting } = forms;
  const confirm = deleting ? (
    <ConfirmDialog
      title={`Delete ${deleting.title}?`}
      message="This can't be undone."
      confirmLabel="Delete"
      danger
      onConfirm={async () => {
        if (kind.key === 'opportunities') await dispatch(deleteOpportunity(deleting.id)).unwrap();
        else await dispatch(deleteRisk(deleting.id)).unwrap();
        onSaved();
      }}
      onClose={forms.closeDelete}
    />
  ) : null;

  if (kind.key === 'opportunities') {
    return (
      <>
        {adding ? <AddForm kind={kind} stage={adding.stage} onClose={forms.closeAdd} onSaved={onSaved} /> : null}
        {editing ? (
          <OpportunityFormModal
            opportunity={opportunityRecord(editing)}
            onClose={forms.closeEdit}
            onSaved={onSaved}
            onDeleteRequest={() => forms.requestDelete(editing)}
          />
        ) : null}
        {confirm}
      </>
    );
  }
  return (
    <>
      {adding ? <AddForm kind={kind} stage={adding.stage} onClose={forms.closeAdd} onSaved={onSaved} /> : null}
      {editing ? (
        <RiskFormModal risk={riskRecord(editing)} onClose={forms.closeEdit} onSaved={onSaved} onDeleteRequest={() => forms.requestDelete(editing)} />
      ) : null}
      {confirm}
    </>
  );
}

/** Add (spec §1): the kind's form with a server-searched "Belongs to" in
 *  place of its Company select. An organisation keeps the form's own flow
 *  (organisation, then an optional account of it); an account creates on
 *  the account's own route. */
function AddForm({ kind, stage, onClose, onSaved }: { kind: PipelineKind; stage?: string; onClose: () => void; onSaved: () => void }) {
  const [parent, setParent] = useState<PipelineParentChoice | null>(null);
  const place = {
    customerId: parent?.type === 'organisation' ? parent.id : undefined,
    accountId: parent?.type === 'account' ? parent.id : undefined,
    parentField: <ParentPicker value={parent} onChange={setParent} />,
    onClose,
    onSaved,
  };
  return kind.key === 'opportunities' ? (
    <OpportunityFormModal {...place} defaultStage={stage as Opportunity['stage'] | undefined} />
  ) : (
    <RiskFormModal {...place} defaultStage={stage as Risk['stage'] | undefined} />
  );
}
