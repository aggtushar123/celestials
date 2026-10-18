import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createCompanyInitiative, fetchMembers, fetchMetricCut, fetchMetricList, startInitiative } from '../../features/brain/brainApi';
import type { DeskMember, DoingInitiative, InitiativePatch, InitiativeWrite, TrackableMetric, WaitingPerson } from '../../features/brain/brainTypes';
import { bookPeople, DO } from '../../features/brain/doingText';
import type { Metric, SliceMember } from '../../features/metrics/metricsSlice';
import { NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, Card, FOCUS, QUIET } from '../ui';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink aria-[invalid=true]:border-danger ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const FIELDS = ['title', 'hypothesis', 'metric', 'dimension', 'member', 'target_value', 'target_by', 'owner_id', 'for_user'] as const;
type FieldKey = (typeof FIELDS)[number];
const CUT_LABEL: Record<string, string> = { owner: 'owner', product: 'product', segment: 'size band', lifecycle: 'lifecycle stage' };
const EMPTY_BASE: Omit<InitiativeWrite, 'metric'> = {
  title: '', hypothesis: '', dimension: '', member: '', target_value: '', target_by: '', owner_id: null,
};

/** Label above, the control, then a hint and the field's refusal below. `id`
 *  is `null` when there is no control to point at (controller item, final
 *  review): a dangling `htmlFor` naming an id nothing wears is worse than a
 *  plain, unassociated label. */
function Labelled({ id, label, hint, error, className = '', children }: {
  id: string | null;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id ?? undefined} className={LABEL}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
      {error && id ? (
        <p id={`${id}-error`} className="text-[11px] text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type InitiativeFormProps = { onSaved: (id: number) => void; onCancel: () => void } & (
  | { mode: 'company' }
  | { mode: 'book'; scope: 'me' | 'team'; reader: WaitingPerson; trackable: TrackableMetric[] }
);

/** New initiative (spec §2.1, Decision 3), the old Initiatives page's form.
 *  Company: any metric, the whole company or one cut, any owner, through
 *  /metrics/initiatives/ (Contract note 8). A book (Me, My team): only the
 *  metrics the page's own `doing/` payload names trackable (controller
 *  override: not a hard-coded list), for the reader or (My team) someone
 *  below them, through /brain/initiatives/ (Contract notes 3, 4, 7). Sent
 *  once. */
export function InitiativeForm(props: InitiativeFormProps) {
  const { onSaved, onCancel } = props;
  const company = props.mode === 'company';
  const team = props.mode === 'book' && props.scope === 'team';
  const reader = props.mode === 'book' ? props.reader : null;
  const trackable = props.mode === 'book' ? props.trackable : [];
  const id = useId();
  const fid = (key: FieldKey) => `${id}-${key}`;
  const [form, setForm] = useState<InitiativeWrite>(() => ({ ...EMPTY_BASE, metric: company ? '' : trackable[0]?.key ?? '' }));
  const [forUser, setForUser] = useState(reader?.id ?? 0);
  const [members, setMembers] = useState<DeskMember[]>([]);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [metricsFailed, setMetricsFailed] = useState(false);
  const [cut, setCut] = useState<{ key: string; members: SliceMember[] } | null>(null);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const titleRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!company && !team) return;
    let alive = true;
    fetchMembers().then(
      (list) => {
        if (alive) setMembers(list);
      },
      () => {
        // Contract note 4: a failed read leaves only the reader (or no owners) to choose.
      },
    );
    return () => {
      alive = false;
    };
  }, [company, team]);

  useEffect(() => {
    if (!company) return;
    let alive = true;
    fetchMetricList().then(
      (payload) => {
        if (!alive) return;
        setMetrics(payload.metrics);
        // The old form's own default: the first metric the registry lists.
        setForm((f) => (f.metric ? f : { ...f, metric: payload.metrics[0]?.key ?? f.metric }));
      },
      () => {
        if (alive) setMetricsFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [company]);

  const cutKey = form.dimension ? `${form.metric}:${form.dimension}` : null;
  useEffect(() => {
    if (!company || !form.dimension) return;
    const key = `${form.metric}:${form.dimension}`;
    let alive = true;
    fetchMetricCut(form.metric, form.dimension).then(
      (slice) => {
        if (alive) setCut({ key, members: slice.members });
      },
      () => {
        if (alive) setCut({ key, members: [] });
      },
    );
    return () => {
      alive = false;
    };
  }, [company, form.metric, form.dimension]);
  const cutMembers = cut && cut.key === cutKey ? cut.members : null;

  // A refusal takes focus: the form's sentence, else the first refused field.
  useEffect(() => {
    if (errors.form) {
      formErrorRef.current?.focus();
      return;
    }
    const first = FIELDS.find((key) => errors.field[key]);
    if (first) document.getElementById(`${id}-${first}`)?.focus();
  }, [errors, id]);

  const set = <K extends keyof InitiativeWrite>(key: K, value: InitiativeWrite[K]) => setForm((f) => ({ ...f, [key]: value }));
  const invalid = (key: FieldKey) => (errors.field[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${fid(key)}-error` } : {});
  const options = company ? (metrics ?? []).map(({ key, label }) => ({ key, label })) : trackable;
  // Controller item (c): nothing to choose on a book yet, so the metric
  // field is a plain line, not an empty select, and Save is disabled.
  const noTrackable = props.mode === 'book' && trackable.length === 0;
  const dimensions = company ? (metrics?.find((m) => m.key === form.metric)?.dimensions ?? []) : [];
  const people = reader ? bookPeople(members, reader) : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors(NO_ERRORS);
    const outcome = await run((): Promise<{ id: number }> =>
      props.mode === 'company'
        ? createCompanyInitiative(form)
        : startInitiative(props.scope, {
            title: form.title,
            hypothesis: form.hypothesis,
            metric: form.metric,
            target_value: form.target_value,
            target_by: form.target_by,
            status: 'active',
            ...(props.scope === 'team' ? { for_user: forUser } : {}),
          }),
    );
    if (!outcome) return;
    if (outcome.ok) onSaved(outcome.value.id);
    else setErrors(planErrors(outcome.error, FIELDS, DO.SAVE_FAILED));
  }

  return (
    <Card>
    <form aria-label={DO.NEW} onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Labelled id={fid('title')} label={DO.FIELD_TITLE} error={errors.field.title} className="md:col-span-2">
          <input id={fid('title')} ref={titleRef} required value={form.title} onChange={(e) => set('title', e.target.value)} className={INPUT} {...invalid('title')} />
        </Labelled>
        <Labelled id={fid('hypothesis')} label={DO.FIELD_HYPOTHESIS} error={errors.field.hypothesis} className="md:col-span-2">
          <textarea
            id={fid('hypothesis')}
            rows={2}
            value={form.hypothesis}
            onChange={(e) => set('hypothesis', e.target.value)}
            className={`${INPUT} py-2`}
            {...invalid('hypothesis')}
          />
        </Labelled>
        <Labelled id={noTrackable ? null : fid('metric')} label={DO.FIELD_METRIC} hint={company || noTrackable ? undefined : DO.OWNER_CUT_HINT} error={errors.field.metric}>
          {noTrackable ? (
            <p className="text-[13px] text-ink-muted">{DO.NO_TRACKABLE}</p>
          ) : (
            <select
              id={fid('metric')}
              value={form.metric}
              onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value, dimension: '', member: '' }))}
              className={INPUT}
              {...invalid('metric')}
            >
              {company && metrics === null ? <option value={form.metric}>{DO.LOADING_CHOICES}</option> : null}
              {options.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </Labelled>
        {company ? (
          <Labelled id={fid('dimension')} label={DO.FIELD_CUT} error={errors.field.dimension}>
            <select
              id={fid('dimension')}
              value={form.dimension}
              onChange={(e) => setForm((f) => ({ ...f, dimension: e.target.value, member: '' }))}
              className={INPUT}
              {...invalid('dimension')}
            >
              <option value="">{DO.WHOLE_COMPANY}</option>
              {dimensions.map((d) => (
                <option key={d} value={d}>
                  {`By ${CUT_LABEL[d] ?? d}`}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
        {company && form.dimension ? (
          <Labelled id={fid('member')} label={`Which ${CUT_LABEL[form.dimension] ?? form.dimension}`} error={errors.field.member}>
            <select id={fid('member')} required value={form.member} onChange={(e) => set('member', e.target.value)} className={INPUT} {...invalid('member')}>
              <option value="">{cutMembers ? DO.CHOOSE : DO.LOADING_CHOICES}</option>
              {(cutMembers ?? []).map((m) => (
                <option key={m.member} value={m.member}>
                  {m.label}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
        {team ? (
          <Labelled id={fid('for_user')} label={DO.FIELD_WHOSE_BOOK} error={errors.field.for_user}>
            <select id={fid('for_user')} value={forUser} onChange={(e) => setForUser(Number(e.target.value))} className={INPUT} {...invalid('for_user')}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
        <Labelled id={fid('target_value')} label={DO.FIELD_TARGET} error={errors.field.target_value}>
          <input
            id={fid('target_value')}
            type="number"
            step="any"
            required
            value={form.target_value}
            onChange={(e) => set('target_value', e.target.value)}
            className={INPUT}
            {...invalid('target_value')}
          />
        </Labelled>
        <Labelled id={fid('target_by')} label={DO.FIELD_TARGET_BY} error={errors.field.target_by}>
          <input id={fid('target_by')} type="date" required value={form.target_by} onChange={(e) => set('target_by', e.target.value)} className={INPUT} {...invalid('target_by')} />
        </Labelled>
        {company ? (
          <Labelled id={fid('owner_id')} label={DO.FIELD_OWNER} error={errors.field.owner_id}>
            <select
              id={fid('owner_id')}
              value={form.owner_id ?? ''}
              onChange={(e) => set('owner_id', e.target.value ? Number(e.target.value) : null)}
              className={INPUT}
              {...invalid('owner_id')}
            >
              <option value="">{DO.NO_OWNER}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
      </div>
      {metricsFailed ? <p className="text-[13px] leading-5 text-danger-ink">{DO.LOAD_METRICS}</p> : null}
      {errors.form ? (
        <p ref={formErrorRef} tabIndex={-1} role="alert" className="text-[13px] leading-5 text-danger-ink outline-none">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || metricsFailed || noTrackable} className={BUTTON}>
          {busy ? DO.SAVING : DO.SAVE_INITIATIVE}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {DO.CANCEL}
        </button>
      </div>
    </form>
    </Card>
  );
}

/** Edit an initiative in its row (plan Decision 6): flat, behind a rule. The
 *  hypothesis is offered only when the server sent one (Contract note 5). */
export function EditInitiativeForm({ initiative, busy, onSave, onCancel }: {
  initiative: DoingInitiative;
  busy: boolean;
  onSave: (patch: InitiativePatch) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initiative.title);
  const [hypothesis, setHypothesis] = useState(initiative.hypothesis ?? '');
  // I1 (final review): a row whose figures the server hides sends no
  // `progress`, so there is nothing to show as "today's" target; offering
  // a required field anyway would force the editor to type a number that
  // then overwrites the real (hidden) target_value.
  const hasTarget = initiative.progress !== null;
  const [target, setTarget] = useState(initiative.progress ? String(initiative.progress.target) : '');
  const [targetBy, setTargetBy] = useState(initiative.target_by);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const hasHypothesis = initiative.hypothesis !== undefined;

  return (
    <form
      aria-label={DO.EDIT_FORM}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ title, target_by: targetBy, ...(hasTarget ? { target_value: target } : {}), ...(hasHypothesis ? { hypothesis } : {}) });
      }}
      className="flex flex-col gap-3 border-t border-line pt-3"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Labelled id={`${id}-title`} label={DO.FIELD_TITLE} className="md:col-span-2">
          <input id={`${id}-title`} ref={first} required value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </Labelled>
        {hasHypothesis ? (
          <Labelled id={`${id}-hypothesis`} label={DO.FIELD_HYPOTHESIS} className="md:col-span-2">
            <textarea id={`${id}-hypothesis`} rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} className={`${INPUT} py-2`} />
          </Labelled>
        ) : null}
        {hasTarget ? (
          <Labelled id={`${id}-target`} label={DO.FIELD_TARGET}>
            <input id={`${id}-target`} type="number" step="any" required value={target} onChange={(e) => setTarget(e.target.value)} className={INPUT} />
          </Labelled>
        ) : null}
        <Labelled id={`${id}-by`} label={DO.FIELD_TARGET_BY}>
          <input id={`${id}-by`} type="date" required value={targetBy} onChange={(e) => setTargetBy(e.target.value)} className={INPUT} />
        </Labelled>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? DO.SAVING : DO.SAVE}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {DO.CANCEL}
        </button>
      </div>
    </form>
  );
}

/** Close an initiative as done or abandoned, with what happened. */
export function CloseInitiativeForm({ as, busy, onClose, onCancel }: {
  as: 'done' | 'abandoned';
  busy: boolean;
  onClose: (outcome: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [outcome, setOutcome] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <form
      aria-label={as === 'done' ? DO.CLOSE_DONE : DO.CLOSE_ABANDONED}
      onSubmit={(event) => {
        event.preventDefault();
        onClose(outcome);
      }}
      className="flex flex-col gap-3 border-t border-line pt-3"
    >
      <Labelled id={`${id}-outcome`} label={DO.WHAT_HAPPENED}>
        <textarea id={`${id}-outcome`} ref={box} rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} className={`${INPUT} py-2`} />
      </Labelled>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? DO.SAVING : as === 'done' ? DO.CLOSE_DONE : DO.CLOSE_ABANDONED}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {DO.CANCEL}
        </button>
      </div>
    </form>
  );
}
