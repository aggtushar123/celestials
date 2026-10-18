import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { createCampaign, fetchAudience, updateCampaign } from '../../features/campaigns/campaignApi';
import { changedFields, checkDraft, emptyDraft, fromCampaign, needsRoles, toWrite, type CampaignDraft } from '../../features/campaigns/campaignDraft';
import { campaignErrors, hasErrors, type CampaignErrors } from '../../features/campaigns/campaignErrors';
import { NAME_MAX, SAY, SHARING_NOTE } from '../../features/campaigns/campaignOptions';
import { campaignPath, segmentKindOf } from '../../features/campaigns/campaignText';
import type { Audience, Campaign } from '../../features/campaigns/campaignTypes';
import { useMembers } from '../../features/knowledge/useMembers';
import type { PersonRef, SegmentKind, Sharing } from '../../features/segments/segmentTypes';
import { DEFAULT_ROLES } from '../../features/surveys/questions';
import { CampaignAudienceFields } from '../../components/campaigns/CampaignAudienceFields';
import { MessageFields } from '../../components/campaigns/MessageFields';
import { PreviewPane } from '../../components/campaigns/PreviewPane';
import { SendButton, SendStep } from '../../components/campaigns/SendStep';
import type { CampaignOutlet } from '../../components/campaigns/useCampaign';
import { useCampaignAudience } from '../../components/campaigns/useCampaignAudience';
import { useSendNow } from '../../components/campaigns/useSendNow';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { INPUT } from '../../components/plans/styles';
import { ANY_REFUSAL, useRefusalFocus } from '../../components/plans/useRefusalFocus';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { Field } from '../../components/rules/Field';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { SharingFields } from '../../components/segments/SharingFields';
import { useMySegments } from '../../components/surveys/useMySegments';

type Busy = 'save' | 'check' | null;

/** Active teammates to share with, the owner left out; someone deactivated
 *  since is dropped once the members load (as Segments and Surveys do). */
function useTeammates(sharedWith: PersonRef[]) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo(() => members.filter((m) => m.is_active && m.id !== me).map((m) => ({ id: m.id, name: m.name })), [members, me]);
  const shared = members.length > 0 ? sharedWith.filter((person) => teammates.some((mate) => mate.id === person.id)) : sharedWith;
  return { teammates, shared };
}

/** The editor (spec §2.2) for a new campaign or one of mine. */
export function CampaignForm({ initial, onClose, onDone }: { initial: Campaign | null; onClose: () => void; onDone: (saved: Campaign, sendId?: number) => void }) {
  const workspace = useAppSelector((state) => state.auth.user?.organisation?.name ?? 'your company');
  const sender = useAppSelector((state) => state.auth.user?.name ?? 'You');
  const nameId = useId();
  const reasonId = useId();
  const [draft, setDraft] = useState<CampaignDraft>(() => (initial ? fromCampaign(initial) : emptyDraft()));
  const [saved, setSaved] = useState<Campaign | null>(initial);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<CampaignErrors>({});
  const [confirm, setConfirm] = useState<Audience | null>(null);
  const [contact, setContact] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const submit = useSubmitOnce();
  const sendNow = useSendNow({ submit, fieldsToForm: true });
  const { ref: bodyRef, focusRefusal } = useRefusalFocus<HTMLDivElement>(ANY_REFUSAL);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const backToSend = useRef(false);
  useEffect(() => {
    if (confirm) {
      confirmRef.current?.focus();
      return;
    }
    if (backToSend.current) {
      backToSend.current = false;
      sendRef.current?.focus();
    }
  }, [confirm]);

  const segments = useMySegments();
  const { teammates, shared } = useTeammates(draft.sharedWith);
  const ready: CampaignDraft = { ...draft, sharedWith: shared };
  const kindOf = (id: number | null): SegmentKind | null =>
    segments.rows?.find((row) => row.id === id)?.kind ?? (initial?.segment && initial.segment.id === id ? segmentKindOf(initial.segment.kind) : null);
  const kind = kindOf(draft.segment);
  // A new campaign waits for my segments: until then a segment's kind is unknown.
  const segmentsLoading = !initial && segments.rows === null;
  const audience = useCampaignAudience(saved?.segment ? saved.id : null, version);
  const stale = saved !== null && (draft.segment !== (saved.segment?.id ?? null) || (needsRoles(kind) && draft.roles.join() !== saved.roles.join()));
  const change = (patch: Partial<CampaignDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const clear = (...keys: (keyof CampaignErrors)[]) =>
    setErrors((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });

  // Why Send now… is off, or null when it can go.
  let reason: string | null = null;
  if (segmentsLoading) reason = 'Loading your segments…';
  else if (saved?.status === 'archived') reason = SAY.ARCHIVED;
  else if (draft.segment === null) reason = 'Choose a segment to send.';
  else if (needsRoles(kind) && draft.roles.length === 0) reason = 'Choose at least one role to send.';

  // Once something was saved, closing counts as done.
  const close = () => (saved && saved !== initial ? onDone(saved) : onClose());

  /** POST the first time, then PATCH only what changed (never a second draft). */
  async function persist(): Promise<Campaign> {
    const body = toWrite(ready, kind);
    if (!saved) {
      const created = await createCampaign(body);
      setSaved(created);
      setVersion((n) => n + 1);
      return created;
    }
    const patch = changedFields(body, saved);
    if (Object.keys(patch).length === 0) return saved;
    const updated = await updateCampaign(saved.id, patch);
    setSaved(updated);
    setVersion((n) => n + 1);
    return updated;
  }

  function refuse(found: CampaignErrors) {
    setErrors(found);
    focusRefusal();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = checkDraft(ready, kind);
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors({});
    setBusy('save');
    const outcome = await submit.run(persist);
    if (!outcome) return;
    setBusy(null);
    if (outcome.ok) onDone(outcome.value);
    else refuse(campaignErrors(outcome.error));
  }

  /** Save, then ask the server once more whom it reaches, then confirm. */
  async function startSend() {
    const found = checkDraft(ready, kind, { forSend: true });
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors({});
    setBusy('check');
    const outcome = await submit.run(async () => fetchAudience((await persist()).id));
    if (!outcome) return;
    setBusy(null);
    if (!outcome.ok) {
      refuse(campaignErrors(outcome.error));
      return;
    }
    sendNow.reset();
    setConfirm(outcome.value);
  }

  async function sendIt() {
    if (!saved) return;
    const answer = await sendNow.send(saved.id);
    if (answer && 'sent' in answer) onDone(saved, answer.sent.id);
    else if (answer) {
      setConfirm(null);
      refuse(answer.fields);
    }
  }

  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New campaign'} onClose={close}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          {confirm ? (
            <SendStep name={draft.name.trim()} audience={confirm} headingRef={confirmRef} />
          ) : (
            <div data-part="builder-columns" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
              <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
                <div className="flex flex-col gap-2 pb-4">
                  <Field id={nameId} label="Name" error={errors.name}>
                    {(aria) => (
                      <input
                        id={nameId}
                        {...aria}
                        value={draft.name}
                        maxLength={NAME_MAX}
                        placeholder="Win-back"
                        onChange={(event) => {
                          change({ name: event.target.value });
                          clear('name');
                        }}
                        className={`${INPUT} ${errors.name ? 'border-danger' : 'border-line'}`}
                      />
                    )}
                  </Field>
                  {initial?.needs_segment ? <p className="text-[13px] text-ink-muted">Its old recipients were picked by hand. Choose a segment to send it.</p> : null}
                </div>
                <div className="py-4">
                  <CampaignAudienceFields
                    segments={segments.rows}
                    segmentsError={segments.error}
                    segmentId={draft.segment}
                    fallback={initial?.segment ?? null}
                    roles={draft.roles}
                    kind={kind}
                    errors={{ segment: errors.segment, roles: errors.roles }}
                    onSegment={(id) => {
                      // A contact segment asks no roles; coming back starts from the defaults.
                      change({ segment: id, ...(kindOf(id) === 'contact' ? { roles: [...DEFAULT_ROLES] } : {}) });
                      clear('segment', 'roles');
                    }}
                    onRoles={(roles) => {
                      change({ roles });
                      clear('roles');
                    }}
                  />
                </div>
                <div className="py-4">
                  <MessageFields
                    subject={draft.subject}
                    body={draft.body}
                    errors={{ subject: errors.subject, body: errors.body }}
                    onSubject={(subject) => {
                      change({ subject });
                      clear('subject');
                    }}
                    onBody={(body) => {
                      change({ body });
                      clear('body');
                    }}
                  />
                </div>
                <div className="pt-4">
                  <SharingFields
                    sharing={draft.sharing}
                    sharedWith={shared}
                    teammates={teammates}
                    error={errors.shared_with ?? errors.sharing ?? null}
                    onChange={(sharing: Sharing, sharedWith: PersonRef[]) => {
                      change({ sharing, sharedWith });
                      clear('sharing', 'shared_with');
                    }}
                    note={SHARING_NOTE}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
                <PreviewPane
                  campaignId={saved?.id ?? null}
                  subject={draft.subject}
                  body={draft.body}
                  audience={audience}
                  contact={contact}
                  onContact={setContact}
                  stale={stale}
                  sender={sender}
                  workspace={workspace}
                />
              </div>
            </div>
          )}
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-start justify-end gap-2 border-t border-line-subtle px-4 py-3">
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => {
                  backToSend.current = true;
                  setConfirm(null);
                }}
                disabled={submit.busy}
                className={QUIET}
              >
                Back
              </button>
              <SendButton busy={sendNow.busy} blocked={confirm.reach === 0} refusal={sendNow.refusal} onSend={() => void sendIt()} />
            </>
          ) : (
            <>
              {reason ? (
                <p id={reasonId} className="basis-full self-center text-[11px] text-ink-muted sm:mr-auto sm:basis-auto">
                  {reason}
                </p>
              ) : null}
              <button type="button" onClick={close} className={QUIET}>
                Cancel
              </button>
              <button type="submit" disabled={submit.busy || segmentsLoading} className={`${QUIET} border border-line`}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button
                ref={sendRef}
                type="button"
                onClick={() => void startSend()}
                disabled={submit.busy || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                className={PRIMARY}
              >
                {busy === 'check' ? 'Checking…' : 'Send now…'}
              </button>
            </>
          )}
        </div>
      </form>
    </BuilderDialog>
  );
}

/** /campaigns/new: the editor over the list. Saving or sending opens the campaign. */
export function NewCampaignRoute() {
  const navigate = useNavigate();
  return <CampaignForm initial={null} onClose={() => navigate('/campaigns')} onDone={(saved, sendId) => navigate(campaignPath(saved.id, sendId))} />;
}

/** /campaigns/:id/edit: the editor over the campaign's page, which has read
 *  it; anyone but the owner reads a notice. */
export function EditCampaignRoute() {
  const navigate = useNavigate();
  const { campaign, onReplace, onSent } = useOutletContext<CampaignOutlet>();
  const close = () => navigate(`/campaigns/${campaign.id}`);
  if (!campaign.is_owner) {
    return (
      <BuilderDialog title={`Edit ${campaign.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${campaign.owner.name} can edit this campaign`}
            detail="Ask them to change it or to send it."
            action={
              <Link to={`/campaigns/${campaign.id}`} className={`${QUIET} border border-line`}>
                Open campaign
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return (
    <CampaignForm
      initial={campaign}
      onClose={close}
      onDone={(saved, sendId) => {
        onReplace(saved);
        if (sendId) onSent(sendId);
        else close();
      }}
    />
  );
}
