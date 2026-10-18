import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { BUNDLE, OUTSIDE, addressesText, assignedAsText, commentsAsText, fromText, jiraAsText, linkHintText, matchedLaterText, onIssueText, parseAddresses, postsAsText, whoText } from '../../features/agents/bundleText';
import type { JiraLinkHint } from '../../features/agents/agentTypes';
import type { Bundle, BundleStep, PickValue, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import { BUTTON, FIELD_ERROR, FOCUS, FORM_ALERT, INLINE_TARGET, INPUT, INVALID, TYPE } from '../ui';
import { ReplyText } from './ReplyText';
import { PlaceholderText } from './PlaceholderText';
import { PickSearch } from './PickSearch';
import { PickSelect } from './PickSelect';
import { usePickList } from './usePickList';

const AREA = `${INPUT} ${INVALID} min-h-24 py-2`;
const LINE = `${INPUT} ${INVALID}`;

const HINT_LINK = `inline-flex items-center font-semibold text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;

/** Round 2 D2 Decision 4: under a bot line, how to act as yourself. */
function LinkHint({ link, site }: { link: JiraLinkHint | undefined; site: string }) {
  const hint = linkHintText(link, site);
  if (!hint) return null;
  return (
    <p className={TYPE.meta}>
      {hint}
      {link === 'none' ? (
        <>
          {' '}
          <Link to="/settings/connections" className={HINT_LINK}>
            {OUTSIDE.OPEN_SETTING}
          </Link>
        </>
      ) : null}
    </p>
  );
}

const pick = (value: StepFieldValue): PickValue | null => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

function Text({ id, label, value, error, area, hint, onChange }: { id: string; label: string; value: string; error?: string; area?: boolean; hint?: string; onChange: (value: string) => void }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const props = { id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      {area ? <textarea {...props} className={AREA} /> : <input type="text" {...props} className={LINE} />}
      {hint && !error ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** An address line keeps what is typed (a trailing comma, a space) while the
 *  parsed list goes up on every change; it follows the stored list when that
 *  changes from outside. */
function Addresses({ id, label, value, error, hint, onChange }: { id: string; label: string; value: StepFieldValue; error?: string; hint?: string; onChange: (value: string[]) => void }) {
  const stored = addressesText(value);
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (addressesText(parseAddresses(draft)) !== stored) setDraft(stored);
  }
  return (
    <Text
      id={id}
      label={label}
      value={draft}
      error={error}
      hint={hint}
      onChange={(next) => {
        setDraft(next);
        onChange(parseAddresses(next));
      }}
    />
  );
}

/** The four outside kinds' fields (contract §2; frontend Decisions 1 to 6),
 *  only the keys the server lists as editable. */
export function BundleOutsideFields({ bundle, step, fields, errors, onField }: { bundle: Bundle; step: BundleStep; fields: StepFields; errors: Record<string, string>; onField: (key: string, value: StepFieldValue) => void }) {
  const base = useId();
  const can = (key: string) => step.editable.includes(key);
  const id = (key: string) => `${base}-${key}`;
  const project = typeof fields.project === 'string' ? fields.project : '';
  const isCreate = step.kind === 'jira.create';
  const projects = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_projects', enabled: isCreate && can('project') });
  const types = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_issue_types', project, enabled: isCreate && can('issue_type') && Boolean(project) });
  // Priorities depend on the project and issue type (a linked person's Jira
  // may differ per scheme): asked again whenever either changes. A name-only
  // type (no id yet) sends no type.
  const issueTypeId = pick(fields.issue_type ?? null)?.id ?? '';
  const priorities = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_priorities', project, issueType: issueTypeId, enabled: isCreate && can('priority') });
  const channels = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'slack_channels', enabled: step.kind === 'slack.reply' && can('connector_id') && !can('channel_choice') });
  const [channelQuery, setChannelQuery] = useState('');
  // The option the person picked, kept so a later search or a loading list
  // never renames the select to another channel.
  const [pickedChannel, setPickedChannel] = useState<PickValue | null>(null);
  const liveChannels = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'slack_channels', query: channelQuery.trim().replace(/^#+\s*/, '').trim(), live: true, enabled: step.kind === 'slack.reply' && can('channel_choice') });
  const [peopleQuery, setPeopleQuery] = useState('');
  const people = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_assignees', project: isCreate ? project : '', query: peopleQuery, enabled: (isCreate || step.kind === 'jira.assign') && can('assignee') });
  // Round 2 C1: Jira is one tool; when it is down the step says so once.
  const failed = [projects, types, priorities, people].filter((l) => l.state.status === 'failed');
  const first = failed[0]?.state;
  const down = first && first.status === 'failed' ? first.message : null;
  const retryJira = () => failed.forEach((l) => l.retry());

  if (step.kind === 'mail.send_reply') {
    const mail = step.preview.mail;
    const from = mail ? fromText(mail) : null;
    return (
      <div className="flex flex-col gap-3">
        {from ? <p className={TYPE.meta}>{from}</p> : null}
        {mail?.threaded ? <p className={TYPE.meta}>{OUTSIDE.THREADED}</p> : null}
        {can('to') ? <Addresses id={id('to')} label={OUTSIDE.TO} value={fields.to} error={errors.to} hint={OUTSIDE.ADDRESSES_HINT} onChange={(v) => onField('to', v)} /> : null}
        {can('cc') ? <Addresses id={id('cc')} label={OUTSIDE.CC} value={fields.cc} error={errors.cc} onChange={(v) => onField('cc', v)} /> : null}
        {can('subject') ? <Text id={id('subject')} label={BUNDLE.SUBJECT} value={String(fields.subject ?? '')} error={errors.subject} onChange={(v) => onField('subject', v)} /> : null}
        {can('body') ? <Text id={id('body')} label={OUTSIDE.REPLY} area value={String(fields.body ?? '')} error={errors.body} onChange={(v) => onField('body', v)} /> : null}
      </div>
    );
  }

  if (step.kind === 'slack.reply') {
    const slack = step.preview.slack;
    const current = typeof fields.connector_id === 'number' ? String(fields.connector_id) : '';
    const named = channels.state.status === 'ready' ? channels.state.options.find((o) => o.id === current) : undefined;
    const choice = typeof fields.channel_choice === 'string' ? fields.channel_choice : current;
    const chosen = liveChannels.state.status === 'ready' ? liveChannels.state.options.find((o) => o.id === choice) : undefined;
    // The preview's channel describes the saved choice only.
    const previewName = choice === step.fields.channel_choice ? slack?.channel : undefined;
    const channelName = chosen?.name ?? (pickedChannel?.id === choice ? pickedChannel.name : undefined) ?? previewName ?? choice;
    const note = liveChannels.state.status === 'ready' ? liveChannels.state.note : null;
    return (
      <div className="flex flex-col gap-3">
        {slack ? <p className={TYPE.meta}>{postsAsText(whoText(slack.as, slack.as_you))}</p> : null}
        {can('channel_choice') ? (
          <PickSearch
            id={id('channel_choice')}
            label={OUTSIDE.CHANNEL}
            list="slack_channels"
            state={liveChannels.state}
            retry={liveChannels.retry}
            onQuery={setChannelQuery}
            value={choice ? { id: choice, name: channelName } : null}
            onChange={(v) => {
              if (!v) return;
              setPickedChannel(v);
              onField('channel_choice', v.id);
            }}
            error={errors.channel_choice}
            hint={note ?? undefined}
            searchLabel={OUTSIDE.SEARCH_CHANNELS}
            emptyText={OUTSIDE.NO_CHANNELS}
          />
        ) : can('connector_id') ? (
          <PickSelect id={id('connector_id')} label={OUTSIDE.CHANNEL} list="slack_channels" state={channels.state} retry={channels.retry} value={current ? { id: current, name: named?.name ?? slack?.channel ?? current } : null} onChange={(v) => v && onField('connector_id', Number(v.id))} error={errors.connector_id} />
        ) : null}
        {can('text') && step.placeholders.some((p) => p.field === 'text') ? (
          <ReplyText id={id('text')} label={OUTSIDE.MESSAGE} value={String(fields.text ?? '')} stored={String(step.fields.text ?? '')} placeholders={step.placeholders} error={errors.text} onChange={(v) => onField('text', v)} />
        ) : can('text') ? (
          <Text id={id('text')} label={OUTSIDE.MESSAGE} area value={String(fields.text ?? '')} error={errors.text} onChange={(v) => onField('text', v)} />
        ) : null}
      </div>
    );
  }

  if (step.kind === 'jira.comment') {
    const comment = step.preview.jira_comment;
    // A placeholder issue shows as the step's chip (D1); a key as text.
    const keyed = Boolean(comment && !comment.issue.startsWith('{{'));
    const readOnlyBody = String(fields.body ?? '') || comment?.excerpt || '';
    return (
      <div className="flex flex-col gap-3">
        {comment ? <p className={TYPE.meta}>{commentsAsText(comment.as, comment.as_you)}</p> : null}
        {comment ? <LinkHint link={comment.link} site={comment.site} /> : null}
        {keyed && comment ? <p className={TYPE.meta}>{onIssueText(comment.issue)}</p> : null}
        {comment?.internal ? <p className={TYPE.meta}>{OUTSIDE.INTERNAL}</p> : null}
        {can('body') ? <Text id={id('body')} label={OUTSIDE.COMMENT} area value={String(fields.body ?? '')} error={errors.body} onChange={(v) => onField('body', v)} /> : null}
        {!can('body') && readOnlyBody ? (
          <div className="flex flex-col gap-1">
            <span className={TYPE.label}>{OUTSIDE.COMMENT}</span>
            <p className={`${TYPE.body} whitespace-pre-line break-words`}>
              <PlaceholderText text={readOnlyBody} placeholders={step.placeholders} />
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const jira = step.preview.jira;
  const assign = step.preview.jira_assign;
  const jiraSide = jira ?? assign;
  const as = jiraSide?.as;
  const later = (jira?.assignee ?? assign?.assignee)?.matched_later ? (jira?.assignee ?? assign?.assignee) : null;
  // The model's member starts as the chosen one by name (startFields); the
  // hint stays while it is still that member.
  const assignee = pick(fields.assignee ?? null);
  const modelsPick = Boolean(later && assignee && !assignee.id && assignee.name === later.name);
  return (
    <div className="flex flex-col gap-3">
      {as ? <p className={TYPE.meta}>{step.kind === 'jira.assign' ? assignedAsText(as, jiraSide?.as_you) : jiraAsText(as, jiraSide?.as_you)}</p> : null}
      {jiraSide ? <LinkHint link={jiraSide.link} site={jiraSide.site} /> : null}
      {down ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className={FORM_ALERT}>
            {down}
          </p>
          <button type="button" onClick={retryJira} className={BUTTON}>
            {OUTSIDE.TRY_AGAIN}
          </button>
        </div>
      ) : null}
      {can('project') ? (
        <PickSelect id={id('project')} label={OUTSIDE.PROJECT} list="jira_projects" state={projects.state} retry={projects.retry} value={project ? { id: project, name: project } : null} onChange={(v) => {
            if (!v) return;
            const type = pick(fields.issue_type ?? null);
            if (type) onField('issue_type', { id: '', name: type.name });
            onField('project', v.id);
          }} error={errors.project} quiet hint={project ? undefined : OUTSIDE.CHOOSE_PROJECT} />
      ) : null}
      {can('issue_type') && project ? (
        <PickSelect id={id('issue_type')} label={OUTSIDE.ISSUE_TYPE} list="jira_issue_types" state={types.state} retry={types.retry} value={pick(fields.issue_type ?? null)} onChange={(v) => v && onField('issue_type', v)} quiet error={errors.issue_type} />
      ) : null}
      {can('summary') ? <Text id={id('summary')} label={OUTSIDE.SUMMARY} value={String(fields.summary ?? '')} error={errors.summary} onChange={(v) => onField('summary', v)} /> : null}
      {can('description') ? <Text id={id('description')} label={OUTSIDE.DESCRIPTION} area value={String(fields.description ?? '')} error={errors.description} onChange={(v) => onField('description', v)} /> : null}
      {can('priority') ? (
        <PickSelect id={id('priority')} label={OUTSIDE.PRIORITY} list="jira_priorities" state={priorities.state} retry={priorities.retry} value={pick(fields.priority ?? null)} onChange={(v) => onField('priority', v)} none={OUTSIDE.JIRA_DEFAULT} quiet error={errors.priority} />
      ) : null}
      {can('assignee') ? (
        <PickSearch
          id={id('assignee')}
          label={OUTSIDE.ASSIGNEE}
          list="jira_assignees"
          state={people.state}
          retry={people.retry}
          onQuery={setPeopleQuery}
          value={assignee}
          onChange={(v) => (isCreate ? onField('assignee', v) : v && onField('assignee', v))}
          none={isCreate ? OUTSIDE.UNASSIGNED : undefined}
          error={errors.assignee}
          hint={modelsPick && later ? matchedLaterText(later.name) : undefined}
          quiet
        />
      ) : null}
    </div>
  );
}
