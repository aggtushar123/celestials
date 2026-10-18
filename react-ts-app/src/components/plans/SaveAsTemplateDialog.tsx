import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { saveAsTemplate } from '../../features/plans/planApi';
import { NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK, NAME_MAX } from '../../features/plans/planOptions';
import type { PersonRef, Plan, PlanTemplate, Sharing } from '../../features/plans/planTypes';
import { Field } from '../rules/Field';
import { FOCUS, INPUT, INVALID, PRIMARY, QUIET } from '../ui';
import { BuilderDialog } from '../segments/BuilderDialog';
import { SharingFields } from '../segments/SharingFields';
import { SHARING_NOTE } from './styles';
import { ANY_REFUSAL, useRefusalFocus } from './useRefusalFocus';
import { useSubmitOnce } from './useSubmitOnce';

/** Save as template (spec §2.4, Decision 11): a name and sharing; the plan's
 *  milestones and the tasks you can see become a new template of yours. */
export function SaveAsTemplateDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active && member.id !== me).map(({ id, name }) => ({ id, name })), [members, me]);
  const nameId = useId();
  const [name, setName] = useState(plan.name);
  const [sharing, setSharing] = useState<Sharing>('private');
  const [sharedWith, setSharedWith] = useState<PersonRef[]>([]);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const [saved, setSaved] = useState<PlanTemplate | null>(null);
  const { busy, run } = useSubmitOnce();
  const { ref: bodyRef, focusRefusal } = useRefusalFocus<HTMLDivElement>(ANY_REFUSAL);
  const refuse = (found: PlanErrors) => {
    setErrors(found);
    focusRefusal();
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!name.trim()) field.name = CHECK.TEMPLATE_NAME;
    if (sharing === 'people' && sharedWith.length === 0) field.shared_with = CHECK.NO_PEOPLE;
    if (Object.keys(field).length > 0) {
      refuse({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => saveAsTemplate(plan.id, { name: name.trim(), sharing, ...(sharing === 'people' ? { shared_with: sharedWith.map((person) => person.id) } : {}) }));
    if (!outcome) return;
    if (outcome.ok) setSaved(outcome.value);
    else refuse(planErrors(outcome.error, ['name', 'sharing', 'shared_with'], 'Could not save this template.'));
  }

  return (
    <BuilderDialog title="Save as template" onClose={onClose} size="narrow">
      {/* One status region, mounted before the save (sr-only while empty) and kept after it. */}
      <p role="status" className="px-4 pt-4 text-[13px] leading-5 text-ink empty:sr-only">
        {saved ? `Saved as ${saved.name}.` : ''}
      </p>
      {saved ? (
        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to={`/projects/templates/${saved.id}/edit`} className={`${QUIET} border border-line`}>
              Open template
            </Link>
            <button type="button" onClick={onClose} className={PRIMARY}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {errors.form ? (
              <p role="alert" data-error tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
                {errors.form}
              </p>
            ) : null}
            <Field id={nameId} label="Name" error={errors.field.name}>
              {(aria) => (
                <input id={nameId} {...aria} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={`${INPUT} ${INVALID}`} />
              )}
            </Field>
            <SharingFields
              sharing={sharing}
              sharedWith={sharedWith}
              teammates={teammates}
              error={errors.field.shared_with ?? errors.field.sharing ?? null}
              onChange={(nextSharing, nextPeople) => {
                setSharing(nextSharing);
                setSharedWith(nextPeople);
              }}
              note={SHARING_NOTE}
            />
            <p className="text-[11px] text-ink-muted">Its milestones and the tasks you can see are copied, with their days counted from the plan's start.</p>
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
      )}
    </BuilderDialog>
  );
}
