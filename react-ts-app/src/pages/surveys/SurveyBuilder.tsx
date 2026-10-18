import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Gauge, Smile, ThumbsUp } from 'lucide-react';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { ApiError } from '../../lib/apiClient';
import type { PersonRef, SegmentKind, Sharing } from '../../features/segments/segmentTypes';
import { DEFAULT_ROLES, INTRO_MAX, LINK_DAYS, NAME_MAX, SUBJECT_MAX, TYPE_HINT, TYPE_LABEL } from '../../features/surveys/questions';
import { createSend, fetchAudience, fetchSend, sendNow, updateSend } from '../../features/surveys/surveyApi';
import { surveyErrors, type SurveyErrors } from '../../features/surveys/surveyErrors';
import { dayLabel, segmentLabel, sendBlocker, sendLabel } from '../../features/surveys/surveyText';
import type { AudienceCounts, ContactRole, SendWrite, SurveySend, SurveyType } from '../../features/surveys/surveyTypes';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { RadioTile } from '../../components/segments/RadioTile';
import { SharingFields } from '../../components/segments/SharingFields';
import { AudienceFields } from '../../components/surveys/AudienceFields';
import { AudienceSummary, ReachLines } from '../../components/surveys/AudienceSummary';
import { SurveyPreview } from '../../components/surveys/SurveyPreview';
import { useAudience } from '../../components/surveys/useAudience';
import { useMySegments } from '../../components/surveys/useMySegments';
import type { SegmentOutlet } from '../segments/Builder';
import type { SendOutlet } from './SendPage';
import { NUM, TYPE } from '../../components/ui';

const TYPES = [
  { value: 'nps', icon: ThumbsUp },
  { value: 'csat', icon: Smile },
  { value: 'ces', icon: Gauge },
] as const satisfies readonly { value: SurveyType; icon: unknown }[];
const INPUT = `min-h-11 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const LABEL = TYPE.label;
const SHARING_NOTE = 'Teammates see the answers only from people they may open, and a count of the rest. Only you can change it or send it.';

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Sharing and its people travel together, so the server checks them
 *  together; nothing when neither changed. */
function sharingPatch(sharing: Sharing, people: number[] | undefined, send: SurveySend): Partial<SendWrite> {
  const before = send.sharing === 'people' ? send.shared_with.map((person) => person.id) : [];
  if (sharing === send.sharing && sameIds(people ?? [], before)) return {};
  return people ? { sharing, shared_with: people } : { sharing };
}

/** A draft's PATCH: only what differs from the copy the server last
 *  returned. Segment and roles travel together. */
function changedFields(body: SendWrite, send: SurveySend): Partial<SendWrite> {
  const patch: Partial<SendWrite> = {};
  if (body.name !== send.name) patch.name = body.name;
  if (body.survey_type !== send.survey_type) patch.survey_type = body.survey_type;
  if (body.subject !== send.subject) patch.subject = body.subject;
  if (body.intro !== send.intro) patch.intro = body.intro;
  if (body.segment !== (send.segment?.id ?? null) || body.roles.join() !== send.roles.join()) {
    patch.segment = body.segment;
    patch.roles = body.roles;
  }
  return { ...patch, ...sharingPatch(body.sharing, body.shared_with, send) };
}

/** Sharing as Segments do it: active teammates only, the owner left out;
 *  someone deactivated since is dropped once the members load. */
function useSharing(send: SurveySend | null) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const [sharing, setSharing] = useState<Sharing>(send?.sharing ?? 'private');
  const [sharedWith, setSharedWith] = useState<PersonRef[]>(send?.shared_with ?? []);
  const teammates = useMemo(() => members.filter((m) => m.is_active && m.id !== me).map((m) => ({ id: m.id, name: m.name })), [members, me]);
  const loaded = members.length > 0;
  const shared = useMemo(() => (loaded ? sharedWith.filter((person) => teammates.some((t) => t.id === person.id)) : sharedWith), [loaded, sharedWith, teammates]);
  const people = sharing === 'people' ? shared.map((person) => person.id) : undefined;
  const onChange = (next: Sharing, chosen: PersonRef[]) => {
    setSharing(next);
    setSharedWith(chosen);
  };
  return { sharing, shared, people, teammates, onChange };
}

function NameField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        Name
      </label>
      <input
        id={id}
        value={value}
        maxLength={NAME_MAX}
        placeholder="Q4 NPS"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${INPUT} ${error ? 'border-danger' : 'border-line'}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ message, alertRef }: { message?: string; alertRef?: RefObject<HTMLParagraphElement | null> }) {
  return message ? (
    <p ref={alertRef} role="alert" tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
      {message}
    </p>
  ) : null;
}

/** The confirm step (plan Decision 2): the count the server gave just now. */
function ConfirmSend({
  name,
  counts,
  kind,
  headingRef,
  blockerId,
}: {
  name: string;
  counts: AudienceCounts;
  kind: SegmentKind | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  blockerId: string;
}) {
  return (
    <section aria-label="Confirm the send" data-part="confirm" className="flex max-w-xl flex-col gap-3">
      <h3 ref={headingRef} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
        Send {name} now?
      </h3>
      <p className="text-[13px] text-ink-muted">
        Each person gets their own link by email. A link works for <span className={NUM}>{LINK_DAYS}</span> days and takes one answer.
      </p>
      <ReachLines counts={counts} kind={kind} blockerId={blockerId} />
      {sendBlocker(counts) ? null : <p className="text-[13px] text-ink-muted">Once it is sent, only its name and sharing can change.</p>}
    </section>
  );
}

/** The builder (spec §2.2) for a new survey or a draft. */
function SurveyForm({
  initial,
  segmentId: firstSegment,
  onClose,
  onDone,
}: {
  initial: SurveySend | null;
  segmentId: number | null;
  onClose: () => void;
  onDone: (send: SurveySend) => void;
}) {
  const navigate = useNavigate();
  const workspace = useAppSelector((state) => state.auth.user?.organisation?.name ?? 'your company');
  const typeName = useId();
  const subjectId = useId();
  const introId = useId();
  const reasonId = useId();
  const blockerId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<SurveyType>(initial?.survey_type ?? 'nps');
  const [subject, setSubject] = useState(initial?.subject ?? `A quick question from ${workspace}`);
  const [intro, setIntro] = useState(initial?.intro ?? '');
  const [segmentId, setSegmentId] = useState<number | null>(initial ? (initial.segment?.id ?? null) : firstSegment);
  const [roles, setRoles] = useState<ContactRole[]>(initial && initial.roles.length > 0 ? initial.roles : DEFAULT_ROLES);
  const sharing = useSharing(initial);
  const segments = useMySegments();
  const [saved, setSaved] = useState<SurveySend | null>(initial);
  const [errors, setErrors] = useState<SurveyErrors>({});
  const [busy, setBusy] = useState<'draft' | 'confirm' | 'send' | null>(null);
  const [confirm, setConfirm] = useState<AudienceCounts | null>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  // Where focus goes when the confirm closes: the Send button after Back,
  // the first field in error (or the form's alert) after a refusal.
  const refocus = useRef<'send' | 'refusal' | null>(null);
  useEffect(() => {
    if (confirm) {
      confirmRef.current?.focus();
      return;
    }
    const target = refocus.current;
    refocus.current = null;
    if (target === 'send') sendRef.current?.focus();
    if (target === 'refusal') (bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? alertRef.current)?.focus();
  }, [confirm]);

  // A new survey waits for my segments: until then a segment's kind is
  // unknown, and a save would carry no roles.
  const segmentsLoading = !initial && segments.rows === null;
  // Once Send… has saved the survey, closing counts as done: a new one
  // opens its draft's page, an edited one updates the page under it.
  const close = () => (saved && saved !== initial ? onDone(saved) : onClose());

  const kindOf = (id: number | null): SegmentKind | null =>
    segments.rows?.find((row) => row.id === id)?.kind ?? (initial?.segment && initial.segment.id === id ? initial.segment.kind : null);
  const kind = kindOf(segmentId);
  const needsRoles = kind === 'customer' || kind === 'account';
  const request = useMemo(
    () => (segmentId !== null && kind !== null && (!needsRoles || roles.length > 0) ? { segment: segmentId, roles: needsRoles ? roles : [] } : null),
    [segmentId, kind, needsRoles, roles],
  );
  const audience = useAudience(request);
  const counted = audience.status === 'ready' ? audience.data : null;

  // Why Send is off (plan Decision 14), or null when it can go.
  let reason: string | null;
  if (segmentsLoading) reason = 'Loading your segments…';
  else if (segmentId === null) reason = 'Choose a segment to send.';
  else if (needsRoles && roles.length === 0) reason = 'Choose at least one role to send.';
  else if (audience.status === 'error') reason = audience.message;
  else if (!counted) reason = 'Counting who it reaches…';
  else reason = sendBlocker(counted);

  const body = (): SendWrite => ({
    name: name.trim(),
    survey_type: type,
    subject: subject.trim(),
    intro: intro.trim(),
    segment: segmentId,
    roles: needsRoles ? roles : [],
    sharing: sharing.sharing,
    ...(sharing.people ? { shared_with: sharing.people } : {}),
  });

  function check(forSend: boolean): SurveyErrors {
    const found: SurveyErrors = {};
    if (!name.trim()) found.name = 'Give the survey a name.';
    if (!subject.trim()) found.subject = 'Write a subject line.';
    if (forSend && segmentId === null) found.segment = 'Choose a segment.';
    if (segmentId !== null && needsRoles && roles.length === 0) found.roles = 'Choose at least one role.';
    if (sharing.sharing === 'people' && sharing.shared.length === 0) found.shared_with = 'Choose at least one teammate.';
    return found;
  }

  /** POST the first time, then PATCH only what changed (never a second draft). */
  async function persist(): Promise<SurveySend> {
    const next = body();
    if (!saved) {
      const created = await createSend(next);
      setSaved(created);
      return created;
    }
    const patch = changedFields(next, saved);
    if (Object.keys(patch).length === 0) return saved;
    const updated = await updateSend(saved.id, patch);
    setSaved(updated);
    return updated;
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    const found = check(false);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy('draft');
    try {
      onDone(await persist());
    } catch (err) {
      setErrors(surveyErrors(err));
      setBusy(null);
    }
  }

  /** Save, then ask the server once more who it reaches, then confirm. */
  async function startSend() {
    const found = check(true);
    setErrors(found);
    if (Object.keys(found).length > 0 || segmentId === null) return;
    setBusy('confirm');
    try {
      const draft = await persist();
      setConfirm(await fetchAudience({ segment: segmentId, roles: draft.roles }));
    } catch (err) {
      setErrors(surveyErrors(err));
    }
    setBusy(null);
  }

  async function sendIt() {
    if (!saved) return;
    setBusy('send');
    try {
      onDone(await sendNow(saved.id));
    } catch (err) {
      // 409: it is being sent or was sent already; its page says which.
      if (err instanceof ApiError && err.status === 409) {
        try {
          onDone(await fetchSend(saved.id));
        } catch {
          navigate(`/surveys/${saved.id}`);
        }
        return;
      }
      const found = surveyErrors(err, 'Could not send this survey. Try again.');
      // A form-level 400 (email isn't set up for the workspace) stays on the
      // confirm, over the saved draft; anything else goes back to the form.
      const stay = err instanceof ApiError && err.status === 400 && Object.keys(found).every((key) => key === 'form');
      if (!stay) {
        refocus.current = 'refusal';
        setConfirm(null);
      }
      setErrors(found);
      setBusy(null);
    }
  }

  const introDescribedBy = [`${introId}-count`, errors.intro ? `${introId}-error` : null].filter(Boolean).join(' ');
  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New survey'} onClose={close}>
      <form onSubmit={(event) => void saveDraft(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <FormError message={errors.form} alertRef={alertRef} />
          {confirm ? (
            <ConfirmSend name={name.trim()} counts={confirm} kind={kind} headingRef={confirmRef} blockerId={blockerId} />
          ) : (
            <div data-part="builder-columns" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
                <section aria-label="Question" className="flex flex-col gap-4 pb-4">
                  <NameField value={name} onChange={setName} error={errors.name} />
                  <fieldset aria-describedby={`${typeName}-hint`} className="flex flex-col gap-2">
                    <legend className={`${LABEL} mb-2`}>Type</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {TYPES.map((option) => (
                        <RadioTile
                          key={option.value}
                          name={typeName}
                          label={TYPE_LABEL[option.value]}
                          icon={option.icon}
                          checked={type === option.value}
                          onChange={() => setType(option.value)}
                        />
                      ))}
                    </div>
                    <p id={`${typeName}-hint`} className="text-[11px] text-ink-muted">
                      {TYPE_HINT[type]}
                    </p>
                    {errors.survey_type ? (
                      <p role="alert" className="text-[11px] text-danger">
                        {errors.survey_type}
                      </p>
                    ) : null}
                  </fieldset>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={subjectId} className={LABEL}>
                      Email subject
                    </label>
                    <input
                      id={subjectId}
                      value={subject}
                      maxLength={SUBJECT_MAX}
                      onChange={(event) => setSubject(event.target.value)}
                      aria-invalid={Boolean(errors.subject)}
                      aria-describedby={errors.subject ? `${subjectId}-error` : undefined}
                      className={`${INPUT} ${errors.subject ? 'border-danger' : 'border-line'}`}
                    />
                    {errors.subject ? (
                      <p id={`${subjectId}-error`} role="alert" className="text-[11px] text-danger">
                        {errors.subject}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={introId} className={LABEL}>
                      Intro line <span className="font-normal normal-case tracking-normal">(optional)</span>
                    </label>
                    <textarea
                      id={introId}
                      rows={2}
                      value={intro}
                      maxLength={INTRO_MAX}
                      placeholder="A line above the question, in your own words"
                      onChange={(event) => setIntro(event.target.value)}
                      aria-invalid={Boolean(errors.intro)}
                      aria-describedby={introDescribedBy}
                      className={`${INPUT} resize-none py-2.5 ${errors.intro ? 'border-danger' : 'border-line'}`}
                    />
                    <p id={`${introId}-count`} className="text-right text-[11px] text-ink-muted">
                      <span className={NUM}>{intro.length}</span> of <span className={NUM}>{INTRO_MAX}</span>
                    </p>
                    {errors.intro ? (
                      <p id={`${introId}-error`} role="alert" className="text-[11px] text-danger">
                        {errors.intro}
                      </p>
                    ) : null}
                  </div>
                </section>
                <div className="py-4">
                  <AudienceFields
                    segments={segments.rows}
                    segmentsError={segments.error}
                    segmentId={segmentId}
                    fallback={initial?.segment ?? null}
                    roles={roles}
                    kind={kind}
                    errors={{ segment: errors.segment, roles: errors.roles }}
                    onSegment={(id) => {
                      setSegmentId(id);
                      // A contact segment asks no roles (the server clears
                      // them too); coming back starts from the defaults.
                      if (kindOf(id) === 'contact') setRoles(DEFAULT_ROLES);
                      setErrors((current) => ({ ...current, segment: undefined, roles: undefined }));
                    }}
                    onRoles={(next) => {
                      setRoles(next);
                      setErrors((current) => ({ ...current, roles: undefined }));
                    }}
                  />
                </div>
                <div className="pt-4">
                  <SharingFields
                    sharing={sharing.sharing}
                    sharedWith={sharing.shared}
                    teammates={sharing.teammates}
                    error={errors.shared_with ?? errors.sharing ?? null}
                    onChange={sharing.onChange}
                    note={SHARING_NOTE}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
                <SurveyPreview type={type} subject={subject} intro={intro} workspace={workspace} />
                <AudienceSummary state={audience} kind={kind} />
              </div>
            </div>
          )}
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => {
                  refocus.current = 'send';
                  setConfirm(null);
                }}
                disabled={busy === 'send'}
                className={QUIET}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void sendIt()}
                disabled={busy === 'send' || sendBlocker(confirm) !== null}
                aria-describedby={sendBlocker(confirm) ? blockerId : undefined}
                className={PRIMARY}
              >
                {busy === 'send' ? 'Sending…' : 'Send now'}
              </button>
            </>
          ) : (
            <>
              {reason ? (
                <p id={reasonId} className="basis-full text-[11px] text-ink-muted sm:mr-auto sm:basis-auto">
                  {reason}
                </p>
              ) : null}
              <button type="button" onClick={close} className={QUIET}>
                Cancel
              </button>
              <button type="submit" disabled={busy !== null || segmentsLoading} className={`${QUIET} border border-line`}>
                {busy === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                ref={sendRef}
                type="button"
                onClick={() => void startSend()}
                disabled={busy !== null || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                className={PRIMARY}
              >
                {busy === 'confirm' ? 'Checking…' : counted ? sendLabel(counted.audience) : 'Send…'}
              </button>
            </>
          )}
        </div>
      </form>
    </BuilderDialog>
  );
}

/** After the send: only the name and sharing (backend Decision 16). */
function RenameForm({ initial, onClose, onSaved }: { initial: SurveySend; onClose: () => void; onSaved: (send: SurveySend) => void }) {
  const [name, setName] = useState(initial.name);
  const sharing = useSharing(initial);
  const [errors, setErrors] = useState<SurveyErrors>({});
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const found: SurveyErrors = {};
    if (!name.trim()) found.name = 'Give the survey a name.';
    if (sharing.sharing === 'people' && sharing.shared.length === 0) found.shared_with = 'Choose at least one teammate.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const patch: Partial<SendWrite> = { ...(name.trim() !== initial.name ? { name: name.trim() } : {}), ...sharingPatch(sharing.sharing, sharing.people, initial) };
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      onSaved(await updateSend(initial.id, patch));
    } catch (err) {
      setErrors(surveyErrors(err));
      setSaving(false);
    }
  }

  const when = initial.sent_at ? `sent ${dayLabel(initial.sent_at)}` : 'being sent';
  return (
    <BuilderDialog title={`Edit ${initial.name}`} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <FormError message={errors.form} />
          <NameField value={name} onChange={setName} error={errors.name} />
          <p data-part="locked" className="text-[13px] text-ink-muted">
            {TYPE_LABEL[initial.survey_type]} to {segmentLabel(initial.segment)}, {when}. A sent survey can only be renamed or re-shared.
          </p>
          <SharingFields
            sharing={sharing.sharing}
            sharedWith={sharing.shared}
            teammates={sharing.teammates}
            error={errors.shared_with ?? errors.sharing ?? null}
            onChange={sharing.onChange}
            note={SHARING_NOTE}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** A new survey over whatever page opened it (the Sends list, or a
 *  segment's Survey these with `segmentId`). Saving or sending opens it. */
export function NewSurveyModal({ segmentId = null, onClose }: { segmentId?: number | null; onClose: () => void }) {
  const navigate = useNavigate();
  return <SurveyForm initial={null} segmentId={segmentId} onClose={onClose} onDone={(saved) => navigate(`/surveys/${saved.id}`)} />;
}

/** /surveys/new: the modal over the Sends list (spec §2.1). */
export function NewSurveyRoute() {
  const navigate = useNavigate();
  return <NewSurveyModal onClose={() => navigate('/surveys')} />;
}

/** /surveys/:id/edit: the modal over the send's own page, which has read
 *  the send. A draft opens whole; a sent survey only its name and sharing;
 *  anyone but the owner reads a notice. */
export function EditSurveyRoute() {
  const navigate = useNavigate();
  const { send, onReplace } = useOutletContext<SendOutlet>();
  const close = () => navigate(`/surveys/${send.id}`);
  const done = (saved: SurveySend) => {
    onReplace(saved);
    close();
  };
  if (!send.is_owner) {
    return (
      <BuilderDialog title={`Edit ${send.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${send.owner.name} can edit this survey`}
            detail="Ask them to rename it or change who it is shared with."
            action={
              <Link to={`/surveys/${send.id}`} className={`${QUIET} border border-line`}>
                Open survey
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  if (send.status !== 'draft') return <RenameForm initial={send} onClose={close} onSaved={done} />;
  return <SurveyForm initial={send} segmentId={send.segment?.id ?? null} onClose={close} onDone={done} />;
}

/** /segments/:id/survey (spec §2.5, plan Decision 1): Survey these, the
 *  New survey modal over the segment's page with that segment chosen. The
 *  owner's only, as a survey goes to the sender's own segment. */
export function SurveySegmentRoute() {
  const navigate = useNavigate();
  const { segment } = useOutletContext<SegmentOutlet>();
  const close = () => navigate(`/segments/${segment.id}`);
  if (!segment.is_owner) {
    return (
      <BuilderDialog title="New survey" onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${segment.owner.name} can survey this segment`}
            detail="A survey goes to the sender's own segment. Duplicate it to survey your own copy."
            action={
              <Link to={`/segments/${segment.id}`} className={`${QUIET} border border-line`}>
                Open segment
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return <NewSurveyModal segmentId={segment.id} onClose={close} />;
}
