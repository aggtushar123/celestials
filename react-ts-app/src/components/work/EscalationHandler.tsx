import { useEffect, useId, useRef, useState } from 'react';
import { FUNCTION_LABELS, type UserFunction } from '../../features/auth/authSlice';
import { ESCALATION, handlerLines, type HandlerRefusal } from '../../features/agents/escalationText';
import type { Escalation, HandlerBody } from '../../features/agents/bundleTypes';
import { useMembers } from '../../features/knowledge/useMembers';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, FIELD_ERROR, FOCUS, FORM_ALERT, QUIET, Select, TYPE } from '../ui';

const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UserFunction[];

/** Who has an escalation, where that came from, and Change (Slack
 *  escalations D4 frontend Decision 2; spec §5.5): any active member, or
 *  whoever handles a department. The panel saves its other edits first. */
export function EscalationHandler({ escalation, recordName, onChange }: { escalation: Escalation; recordName: string; onChange: (body: HandlerBody) => Promise<HandlerRefusal | null> }) {
  const id = useId();
  const members = useMembers();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState('');
  const [fn, setFn] = useState<UserFunction | ''>('');
  const [refusal, setRefusal] = useState<HandlerRefusal | null>(null);
  const { busy, run } = useSubmitOnce();
  const changeRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const back = useRef(false);
  // Cancel and a saved change put focus back on Change once it is shown
  // again, or on Handled by when the bundle can no longer be changed.
  useEffect(() => {
    if (!open && back.current) {
      back.current = false;
      (changeRef.current ?? labelRef.current)?.focus();
    }
  }, [open]);
  const lines = handlerLines(escalation, recordName);
  // R5: a department Change that found nobody still asks, unless the source line already does.
  const choose = !lines.person && !escalation.handler && !(lines.source ?? '').includes(ESCALATION.CHOOSE);
  const label = (name: string, department: string) => (department ? `${name} · ${department}` : name);
  const people = members.filter((m) => m.is_active).map((m) => ({ value: String(m.id), label: label(m.name, m.function ? (FUNCTION_LABELS[m.function as UserFunction] ?? m.function) : '') }));
  // The current person is always an option, so the select shows them while the members load or after they fail.
  const current = escalation.handler;
  const options = current && !people.some((p) => p.value === String(current.id)) ? [{ value: String(current.id), label: label(current.name, current.function_label) }, ...people] : people;

  const start = () => {
    setPerson(escalation.handler ? String(escalation.handler.id) : '');
    setFn(escalation.function || '');
    setRefusal(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setRefusal(null);
    back.current = true;
  };
  async function save() {
    if (busy) return;
    if (!person && !fn) {
      setRefusal({ field: 'function', message: ESCALATION.CHOOSE_DEPARTMENT, lost: false });
      return;
    }
    // Nothing changed: close without a request.
    const sameDepartment = !person && fn === escalation.function && ['team', 'head', 'nobody'].includes(escalation.via);
    if ((person && person === String(escalation.handler?.id)) || sameDepartment) {
      close();
      return;
    }
    const body: HandlerBody = person ? { user_id: Number(person) } : { user_id: null, function: fn as UserFunction };
    const outcome = await run(() => onChange(body));
    if (!outcome || !outcome.ok) return;
    if (outcome.value) setRefusal(outcome.value);
    else close();
  }

  const fieldError = (field: 'function' | 'user_id') => (refusal?.field === field ? refusal.message : null);
  return (
    <section aria-labelledby={`${id}-label`} className="flex flex-col gap-1">
      <p id={`${id}-label`} ref={labelRef} tabIndex={-1} className={`${TYPE.label} ${FOCUS}`}>
        {ESCALATION.HANDLED_BY}
      </p>
      {lines.source ? <p className={`${TYPE.meta} min-w-0`}>{lines.source}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {lines.person ? <p className={`${TYPE.body} min-w-0 font-semibold`}>{lines.person}</p> : choose ? <p className={`${TYPE.meta} min-w-0`}>{ESCALATION.CHOOSE}</p> : null}
        {escalation.can_change && !open ? (
          <button ref={changeRef} type="button" onClick={start} className={QUIET}>
            {escalation.handler ? ESCALATION.CHANGE : ESCALATION.CHOOSE_BUTTON}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Select
              id={`${id}-person`}
              label={ESCALATION.PERSON}
              value={person}
              onChange={(next) => {
                setPerson(next);
                setRefusal(null);
              }}
              options={[{ value: '', label: ESCALATION.WHOEVER }, ...options]}
              invalid={Boolean(fieldError('user_id'))}
              describedBy={fieldError('user_id') ? `${id}-person-error` : undefined}
            />
            {fieldError('user_id') ? (
              <p id={`${id}-person-error`} role="alert" className={FIELD_ERROR}>
                {fieldError('user_id')}
              </p>
            ) : null}
          </div>
          {person === '' ? (
            <div className="flex flex-col gap-1">
              <Select
                id={`${id}-function`}
                label={ESCALATION.DEPARTMENT}
                value={fn}
                onChange={(next) => {
                  setFn(next as UserFunction);
                  setRefusal(null);
                }}
                options={[...(fn ? [] : [{ value: '', label: ESCALATION.DEPARTMENT }]), ...FUNCTIONS.map((value) => ({ value, label: FUNCTION_LABELS[value] }))]}
                invalid={Boolean(fieldError('function'))}
                describedBy={fieldError('function') ? `${id}-function-error` : undefined}
              />
              {fieldError('function') ? (
                <p id={`${id}-function-error`} role="alert" className={FIELD_ERROR}>
                  {fieldError('function')}
                </p>
              ) : null}
            </div>
          ) : null}
          {refusal && refusal.field === null && refusal.message ? (
            <p role="alert" className={FORM_ALERT}>
              {refusal.message}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {escalation.can_change ? (
              <button type="button" onClick={() => void save()} aria-disabled={busy || undefined} className={BUTTON}>
                {busy ? ESCALATION.SAVING : ESCALATION.SAVE}
              </button>
            ) : null}
            <button type="button" onClick={close} className={QUIET}>
              {ESCALATION.CANCEL}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
