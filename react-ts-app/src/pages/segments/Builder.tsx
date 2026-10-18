import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, Contact } from 'lucide-react';
import { useAppSelector } from '../../hooks';
import { UnsavedChangesDialog } from '../../hooks/UnsavedChangesDialog';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { useMembers } from '../../features/knowledge/useMembers';
import { rulesFromList, type ListRules } from '../../features/segments/fromListFilters';
import { firstIncomplete, fromRules, toRules, type DraftRules } from '../../features/segments/ruleDraft';
import { createSegment, duplicateSegment, fetchRecordNames, updateSegment } from '../../features/segments/segmentApi';
import { formErrors, type FormErrors } from '../../features/segments/segmentErrors';
import { fieldsFor, KIND_LABEL, KIND_NOUN } from '../../features/segments/segmentFields';
import {
  NO_LABELS,
  type PersonRef,
  type PreviewRequest,
  type RuleLabels,
  type Segment,
  type SegmentKind,
  type SegmentWrite,
  type Sharing,
} from '../../features/segments/segmentTypes';
import { BUTTON, EmptyState, INPUT, INVALID, NUM, PRIMARY, QUIET, Switch, TYPE } from '../../components/ui';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { PreviewPanel } from '../../components/segments/PreviewPanel';
import { RadioTile } from '../../components/segments/RadioTile';
import { RuleEditor } from '../../components/segments/RuleEditor';
import { SharingFields } from '../../components/segments/SharingFields';
import { useAttributes, useProducts } from '../../components/segments/useBuilderOptions';
import { usePreview } from '../../components/segments/usePreview';
import type { ValueOptions } from '../../components/segments/ValueInput';

const KINDS = [
  { value: 'customer', icon: Building2 },
  { value: 'account', icon: Briefcase },
  { value: 'contact', icon: Contact },
] as const satisfies readonly { value: SegmentKind; icon: unknown }[];
const CHURNED_NOTE = 'Churned and archived organisations are left out unless a rule names them.';
const NO_IDS: ListRules['ids'] = { customer: [], account: [] };

interface Initial {
  segment: Segment | null;
  kind: SegmentKind;
  draft: DraftRules;
  /** What a list's Save as segment could not carry over. */
  notes: string[];
  labels: RuleLabels;
  /** Organisation and account ids to name (Save as segment). */
  nameIds: ListRules['ids'];
}

/** /segments/new: `?kind=` and, from a list's Save as segment, that list's
 *  own filters (plan Decision 5). */
function fromList(search: URLSearchParams): Initial {
  const raw = search.get('kind');
  const kind: SegmentKind = raw === 'account' || raw === 'contact' ? raw : 'customer';
  const list = raw ? rulesFromList(kind, search) : null;
  return { segment: null, kind, draft: fromRules(list?.rules), notes: list?.notes ?? [], labels: NO_LABELS, nameIds: list?.ids ?? NO_IDS };
}

type WriteBody = Omit<SegmentWrite, 'kind'>;

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** A comparable fingerprint of everything a person can change in the form,
 *  so "dirty" is "differs from the last loaded or saved copy" rather than
 *  "has ever been touched" (clicking a field and clicking back out is not
 *  a change). `sharedWith` is sorted so re-picking the same teammates in a
 *  different order does not count as dirty either. */
function builderSnapshot(values: {
  name: string;
  description: string;
  kind: SegmentKind;
  rules: ReturnType<typeof toRules>;
  sharing: Sharing;
  sharedWith: number[];
  alertOn: boolean;
}): string {
  return JSON.stringify({ ...values, sharedWith: [...values.sharedWith].sort((a, b) => a - b) });
}

/** The PATCH body (ruling G14): only the fields that differ from the segment
 *  as loaded. A rename never resends `rules`, because a rule naming a record
 *  the owner can no longer open reads `null` and would be saved as `null`.
 *  Sharing goes with its people, so the server checks them together. */
function changedFields(body: WriteBody, initial: Initial): Partial<WriteBody> {
  const segment = initial.segment;
  if (!segment) return body;
  const patch: Partial<WriteBody> = {};
  if (body.name !== segment.name) patch.name = body.name;
  if (body.description !== segment.description) patch.description = body.description;
  if (JSON.stringify(body.rules) !== JSON.stringify(toRules(initial.draft))) patch.rules = body.rules;
  const people = segment.sharing === 'people' ? segment.shared_with.map((person) => person.id) : [];
  if (body.sharing !== segment.sharing || !sameIds(body.shared_with ?? [], people)) {
    patch.sharing = body.sharing;
    if (body.shared_with) patch.shared_with = body.shared_with;
  }
  if (body.alert_on_changes !== segment.alert_on_changes) patch.alert_on_changes = body.alert_on_changes;
  return patch;
}

function fromSegment(segment: Segment): Initial {
  return { segment, kind: segment.kind, draft: fromRules(segment.rules), notes: [], labels: segment.labels, nameIds: NO_IDS };
}

/** What the segment page hands its `edit` child route: the segment it has
 *  already loaded, and how to swap in the saved copy. */
export interface SegmentOutlet {
  segment: Segment;
  onReplace: (segment: Segment) => void;
}

/** A new segment in the builder modal, over whatever page opened it: the
 *  Segments list, or a list's Save as segment with that list's filters as
 *  `search` (`?kind=` and the list's own query). Saving opens the segment. */
export function NewSegmentModal({ search, onClose }: { search: URLSearchParams; onClose: () => void }) {
  const navigate = useNavigate();
  const [initial] = useState(() => fromList(search));
  return <BuilderForm initial={initial} onClose={onClose} onSaved={(saved) => navigate(`/segments/${saved.id}`)} />;
}

/** /segments/new: the modal over the Segments list (spec §3). */
export function NewSegmentRoute() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return <NewSegmentModal search={search} onClose={() => navigate('/segments')} />;
}

/** /segments/:id/edit: the modal over the segment's own page, which has
 *  already read the segment (and says when it is missing). Only its owner
 *  edits it; anyone else is offered a copy. */
export function EditSegmentRoute() {
  const navigate = useNavigate();
  const { segment, onReplace } = useOutletContext<SegmentOutlet>();
  const [initial] = useState(() => (segment.is_owner ? fromSegment(segment) : null));
  const close = () => navigate(`/segments/${segment.id}`);
  if (!initial) {
    return (
      <BuilderDialog title={`Edit ${segment.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ReadOnly segment={segment} />
        </div>
      </BuilderDialog>
    );
  }
  return (
    <BuilderForm
      initial={initial}
      onClose={close}
      onSaved={(saved) => {
        onReplace(saved);
        close();
      }}
    />
  );
}

/** Someone else's segment (plan Decision 4): only its owner edits it. */
function ReadOnly({ segment }: { segment: Segment }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicate = async () => {
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateSegment(segment.id);
      navigate(`/segments/${copy.id}/edit`);
    } catch (err) {
      setError(errorMessage(err, 'Could not duplicate this segment.'));
      setBusy(false);
    }
  };
  return (
    <EmptyState
      title={`Only ${segment.owner.name} can edit this segment`}
      detail="Duplicate it to make your own copy, then edit that."
      action={
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <Link to={`/segments/${segment.id}`} className={BUTTON}>
              Open segment
            </Link>
            <button type="button" onClick={() => void duplicate()} disabled={busy} className={PRIMARY}>
              {busy ? 'Duplicating…' : 'Duplicate to edit'}
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-[13px] leading-5 text-danger-ink">
              {error}
            </p>
          ) : null}
        </div>
      }
    />
  );
}

// Exported only so its own test can pin the dirty baseline resetting after
// a successful save: every real caller's `onSaved` navigates away and
// unmounts this, so that path is otherwise unreachable from the outside.
export function BuilderForm({ initial, onClose, onSaved }: { initial: Initial; onClose: () => void; onSaved: (segment: Segment) => void }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const attributes = useAttributes();
  const products = useProducts();
  const editing = initial.segment;
  const nameId = useId();
  const descriptionId = useId();
  const kindName = useId();
  const alertId = useId();

  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [kind, setKind] = useState<SegmentKind>(initial.kind);
  const [draft, setDraft] = useState<DraftRules>(initial.draft);
  const [sharing, setSharing] = useState<Sharing>(editing?.sharing ?? 'private');
  const [sharedWith, setSharedWith] = useState<PersonRef[]>(editing?.shared_with ?? []);
  const [alertOn, setAlertOn] = useState(editing?.alert_on_changes ?? false);
  const [labels, setLabels] = useState<RuleLabels>(initial.labels);
  const [errors, setErrors] = useState<FormErrors>({});
  const [invalidUid, setInvalidUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The last loaded (or saved) copy's fingerprint. A fresh builder, even
  // one pre-filled from a list's Save as segment, starts clean: nothing
  // the person typed yet. Lazy-initialised so it is captured once, at
  // mount, and updated again only after a successful save.
  const [baseline, setBaseline] = useState(() =>
    builderSnapshot({
      name: editing?.name ?? '',
      description: editing?.description ?? '',
      kind: initial.kind,
      rules: toRules(initial.draft),
      sharing: editing?.sharing ?? 'private',
      sharedWith: (editing?.shared_with ?? []).map((person) => person.id),
      alertOn: editing?.alert_on_changes ?? false,
    }),
  );
  const snapshot = builderSnapshot({
    name,
    description,
    kind,
    rules: toRules(draft),
    sharing,
    sharedWith: sharedWith.map((person) => person.id),
    alertOn,
  });
  const dirty = snapshot !== baseline;
  const guard = useUnsavedGuard(dirty);
  const [confirmingClose, setConfirmingClose] = useState(false);
  // X, Cancel and Escape all funnel through here (BuilderDialog's own
  // close button and its Escape handler both call the `onClose` it is
  // given), asking once, the same way, however the person tries to leave.
  const requestClose = () => {
    if (dirty) setConfirmingClose(true);
    else onClose();
  };

  // Save as segment: name the organisations and accounts the list named.
  // An id that does not come back stays "an organisation you can't open".
  const nameIds = JSON.stringify(initial.nameIds);
  useEffect(() => {
    const ids = JSON.parse(nameIds) as ListRules['ids'];
    if (ids.customer.length === 0 && ids.account.length === 0) return;
    let alive = true;
    Promise.all([fetchRecordNames('customer', ids.customer), fetchRecordNames('account', ids.account)]).then(
      ([organisations, accounts]) => {
        if (!alive) return;
        setLabels((current) => ({
          ...current,
          organisations: { ...current.organisations, ...organisations },
          accounts: { ...current.accounts, ...accounts },
        }));
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [nameIds]);

  const fields = useMemo(() => fieldsFor(kind, attributes), [kind, attributes]);
  const fieldOf = useCallback((key: string) => fields.find((field) => field.key === key) ?? null, [fields]);
  const people = useMemo(() => members.filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name })), [members]);
  const teammates = useMemo(() => people.filter((person) => person.id !== me), [people, me]);
  // Someone deactivated since the segment was shared can't be saved again
  // (the server takes active teammates only): drop them once the members
  // have loaded, and say how many went.
  const loaded = members.length > 0;
  const shared = useMemo(
    () => (loaded ? sharedWith.filter((person) => teammates.some((teammate) => teammate.id === person.id)) : sharedWith),
    [loaded, sharedWith, teammates],
  );
  const removed = loaded && editing ? editing.shared_with.filter((person) => !teammates.some((teammate) => teammate.id === person.id)).length : 0;
  const complete = firstIncomplete(draft, fieldOf) === null;
  const request = useMemo<PreviewRequest | null>(
    () => (complete ? { kind, rules: toRules(draft), pinned_ids: editing?.pinned_ids ?? [], excluded_ids: editing?.excluded_ids ?? [] } : null),
    [complete, kind, draft, editing],
  );
  const preview = usePreview(request);
  const options = useMemo<ValueOptions>(
    () => ({
      people,
      products,
      labels,
      onNamed: (group, id, picked) => setLabels((current) => ({ ...current, [group]: { ...current[group], [String(id)]: picked } })),
    }),
    [people, products, labels],
  );
  const rulesError = errors.rules ?? (preview.status === 'error' ? preview.message : null);

  const changeKind = (next: SegmentKind) => {
    setKind(next);
    setDraft(fromRules(null));
    setInvalidUid(null);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    const body = {
      name: name.trim(),
      description: description.trim(),
      rules: toRules(draft),
      sharing,
      ...(sharing === 'people' ? { shared_with: shared.map((person) => person.id) } : {}),
      alert_on_changes: alertOn,
    };
    const patch = editing ? changedFields(body, initial) : null;
    // Unchanged saved rules are not sent, so they are not re-checked either
    // (an AI attribute's field may not have loaded yet).
    const unfinished = !patch || 'rules' in patch ? firstIncomplete(draft, fieldOf) : null;
    const found: FormErrors = {};
    if (!body.name) found.name = 'Give the segment a name.';
    if (unfinished) found.rules = 'Finish each condition, or remove it.';
    if (sharing === 'people' && shared.length === 0) found.shared_with = 'Choose at least one teammate.';
    setInvalidUid(unfinished);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (editing && patch && Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      // PATCH sends only what changed (ruling G14), never `kind`.
      const saved = editing && patch ? await updateSegment(editing.id, patch) : await createSegment({ ...body, kind });
      setBaseline(snapshot);
      onSaved(saved);
    } catch (err) {
      setErrors(formErrors(err));
      setSaving(false);
    }
  }

  return (
    <BuilderDialog title={editing ? `Edit ${editing.name}` : 'New segment'} onClose={requestClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p role="alert" className="text-[13px] leading-5 text-danger-ink">
              {errors.form}
            </p>
          ) : null}
          {initial.notes.length > 0 ? (
            <ul aria-label="From the list" className={`flex flex-col gap-1 border-l-2 border-line pl-3 ${TYPE.bodyMuted}`}>
              {initial.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          <div data-part="rules-and-preview" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
              <section aria-label="Basics" className="flex flex-col gap-4 pb-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={nameId} className={TYPE.label}>
                    Name
                  </label>
                  <input
                    id={nameId}
                    value={name}
                    maxLength={120}
                    placeholder="Untitled segment"
                    onChange={(event) => setName(event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? `${nameId}-error` : undefined}
                    className={`${INPUT} ${INVALID}`}
                  />
                  {errors.name ? (
                    <p id={`${nameId}-error`} role="alert" className="text-[11px] leading-4 text-danger-ink">
                      {errors.name}
                    </p>
                  ) : null}
                  <label htmlFor={descriptionId} className={`${TYPE.label} mt-2`}>
                    Description <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea
                    id={descriptionId}
                    rows={1}
                    value={description}
                    placeholder="What this segment is for"
                    onChange={(event) => setDescription(event.target.value)}
                    aria-invalid={Boolean(errors.description)}
                    aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
                    className={`${INPUT} ${INVALID} min-h-20 resize-none py-2`}
                  />
                  {errors.description ? (
                    <p id={`${descriptionId}-error`} role="alert" className="text-[11px] leading-4 text-danger-ink">
                      {errors.description}
                    </p>
                  ) : null}
                </div>
                {editing ? (
                  <div className="flex flex-col gap-1.5">
                    <p className={TYPE.label}>Kind</p>
                    <p className={TYPE.body}>
                      <span className="font-semibold">{KIND_LABEL[kind]}</span> <span className="text-ink-muted">· A segment's kind can't change.</span>
                    </p>
                  </div>
                ) : (
                  <fieldset aria-describedby={errors.kind ? `${kindName}-error` : undefined} className="flex flex-col gap-2">
                    <legend className={`${TYPE.label} mb-1`}>Kind</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {KINDS.map((option) => (
                        <RadioTile
                          key={option.value}
                          name={kindName}
                          label={KIND_LABEL[option.value]}
                          icon={option.icon}
                          checked={kind === option.value}
                          onChange={() => changeKind(option.value)}
                        />
                      ))}
                    </div>
                    {errors.kind ? (
                      <p id={`${kindName}-error`} role="alert" className="text-[11px] leading-4 text-danger-ink">
                        {errors.kind}
                      </p>
                    ) : null}
                  </fieldset>
                )}
              </section>

              <RuleEditor
                draft={draft}
                fields={fields}
                options={options}
                invalidUid={invalidUid}
                error={rulesError}
                noun={KIND_NOUN[kind].many}
                // Ruling G25: the compiler's default, which the rows can't show.
                note={kind === 'customer' ? CHURNED_NOTE : null}
                onChange={(next) => {
                  setDraft(next);
                  setInvalidUid(null);
                  // A save's rules error (errors.rules) would otherwise hide the
                  // live preview's own message (rulesError's `??`) forever.
                  setErrors((current) => (current.rules ? { ...current, rules: undefined } : current));
                }}
              />

              <section aria-label="Sharing and alerts" className="flex flex-col gap-4 pt-4">
                {removed > 0 ? (
                  <p className={TYPE.meta}>
                    <span className={NUM}>{removed}</span> {removed === 1 ? 'person' : 'people'} no longer in your workspace {removed === 1 ? 'was' : 'were'} removed.
                  </p>
                ) : null}
                <SharingFields
                  sharing={sharing}
                  sharedWith={shared}
                  teammates={teammates}
                  error={errors.shared_with ?? errors.sharing ?? null}
                  onChange={(nextSharing, nextPeople) => {
                    setSharing(nextSharing);
                    setSharedWith(nextPeople);
                  }}
                />
                <div className="flex flex-col gap-1">
                  <Switch checked={alertOn} onChange={setAlertOn} describedBy={`${alertId}-hint`} className="self-start">
                    Alert me on changes
                  </Switch>
                  <p id={`${alertId}-hint`} className={TYPE.meta}>
                    Once a day, in your notifications, when anyone enters or leaves.
                  </p>
                </div>
              </section>
            </div>
            <div className="min-w-0 lg:sticky lg:top-0">
              <PreviewPanel kind={kind} state={preview} />
            </div>
          </div>
        </div>
        <div data-part="builder-footer" className="flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={requestClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? 'Saving…' : 'Save segment'}
          </button>
        </div>
      </form>
      {guard.pending || confirmingClose ? (
        <UnsavedChangesDialog
          subject="segment"
          onConfirm={async () => (guard.pending ? guard.leave() : onClose())}
          onClose={guard.pending ? guard.stay : () => setConfirmingClose(false)}
        />
      ) : null}
    </BuilderDialog>
  );
}
