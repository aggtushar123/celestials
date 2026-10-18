import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { startPlan } from '../../features/plans/planApi';
import { checkStart, startDraft, toStart, type StartDraft } from '../../features/plans/planDraft';
import { hasErrors, isPlanOpen, NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK } from '../../features/plans/planOptions';
import { templateParam, withoutTemplate } from '../../features/plans/planParams';
import { planOpenText, todayIso } from '../../features/plans/planText';
import type { PersonRef, RecordKind, RecordRef } from '../../features/plans/planTypes';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { RecordStep } from '../../components/plans/RecordStep';
import { ReviewStep } from '../../components/plans/ReviewStep';
import { TemplateStep } from '../../components/plans/TemplateStep';
import { usePlanRecord } from '../../components/plans/usePlanRecord';
import { ANY_REFUSAL, useRefusalFocus } from '../../components/plans/useRefusalFocus';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { useTemplates } from '../../components/plans/useTemplates';
import { BuilderDialog } from '../../components/segments/BuilderDialog';

const START_FIELDS = ['name', 'owner', 'start_date', 'template', 'customer', 'account', 'milestones'] as const;

/** The New plan modal (spec §2.2): record, template and review in one
 *  scrolling dialog. `fixed` is the record a record's page opened it over
 *  (locked). A change of record or template rebuilds the review. */
export function NewPlanForm({ fixed, initialTemplate, onClose }: {
  fixed: { kind: RecordKind; id: number } | null;
  initialTemplate: number | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const me = useAppSelector((state) => state.auth.user?.id ?? 0);
  const members = useMembers();
  const people = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const [picked, setPicked] = useState<RecordRef | null>(null);
  const loaded = usePlanRecord(fixed ?? picked);
  const record: RecordRef | null = loaded.record ?? picked;
  const owned = loaded.record?.owner ?? null;
  const recordOwner = owned && people.some((person) => person.id === owned.id) ? owned.id : null;
  const [templatesLoad, retryTemplates] = useTemplates();
  const [templateId, setTemplateId] = useState<number | null>(initialTemplate);
  const lists = templatesLoad.status === 'ready' ? templatesLoad.lists : null;
  const template = lists ? ([...lists.builtin, ...lists.mine, ...lists.shared].find((one) => one.id === templateId) ?? null) : null;

  const draftKey = record && template ? `${record.kind}:${record.id}:${template.id}` : '';
  const [draft, setDraft] = useState<{ key: string; value: StartDraft } | null>(null);
  if (draftKey && record && template && draft?.key !== draftKey) {
    setDraft({ key: draftKey, value: startDraft(template, record, me, todayIso()) });
  }
  const review = draft && draft.key === draftKey ? draft.value : null;

  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const [conflict, setConflict] = useState<{ planId: number; name: string } | null>(null);
  const { busy, run } = useSubmitOnce();
  const { ref: bodyRef, focusRefusal } = useRefusalFocus<HTMLDivElement>(ANY_REFUSAL);
  const refuse = (found: PlanErrors) => {
    setErrors(found);
    focusRefusal();
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setConflict(null);
    const found: PlanErrors = review ? checkStart(review) : { field: {}, milestones: [] };
    if (!record) found.field.record = CHECK.RECORD;
    if (!template) found.field.template = CHECK.TEMPLATE;
    if (hasErrors(found) || !review || !record || !template) {
      refuse(found);
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => startPlan(toStart(review, template.id, record, recordOwner)));
    if (!outcome) return;
    if (outcome.ok) {
      // Replace: Back from the new plan goes to the page under the modal,
      // not to a fresh modal that invites a second start.
      navigate(`/projects/${outcome.value.id}`, { replace: true });
      return;
    }
    if (isPlanOpen(outcome.error)) {
      setConflict({ planId: outcome.error.body.plan_id, name: template.name });
      focusRefusal();
      return;
    }
    refuse(planErrors(outcome.error, START_FIELDS, 'Could not start this plan. Try again.'));
  }

  return (
    <BuilderDialog title="New plan" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4">
          {conflict ? (
            <p role="alert" data-part="plan-open" data-error tabIndex={-1} className={`flex flex-wrap items-center gap-x-2 text-[13px] text-danger ${FOCUS}`}>
              {planOpenText(conflict.name)}
              <Link to={`/projects/${conflict.planId}`} className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
                Open that plan
              </Link>
            </p>
          ) : null}
          {errors.form ? (
            <p role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          <RecordStep
            record={record}
            locked={fixed !== null}
            loading={fixed !== null && !loaded.record && !loaded.error}
            error={errors.field.record ?? errors.field.customer ?? errors.field.account ?? loaded.error ?? undefined}
            onPick={(next) => {
              setPicked(next);
              setConflict(null);
            }}
            onClear={() => setPicked(null)}
          />
          <TemplateStep
            load={templatesLoad}
            chosen={templateId}
            error={errors.field.template}
            onPick={(id) => {
              setTemplateId(id);
              setConflict(null);
            }}
            onRetry={retryTemplates}
          />
          {review ? (
            <ReviewStep draft={review} people={people} recordOwner={recordOwner} errors={errors} onChange={(value) => setDraft({ key: draftKey, value })} />
          ) : (
            <p className="text-[13px] text-ink-muted">Choose a record and a template, and the plan's milestones show here to review.</p>
          )}
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !review} className={PRIMARY}>
            {busy ? 'Starting…' : 'Start plan'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** /projects/new over the list; `?template=` from Templates' Use. The
 *  list's filters ride along in the query and come back on close. */
export function NewPlanRoute() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return <NewPlanForm fixed={null} initialTemplate={templateParam(search)} onClose={() => navigate(`/projects${withoutTemplate(search.toString())}`)} />;
}

/** /organizations/:id/plans/new and /accounts/:id/plans/new: the modal over
 *  the record's page, the record chosen and locked (spec §2.2). */
export function RecordPlanRoute({ kind }: { kind: RecordKind }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { id } = useParams();
  const recordId = Number(id);
  // The page's `?tab=` rides along in the query and comes back on close.
  const back = `${kind === 'organization' ? `/organizations/${id}` : `/accounts/${id}`}${withoutTemplate(search)}`;
  return <NewPlanForm fixed={{ kind, id: recordId }} initialTemplate={null} onClose={() => navigate(back)} />;
}
