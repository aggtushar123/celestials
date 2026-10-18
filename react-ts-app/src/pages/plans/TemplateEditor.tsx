import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { useMembers } from '../../features/knowledge/useMembers';
import { createTemplate, fetchTemplate, updateTemplate } from '../../features/plans/planApi';
import { hasErrors, NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { DESCRIPTION_MAX, KIND_LABEL, KINDS, MILESTONES_MAX, NAME_MAX, TASKS_MAX } from '../../features/plans/planOptions';
import type { PersonRef, PlanKind, PlanTemplate } from '../../features/plans/planTypes';
import { checkTemplate, emptyTemplateDraft, templateCounts, templateDraftOf, toTemplateWrite, type TemplateDraft } from '../../features/plans/templateDraft';
import { MadeByLine } from '../../components/agents/MadeByLine';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { TemplateMilestones } from '../../components/plans/TemplateMilestones';
import { SHARING_NOTE } from '../../components/plans/styles';
import { ANY_REFUSAL, useRefusalFocus } from '../../components/plans/useRefusalFocus';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { Field } from '../../components/rules/Field';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { SharingFields } from '../../components/segments/SharingFields';
import { BUTTON, EmptyState, ErrorState, FOCUS, INPUT, INVALID, LoadingState, NUM, PRIMARY, QUIET, Select, TYPE } from '../../components/ui';

const FIELDS = ['name', 'kind', 'description', 'milestones', 'sharing', 'shared_with'] as const;

/** The template editor (spec §2.4) for a new template or one of yours. */
function TemplateForm({ initial, onClose, onDone }: { initial: PlanTemplate | null; onClose: () => void; onDone: () => void }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active && member.id !== me).map(({ id, name }) => ({ id, name })), [members, me]);
  const [draft, setDraft] = useState<TemplateDraft>(() => (initial ? templateDraftOf(initial) : emptyTemplateDraft()));
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce();
  const { ref: bodyRef, focusRefusal } = useRefusalFocus<HTMLDivElement>(ANY_REFUSAL);
  const nameId = useId();
  const kindId = useId();
  const descriptionId = useId();
  const counts = templateCounts(draft);
  const refuse = (found: PlanErrors) => {
    setErrors(found);
    focusRefusal();
  };
  const change = (patch: Partial<TemplateDraft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = checkTemplate(draft);
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors(NO_ERRORS);
    const body = toTemplateWrite(draft);
    const outcome = await run(() => (initial ? updateTemplate(initial.id, body) : createTemplate(body)));
    if (!outcome) return;
    if (outcome.ok) onDone();
    else refuse(planErrors(outcome.error, FIELDS, 'Could not save this template.'));
  }

  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New template'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p role="alert" data-error tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          {initial ? <MadeByLine madeBy={initial.made_by} /> : null}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field id={nameId} label="Name" error={errors.field.name}>
              {(aria) => (
                <input id={nameId} {...aria} value={draft.name} maxLength={NAME_MAX} onChange={(event) => change({ name: event.target.value })} className={`${INPUT} ${INVALID}`} />
              )}
            </Field>
            <Field id={kindId} label="Kind" error={errors.field.kind}>
              {(aria) => (
                <Select
                  id={kindId}
                  label="Kind"
                  labelPosition="external"
                  invalid={aria['aria-invalid']}
                  describedBy={aria['aria-describedby']}
                  value={draft.kind}
                  onChange={(kind: PlanKind) => change({ kind })}
                  options={KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))}
                />
              )}
            </Field>
          </div>
          <Field
            id={descriptionId}
            label="Description (optional)"
            hint={
              <>
                <span className={NUM}>{draft.description.length}</span> of <span className={NUM}>{DESCRIPTION_MAX}</span>
              </>
            }
            error={errors.field.description}
          >
            {(aria) => (
              <textarea
                id={descriptionId}
                {...aria}
                rows={2}
                maxLength={DESCRIPTION_MAX}
                value={draft.description}
                onChange={(event) => change({ description: event.target.value })}
                className={`${INPUT} ${INVALID} resize-none py-2`}
              />
            )}
          </Field>
          <section aria-label="Milestones" className="flex flex-col gap-2">
            <h3 className={TYPE.title}>Milestones</h3>
            <p data-part="counts" className={TYPE.meta}>
              <span className={NUM}>
                {counts.milestones}/{MILESTONES_MAX}
              </span>{' '}
              milestones · <span className={NUM}>{counts.tasks}/{TASKS_MAX}</span> tasks · days count from the plan's start
            </p>
            {errors.field.milestones ? (
              <p role="alert" data-error tabIndex={-1} className={`text-[11px] leading-4 text-danger-ink ${FOCUS}`}>
                {errors.field.milestones}
              </p>
            ) : null}
            <TemplateMilestones milestones={draft.milestones} errors={errors.milestones} onChange={(milestones) => change({ milestones })} />
          </section>
          <SharingFields
            sharing={draft.sharing}
            sharedWith={draft.sharedWith}
            teammates={teammates}
            error={errors.field.shared_with ?? errors.field.sharing ?? null}
            onChange={(sharing, sharedWith) => change({ sharing, sharedWith })}
            note={SHARING_NOTE}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** /projects/templates/new over the templates page. */
export function NewTemplateRoute() {
  const navigate = useNavigate();
  const close = () => navigate('/projects/templates');
  return <TemplateForm initial={null} onClose={close} onDone={close} />;
}

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; template: PlanTemplate };

/** /projects/templates/:templateId/edit: yours only; a built-in template or
 *  someone else's reads a notice (spec §1.3). */
export function EditTemplateRoute() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const id = templateId && /^\d+$/.test(templateId) ? Number(templateId) : null;
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ key: string; load: Load } | null>(null);
  const key = `${id}#${attempt}`;
  useEffect(() => {
    if (id === null) return;
    let alive = true;
    fetchTemplate(id).then(
      (template) => {
        if (alive) setLoad({ key, load: { status: 'ready', template } });
      },
      (err: unknown) => {
        if (!alive) return;
        setLoad({ key, load: err instanceof ApiError && err.status === 404 ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this template.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const close = () => navigate('/projects/templates');
  const current: Load = id === null ? { status: 'missing' } : load?.key === key ? load.load : { status: 'loading' };
  if (current.status === 'ready' && current.template.is_owner) return <TemplateForm initial={current.template} onClose={close} onDone={close} />;
  const title = current.status === 'ready' ? `Edit ${current.template.name}` : 'Edit template';
  return (
    <BuilderDialog title={title} onClose={close}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {current.status === 'loading' ? <LoadingState label="Loading the template" variant="block" /> : null}
        {current.status === 'failed' ? <ErrorState message={current.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
        {current.status === 'missing' ? (
          <EmptyState title="Template not found" detail="It may have been deleted, or it isn't shared with you." action={<Link to="/projects/templates" className={BUTTON}>All templates</Link>} />
        ) : null}
        {current.status === 'ready' ? <MadeByLine madeBy={current.template.made_by} /> : null}
        {current.status === 'ready' ? (
          <EmptyState
            title={current.template.is_builtin ? "Built-in templates can't be changed" : `Only ${current.template.owner?.name ?? 'its owner'} can edit this template`}
            detail="Use it to start a plan, then save that plan as a template of your own."
            action={
              <Link to={`/projects/new?template=${current.template.id}`} className={BUTTON}>
                Use
              </Link>
            }
          />
        ) : null}
      </div>
    </BuilderDialog>
  );
}
