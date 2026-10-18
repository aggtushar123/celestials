// Test-only: bundles for Alice (id 1) on 7 Oct 2026, in the agent bundles D1
// contract's shapes (§4). Fake people and records only. No em dash.
import type { BundleFeedItem } from '../work/workTypes';
import type { AgentAction } from './agentTypes';
import { AGENT_LABEL, KIND_LABEL } from './agentsText';
import type { Bundle, BundleSource, BundleStep, QueueRow, SlackMessageSource } from './bundleTypes';

const ALICE = { id: 1, name: 'Alice' };
const CARL = { id: 3, name: 'Carl CSM' };
const PIZZA = { type: 'customer' as const, id: 7, name: 'Pizza Hut' };

export const NIGHTLY: BundleSource = { kind: 'nightly', label: 'Nightly review', channel: null, from: '', messages: 0, last_message_at: null, ticket: null, link: null };

export function step(over: Partial<BundleStep> & Pick<BundleStep, 'id' | 'position' | 'kind' | 'label' | 'title'>): BundleStep {
  return {
    status: 'proposed',
    selected: true,
    rationale: '',
    fields: {},
    editable: [],
    placeholders: [],
    preview: {},
    irreversible: false,
    outside: false,
    can_run: true,
    disabled_reason: null,
    disabled_link: null,
    links: [],
    outputs: {},
    error: '',
    expired_reason: '',
    undo: null,
    evidence: [],
    edited: false,
    ...over,
  };
}

export function bundle(over: Partial<Bundle> & Pick<Bundle, 'id' | 'title'>): Bundle {
  const steps = over.steps ?? [];
  return {
    agent: 'cs',
    agent_label: 'CS agent',
    reason: '',
    source: NIGHTLY,
    record: PIZZA,
    routed_to: 'owner',
    for: ALICE,
    status: 'waiting',
    created_at: '2026-10-06T12:00:00Z',
    updated_at: '2026-10-06T12:00:00Z',
    edited_at: null,
    edited_by: null,
    run_by: null,
    run_started_at: null,
    run_finished_at: null,
    reject_reason: '',
    reject_note: '',
    has_newer_message: false,
    step_count: steps.length,
    can_run: true,
    can_reject: false,
    department: null,
    refreshed_at: null,
    rejected_by: null,
    can_refresh: false,
    ...over,
    steps,
  };
}

export const B_PIZZA: Bundle = bundle({
  id: 12,
  title: 'Call Pizza Hut about the renewal, and 2 more',
  reason: 'Health fell from 72 to 41 in two weeks and the renewal is in 30 days.',
  can_reject: false,
  steps: [
    step({
      id: 41,
      position: 1,
      kind: 'task.create',
      label: 'Create a task',
      title: 'Call Pizza Hut about the renewal',
      rationale: 'Renewal in 30 days.',
      fields: { title: 'Call Pizza Hut about the renewal', assignee_id: 3, due_date: '2026-10-12', priority: 'high' },
      editable: ['title', 'assignee_id', 'due_date', 'priority'],
      preview: { task: { title: 'Call Pizza Hut about the renewal', assignee: CARL, due_date: '2026-10-12', priority: 'high' } },
    }),
    step({
      id: 42,
      position: 2,
      kind: 'note.create',
      label: 'File a note',
      title: 'Note the health drop',
      fields: { title: 'Health drop', body: 'Health fell from 72 to 41.' },
      editable: ['title', 'body'],
      preview: { note: { title: 'Health drop' } },
    }),
    step({
      id: 43,
      position: 3,
      kind: 'record.lifecycle',
      label: 'Change lifecycle stage',
      title: 'Move Pizza Hut to Renewal',
      selected: false,
      can_run: false,
      disabled_reason: "You can't run this step.",
      preview: { field: 'Lifecycle stage', from: 'Live', to: 'Renewal' },
    }),
  ],
});

export const B_CAMPAIGN: Bundle = bundle({
  id: 13,
  agent: 'ops',
  agent_label: 'Ops agent',
  title: 'Send a check-in to at-risk champions, and 1 more',
  reason: 'Three champions went quiet this month.',
  record: null,
  routed_to: 'admins',
  for: null,
  created_at: '2026-10-06T13:00:00Z',
  can_reject: true,
  steps: [
    step({
      id: 51,
      position: 1,
      kind: 'campaign.send',
      label: 'Send a campaign',
      title: 'Check in with at-risk champions',
      irreversible: true,
      fields: { name: 'Champion check-in', subject: 'Quick check-in', body: 'Hi {first_name}, how is it going?', roles: ['champion'], draft_only: true },
      editable: ['name', 'subject', 'body', 'roles', 'draft_only'],
      preview: {
        campaign: { name: 'Champion check-in', segment: 'At-risk champions', roles: ['Champion'], subject: 'Quick check-in', excerpt: 'Hi {first_name}, how is it going?', audience: { contacts: 42, records: 3, record_noun: 'organisations' }, limit: null },
      },
    }),
    step({
      id: 52,
      position: 2,
      kind: 'task.create',
      label: 'Create a task',
      // The server keeps placeholders in the payload (here the task's title),
      // never in the step's own title, and leaves those keys out of fields
      // and editable (contract §5 placeholders, D12).
      title: 'Follow up on the campaign',
      fields: { due_date: '2026-10-14', priority: 'medium' },
      // Workspace-level: no record, so no assignee picker (the task's record comes from the run).
      editable: ['due_date', 'priority'],
      placeholders: [{ field: 'title', step: 1, key: 'campaign_url', label: 'Campaign link from step 1' }],
      preview: { task: { title: 'Follow up on {{step 1.campaign_url}}', assignee: ALICE, due_date: '2026-10-14', priority: 'medium' } },
    }),
  ],
});

export const B_SURVEY: Bundle = bundle({
  id: 14,
  agent: 'ops',
  agent_label: 'Ops agent',
  title: 'Ask at-risk champions for an NPS score',
  record: null,
  routed_to: 'admins',
  for: null,
  created_at: '2026-10-06T14:00:00Z',
  can_reject: true,
  steps: [
    step({
      id: 61,
      position: 1,
      kind: 'survey.send',
      label: 'Send a survey',
      title: 'Q4 NPS for at-risk champions',
      irreversible: true,
      fields: { name: 'Q4 NPS', survey_type: 'nps', subject: 'Two minutes for Pizza Hut?', intro: "We'd love your view.", roles: ['champion'], draft_only: true },
      editable: ['name', 'survey_type', 'subject', 'intro', 'roles', 'draft_only'],
      preview: {
        survey: {
          name: 'Q4 NPS',
          survey_type: 'nps',
          question: 'How likely are you to recommend Acme to a friend or colleague?',
          subject: 'Two minutes for Pizza Hut?',
          intro: "We'd love your view.",
          segment: 'At-risk champions',
          roles: ['Champion'],
          audience: { contacts: 42, records: 3, record_noun: 'organisations' },
          limit: 500,
        },
      },
    }),
  ],
});

const RAN = { run_by: CARL, run_started_at: '2026-10-07T10:42:00Z', run_finished_at: '2026-10-07T10:42:05Z' };

export const B_DONE: Bundle = bundle({
  id: 15,
  title: 'Book the QBR',
  status: 'done',
  for: CARL,
  updated_at: '2026-10-07T10:42:05Z',
  can_run: false,
  ...RAN,
  steps: [
    step({
      id: 71,
      position: 1,
      kind: 'task.create',
      label: 'Create a task',
      title: 'Book the QBR',
      status: 'applied',
      selected: true,
      can_run: false,
      outputs: { task_id: 41, task_url: '/work/mine?task=41' },
      undo: { allowed: true, until: '2026-10-14T10:42:05Z', reason: null },
    }),
  ],
});

export const B_PARTLY: Bundle = bundle({
  id: 16,
  agent: 'ops',
  agent_label: 'Ops agent',
  title: 'Send the renewal survey, and 1 more',
  status: 'partly_done',
  record: null,
  routed_to: 'admins',
  for: null,
  updated_at: '2026-10-07T11:00:00Z',
  can_run: false,
  ...RAN,
  steps: [
    step({ id: 81, position: 1, kind: 'segment.create', label: 'Build a segment', title: 'Renewing in 30 days', status: 'applied', can_run: false, outputs: { segment_id: 5, segment_url: '/segments/5' }, links: [{ label: 'Open segment', url: '/segments/5', external: false }] }),
    step({ id: 82, position: 2, kind: 'survey.send', label: 'Send a survey', title: 'Renewal survey', status: 'failed', can_run: false, irreversible: true, error: "Email isn't set up for this workspace yet, so surveys can't be sent." }),
  ],
});

export const B_REJECTED: Bundle = bundle({
  id: 17,
  title: 'Move Pizza Hut to Churn',
  status: 'rejected',
  updated_at: '2026-10-05T09:00:00Z',
  can_run: false,
  reject_reason: 'not_relevant',
  rejected_by: CARL,
  run_by: null,
  steps: [step({ id: 91, position: 1, kind: 'record.lifecycle', label: 'Change lifecycle stage', title: 'Move Pizza Hut to Churn', status: 'rejected', can_run: false })],
});

/** Waiting on Carl: Alice sees it on My team. */
export const TEAM_BUNDLE: Bundle = bundle({ ...B_PIZZA, id: 18, for: CARL, title: 'Chase the exec sponsor', steps: [{ ...B_PIZZA.steps[0], id: 101 }] });

export const WAITING_BUNDLES: Bundle[] = [B_PIZZA, B_CAMPAIGN, B_SURVEY];
export const BUNDLES: Bundle[] = [...WAITING_BUNDLES, B_DONE, B_PARTLY, B_REJECTED, TEAM_BUNDLE];

/** A waiting bundle as the feed lists it (contract §4.3). */
export function bundleItem(b: Bundle, withFor = false): BundleFeedItem {
  return {
    key: `bundle:${b.id}`,
    kind: 'bundle',
    id: b.id,
    title: b.title,
    record: b.record,
    from: { type: 'agent', label: b.agent_label },
    at: b.created_at,
    due_date: null,
    priority: null,
    private: false,
    actions: ['open'],
    detail: { reason: b.reason, step_count: b.step_count, source: { kind: b.source.kind, label: b.source.label, channel: b.source.channel ?? null }, routed_to: b.routed_to, department: b.department, kinds: b.steps.filter((s) => s.status === 'proposed').map((s) => s.label), can_run: b.can_run, ...(b.priority ? { priority: b.priority } : {}), ...(b.guided ? { guided: true } : {}) },
    ...(withFor ? { for: b.for } : {}),
  };
}

/** A migrated action as its bundle of one (contract §1.4), waiting on Alice. */
export function bundleOfOne(action: AgentAction): Bundle {
  return bundle({
    id: action.bundle,
    agent: action.agent,
    agent_label: AGENT_LABEL[action.agent],
    title: action.title,
    reason: action.rationale,
    record: action.record ? { type: action.record.kind, id: action.record.id, name: action.record.name } : null,
    routed_to: action.record ? 'owner' : 'admins',
    for: action.record ? ALICE : null,
    can_reject: true,
    steps: [step({ id: action.id, position: 1, kind: action.kind, label: KIND_LABEL[action.kind], title: action.title, rationale: action.rationale, preview: action.preview, evidence: action.evidence })],
  });
}

export const LOOSE = { type: 'customer' as const, id: 11, name: 'Loose Ltd' };
const at = '2026-10-07T09:58:12Z';

/** A Zendesk ticket on Pizza Hut, routed to its owner Alice (contract §3.1). */
export const B_TICKET: Bundle = bundle({
  id: 20,
  title: 'Pizza Hut: login loop after a password reset',
  reason: 'Ann cannot log in since the reset and the renewal is close.',
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Zendesk', channel: 'zendesk', from: 'ann@pizzahut.com', messages: 1, last_message_at: at, ticket: 'ZD-1042', link: 'https://acme.zendesk.com/agent/tickets/1042' },
  can_reject: true,
  can_refresh: true,
  steps: [
    step({ id: 201, position: 1, kind: 'draft.reply', label: 'Draft a reply', title: 'Reply to Ann about the login loop', fields: { body: 'Hi Ann, we are on it.' }, editable: ['body'], preview: { draft: { channel: 'ticket', ticket: 'ZD-1042', subject: 'Login loop', excerpt: 'Hi Ann, we are on it.' } } }),
    step({ id: 202, position: 2, kind: 'task.create', label: 'Create a task', title: 'Fix the login loop', fields: { title: 'Fix the login loop', assignee_id: 3, due_date: '2026-10-09', priority: 'high' }, editable: ['title', 'assignee_id', 'due_date', 'priority'], preview: { task: { title: 'Fix the login loop', assignee: CARL, due_date: '2026-10-09', priority: 'high' } } }),
  ],
});

/** A mail thread of three messages, edited by Alice, with a newer message since (contract D2-17). */
export const B_MAIL: Bundle = bundle({
  id: 21,
  title: 'Pizza Hut: multi-year renewal terms',
  reason: 'Ann asks for a two-year option before the renewal.',
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Email', channel: 'mail', from: 'ann@pizzahut.com', messages: 3, last_message_at: at, ticket: null, link: null },
  edited_at: at,
  edited_by: ALICE,
  has_newer_message: true,
  can_reject: true,
  can_refresh: true,
  steps: [
    step({ id: 211, position: 1, kind: 'task.create', label: 'Create a task', title: 'Price a two-year renewal', edited: true, fields: { title: 'Price a two-year renewal today', assignee_id: 1, due_date: '2026-10-08', priority: 'high' }, editable: ['title', 'assignee_id', 'due_date', 'priority'], preview: { task: { title: 'Price a two-year renewal today', assignee: ALICE, due_date: '2026-10-08', priority: 'high' } } }),
    step({ id: 212, position: 2, kind: 'note.create', label: 'File a note', title: 'Note the ask', fields: { title: 'Two-year ask', body: 'Ann wants two years.' }, editable: ['title', 'body'], preview: { note: { title: 'Two-year ask' } } }),
  ],
});

/** What refreshing B_MAIL answers: the edited step kept, a new one after it (contract D2-19). */
export const REFRESHED_STEPS: BundleStep[] = [
  step({ id: 290, position: 2, kind: 'note.create', label: 'File a note', title: 'Note the new deadline', fields: { title: 'Deadline Friday', body: 'Ann needs it by Friday.' }, editable: ['title', 'body'], preview: { note: { title: 'Deadline Friday' } } }),
];

/** A Customer Success queue bundle on the ownerless Loose Ltd (contract D2-5). */
export const B_DEPT: Bundle = bundle({
  id: 22,
  title: 'Loose Ltd: export fails on large files',
  reason: 'Nobody owns Loose Ltd and the ticket is a week old.',
  record: LOOSE,
  routed_to: 'department',
  department: { key: 'cs', label: 'Customer Success' },
  for: null,
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Zendesk', channel: 'zendesk', from: 'ops@loose.io', messages: 1, last_message_at: at, ticket: 'ZD-1077', link: 'https://acme.zendesk.com/agent/tickets/1077' },
  can_reject: true,
  can_refresh: true,
  steps: [step({ id: 221, position: 1, kind: 'task.create', label: 'Create a task', title: 'Look into the export', fields: { title: 'Look into the export', assignee_id: null, due_date: '2026-10-10', priority: 'medium' }, editable: ['title', 'assignee_id', 'due_date', 'priority'], preview: { task: { title: 'Look into the export', assignee: null, due_date: '2026-10-10', priority: 'medium' } } })],
});

/** An Unassigned bundle: a Slack message on Loose Ltd from a connector with no department. */
export const B_UNASSIGNED: Bundle = bundle({
  id: 23,
  title: 'Loose Ltd: asks for a training session',
  record: LOOSE,
  routed_to: 'admins',
  for: null,
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Slack', channel: 'slack', from: 'kim@loose.io', messages: 1, last_message_at: at, ticket: 'SL-10421', link: 'https://slack.com/archives/C1/p1' },
  can_reject: true,
  can_refresh: true,
  steps: [step({ id: 231, position: 1, kind: 'note.create', label: 'File a note', title: 'Note the training ask', fields: { title: 'Training ask', body: 'Kim wants a session.' }, editable: ['title', 'body'], preview: { note: { title: 'Training ask' } } })],
});

export const MESSAGE_BUNDLES: Bundle[] = [B_TICKET, B_MAIL, B_DEPT, B_UNASSIGNED];
export const CS_QUEUE: QueueRow = { key: 'department:cs', label: 'Customer Success', count: 1 };
export const UNASSIGNED_QUEUE: QueueRow = { key: 'unassigned', label: 'Unassigned', count: 1 };

/** Agent bundles D3: a Slack thread on Pizza Hut (contract §2). */
const SLACK_SOURCE: BundleSource = { kind: 'thread', label: 'Slack', channel: 'slack', from: 'ann@pizzahut.com', messages: 1, last_message_at: '2026-10-07T09:58:00Z', ticket: 'SL-40001', link: 'https://slack.com/archives/C0SUPPORT/p1760339999000100' };

export const B_OUTSIDE: Bundle = bundle({
  id: 401,
  title: 'Pizza Hut: login loop after password reset',
  reason: 'Ann is locked out since the reset.',
  source: SLACK_SOURCE,
  can_reject: true,
  steps: [
    step({
      id: 411,
      position: 1,
      kind: 'mail.send_reply',
      label: 'Send an email reply',
      title: 'Answer Ann',
      outside: true,
      irreversible: true,
      fields: { to: ['ann@pizzahut.com'], cc: [], subject: 'Re: Login loop', body: "We're on it: the fix ships Friday." },
      editable: ['to', 'cc', 'subject', 'body'],
      preview: { mail: { from: 'alice@acme.io', to: ['ann@pizzahut.com'], cc: [], subject: 'Re: Login loop', excerpt: "We're on it: the fix ships Friday.", threaded: true } },
    }),
    step({
      id: 412,
      position: 2,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: "Tell Ann we're on it",
      outside: true,
      irreversible: true,
      fields: { connector_id: 5, text: 'Thanks Ann, we are on it.' },
      editable: ['connector_id', 'text'],
      preview: { slack: { channel: '#support', in_thread: true, as: 'Revenact', excerpt: 'Thanks Ann, we are on it.' } },
    }),
    step({
      id: 413,
      position: 3,
      kind: 'jira.create',
      label: 'Create a Jira issue',
      title: 'Log the login loop',
      outside: true,
      irreversible: true,
      fields: { project: 'SUP', issue_type: { id: '', name: 'Task' }, summary: 'Login loop after password reset', description: 'Nobody can log in.', priority: { id: '', name: 'High' }, assignee: null },
      editable: ['project', 'issue_type', 'summary', 'description', 'priority', 'assignee'],
      preview: { jira: { site: 'acme.atlassian.net', project: 'SUP', issue_type: 'Task', summary: 'Login loop after password reset', excerpt: 'Nobody can log in.', priority: 'High', assignee: { name: 'Erin Eng', matched_later: true }, as: 'Jira Bot', as_you: false, link: 'none' } },
    }),
    step({
      id: 414,
      position: 4,
      kind: 'jira.assign',
      label: 'Assign a Jira issue',
      title: 'Give it to Erin',
      outside: true,
      irreversible: true,
      fields: { assignee: null },
      editable: ['assignee'],
      placeholders: [{ field: 'issue', step: 3, key: 'ticket_key', label: 'Jira ticket from step 3' }],
      preview: { jira_assign: { site: 'acme.atlassian.net', issue: '{{step 3.ticket_key}}', assignee: { name: 'Erin Eng', matched_later: true }, as: 'Jira Bot' } },
    }),
  ],
});

export const B_BLOCKED: Bundle = bundle({
  id: 402,
  title: 'Pizza Hut: export fails on large files',
  source: SLACK_SOURCE,
  can_run: false,
  can_reject: true,
  steps: [
    step({
      id: 421,
      position: 1,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: 'Tell Ann we are looking',
      outside: true,
      irreversible: true,
      can_run: false,
      selected: false,
      disabled_reason: 'Ask an admin to allow Revenact to post in Slack.',
      disabled_link: '/settings/connections',
      fields: { connector_id: 5, text: 'We are looking into it.' },
      editable: ['connector_id', 'text'],
      preview: { slack: { channel: '#support', in_thread: true, as: 'Revenact', excerpt: 'We are looking into it.' } },
    }),
  ],
});

export const B_OUTSIDE_DONE: Bundle = bundle({
  id: 403,
  title: 'Pizza Hut: billing question answered',
  source: SLACK_SOURCE,
  status: 'done',
  can_run: false,
  run_by: ALICE,
  run_started_at: '2026-10-07T10:40:00Z',
  run_finished_at: '2026-10-07T10:42:00Z',
  updated_at: '2026-10-07T10:42:00Z',
  steps: [
    step({ id: 431, position: 1, kind: 'jira.create', label: 'Create a Jira issue', title: 'Log the billing bug', status: 'applied', outside: true, irreversible: true, can_run: false, outputs: { ticket_key: 'SUP-77', ticket_url: 'https://acme.atlassian.net/browse/SUP-77' }, links: [{ label: 'Open SUP-77 in Jira', url: 'https://acme.atlassian.net/browse/SUP-77', external: true }], undo: { allowed: false, until: null, reason: 'irreversible' } }),
    step({ id: 432, position: 2, kind: 'slack.reply', label: 'Reply in Slack', title: 'Tell Ann', status: 'applied', outside: true, irreversible: true, can_run: false, outputs: { slack_ts: '1760340001.000100', slack_url: 'https://slack.com/archives/C0SUPPORT/p1760340001000100' }, links: [{ label: 'Open the Slack message', url: 'https://slack.com/archives/C0SUPPORT/p1760340001000100', external: true }], undo: { allowed: false, until: null, reason: 'irreversible' } }),
  ],
});

export const OUTSIDE_BUNDLES: Bundle[] = [B_OUTSIDE, B_BLOCKED, B_OUTSIDE_DONE];

/** Round 2 D1: a Jira thread on Pizza Hut and an internal comment on its issue. */
const JIRA_SOURCE: BundleSource = { kind: 'thread', label: 'Jira', channel: 'jira', from: 'ann@pizzahut.com', messages: 1, last_message_at: '2026-10-07T09:58:00Z', ticket: 'SUP-12', link: 'https://acme.atlassian.net/browse/SUP-12' };

export const B_COMMENT: Bundle = bundle({
  id: 405,
  title: 'Pizza Hut: export fails on large files',
  reason: 'Ann says it fails on Chrome too.',
  source: JIRA_SOURCE,
  can_reject: true,
  steps: [
    step({
      id: 451,
      position: 1,
      kind: 'jira.comment',
      label: 'Comment on a Jira issue',
      title: 'Tell engineering it fails on Chrome too',
      outside: true,
      irreversible: true,
      fields: { body: 'Customer confirms it fails on Chrome too.' },
      editable: ['body'],
      preview: { jira_comment: { site: 'acme.atlassian.net', issue: 'SUP-12', excerpt: 'Customer confirms it fails on Chrome too.', as: 'Jira Bot', internal: true } },
    }),
  ],
});

const CREATE_JIRA = { site: 'acme.atlassian.net', project: 'SUP', issue_type: 'Task', summary: 'Login loop after password reset', excerpt: 'Nobody can log in.', priority: 'High', assignee: { name: 'Erin Eng', matched_later: true } };

/** Round 2 D2: a Jira issue created as the person (contract §3.4). */
export const B_AS_YOU: Bundle = bundle({
  id: 406,
  title: 'Pizza Hut: login loop after password reset',
  source: JIRA_SOURCE,
  can_reject: true,
  steps: [
    step({
      id: 461,
      position: 1,
      kind: 'jira.create',
      label: 'Create a Jira issue',
      title: 'Log the login loop',
      outside: true,
      irreversible: true,
      fields: { project: 'SUP', issue_type: { id: '', name: 'Task' }, summary: 'Login loop after password reset', description: 'Nobody can log in.', priority: { id: '', name: 'High' }, assignee: null },
      editable: ['project', 'issue_type', 'summary', 'description', 'priority', 'assignee'],
      preview: { jira: { ...CREATE_JIRA, as: 'Carl Lee', as_you: true, link: null } },
    }),
  ],
});

/** Round 2 D2: a Slack reply whose channel is chosen from the live list (contract §4.1). */
export const B_LIVE: Bundle = bundle({
  id: 407,
  title: 'Pizza Hut: export fails on large files',
  source: SLACK_SOURCE,
  can_reject: true,
  steps: [
    step({
      id: 471,
      position: 1,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: "Tell Ann we're on it",
      outside: true,
      irreversible: true,
      fields: { connector_id: 5, channel_choice: '5', text: 'We are on it.' },
      editable: ['connector_id', 'channel_choice', 'text'],
      preview: { slack: { channel: '#support', in_thread: true, as: 'Revenact', excerpt: 'We are on it.', synced: true } },
    }),
  ],
});

const GLOBEX = { type: 'customer' as const, id: 29, name: 'Globex (QA)' };
const ESCALATION_SOURCE: BundleSource = { kind: 'thread', label: 'Slack', channel: 'slack', from: 'Tushar Aggarwal', messages: 2, last_message_at: '2026-10-17T05:16:55Z', ticket: null, link: 'https://slack.com/archives/C0CA7PPRP7A/p1792041415357099' };
export const ESCALATION_REPLY = 'Thanks Tushar. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}) with Faiz Jamal (Customer Success).';

/** Slack escalations D4: Tushar raised it in Slack, Jesh gave it to Faiz in the thread (contract §2.2). */
export const B_ESCALATION: Bundle = bundle({
  id: 601,
  title: 'Globex (QA): CSV exports fail',
  reason: 'Exports fail for everyone since this morning.',
  source: ESCALATION_SOURCE,
  record: GLOBEX,
  can_reject: true,
  can_refresh: true,
  participant_view: false,
  escalation: {
    function: 'engineering',
    function_label: 'Engineering',
    handler: { id: 11, name: 'Faiz Jamal', function_label: 'Customer Success' },
    via: 'thread',
    decision: { by: 'Jesh Sanghvi', quote: '@Faiz Jamal can you take this?', named: 'Faiz Jamal' },
    can_change: true,
  },
  steps: [
    step({
      id: 611,
      position: 1,
      kind: 'jira.create',
      label: 'Create a Jira issue',
      title: 'Log the export failure',
      outside: true,
      irreversible: true,
      fields: { project: 'KAN', issue_type: { id: '', name: 'Task' }, summary: 'CSV exports fail', description: 'Every CSV export fails since 9am.', priority: { id: '', name: 'High' }, assignee: null },
      editable: ['project', 'issue_type', 'summary', 'description', 'priority', 'assignee'],
      preview: { jira: { site: 'alfiee.atlassian.net', project: 'KAN', issue_type: 'Task', summary: 'CSV exports fail', excerpt: 'Every CSV export fails since 9am.', priority: 'High', assignee: null, as: 'Jira Bot', as_you: false, link: 'none' } },
    }),
    step({
      id: 612,
      position: 2,
      kind: 'jira.assign',
      label: 'Assign a Jira issue',
      title: 'Assign it to Faiz Jamal',
      rationale: 'The thread gave it to Faiz Jamal.',
      outside: true,
      irreversible: true,
      fields: { assignee: null },
      editable: ['assignee'],
      placeholders: [{ field: 'issue', step: 1, key: 'ticket_key', label: 'Jira key from step 1' }],
      preview: { jira_assign: { site: 'alfiee.atlassian.net', issue: '{{step 1.ticket_key}}', assignee: { name: 'Faiz Jamal', matched_later: true }, as: 'Jira Bot' } },
    }),
    step({
      id: 613,
      position: 3,
      kind: 'task.create',
      label: 'Create a task',
      title: 'A to-do for Faiz Jamal',
      fields: { title: 'Globex (QA): CSV exports fail', assignee_id: 11, due_date: '2026-10-20', priority: 'high' },
      editable: ['title', 'assignee_id', 'due_date', 'priority'],
      preview: { task: { title: 'Globex (QA): CSV exports fail', assignee: { id: 11, name: 'Faiz Jamal' }, due_date: '2026-10-20', priority: 'high' } },
    }),
    step({
      id: 614,
      position: 4,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: 'Reply to Tushar in Slack',
      outside: true,
      irreversible: true,
      fields: { channel_choice: '7', text: ESCALATION_REPLY },
      editable: ['channel_choice', 'text'],
      placeholders: [
        { field: 'text', step: 1, key: 'ticket_key', label: 'Jira key from step 1' },
        { field: 'text', step: 1, key: 'ticket_url', label: 'Jira link from step 1' },
      ],
      preview: { slack: { channel: '#all-alfiee', in_thread: true, synced: true, as: 'Faiz Jamal', as_you: true, excerpt: ESCALATION_REPLY } },
    }),
  ],
});

/** The same escalation, read by a thread participant who can't open Globex (QA) (contract SE4-26). */
export const B_PARTICIPANT: Bundle = {
  ...B_ESCALATION,
  id: 602,
  reason: '',
  participant_view: true,
  record: { ...GLOBEX, can_open: false },
  steps: B_ESCALATION.steps.map((s) => ({ ...s, id: s.id + 10, rationale: '' })),
};

/** The fake lists the options route answers (contract §5.2). */
export const PICK_LISTS = {
  jira_projects: [{ id: 'SUP', name: 'Support', detail: 'SUP' }, { id: 'ENG', name: 'Engineering', detail: 'ENG' }],
  jira_issue_types: { SUP: [{ id: '10001', name: 'Task', detail: '' }, { id: '10002', name: 'Bug', detail: '' }], ENG: [{ id: '10002', name: 'Bug', detail: '' }] } as Record<string, { id: string; name: string; detail: string }[]>,
  jira_priorities: [{ id: '2', name: 'High', detail: '' }, { id: '3', name: 'Medium', detail: '' }, { id: '4', name: 'Low', detail: '' }],
  jira_assignees: [{ id: 'acc-priya', name: 'Priya Shah', detail: 'priya@acme.io' }, { id: 'acc-erin', name: 'Erin Eng', detail: 'erin@acme.io' }],
  slack_channels: [{ id: '5', name: '#support', detail: 'This thread' }, { id: '6', name: '#escalations', detail: 'A new message' }],
};

/** Slack bundles (2026-10-17): a Slack message Alice sent to Work, hers alone. */
export const SLACK_MESSAGE_SOURCE: SlackMessageSource = {
  kind: 'slack_message',
  label: 'Slack message',
  sender: 'Faiz Jamal',
  excerpt: 'Pizza Hut says checkout times out since Tuesday.',
  text: 'Pizza Hut says checkout times out since Tuesday. Can we look?',
  link: 'https://slack.com/archives/C0SUPPORT/p1760692800000100',
  at: '2026-10-07T09:20:00Z',
  private: true,
};
export const SLACK_PURGED: SlackMessageSource = { ...SLACK_MESSAGE_SOURCE, sender: '', excerpt: '', text: '', link: null, at: null };

const SLACK_SURVEY = {
  survey_type: 'csat' as const,
  question: 'How satisfied are you with how we handled this?',
  subject: 'How did we do, Pizza Hut?',
  intro: 'We fixed the checkout timeouts.',
  roles: ['Champion'],
  record: 'Pizza Hut',
  timing: 'now' as const,
  issue: null,
  audience: { contacts: 2, records: 1, record_noun: 'organisations' },
  wait: null,
};

export const B_SLACK: Bundle = bundle({
  id: 700,
  title: 'Pizza Hut: checkout times out',
  reason: 'Faiz sent this to Work from Slack.',
  source: SLACK_MESSAGE_SOURCE,
  routed_to: 'person',
  department: null,
  can_refresh: false,
  has_newer_message: true,
  can_reject: true,
  steps: [
    step({
      id: 701,
      position: 1,
      kind: 'survey.record',
      label: KIND_LABEL['survey.record'],
      title: 'Ask Pizza Hut how we did',
      irreversible: true,
      fields: { survey_type: 'csat', subject: SLACK_SURVEY.subject, intro: SLACK_SURVEY.intro, roles: ['champion'], timing: 'now' },
      editable: ['subject', 'intro', 'roles', 'survey_type', 'timing'],
      preview: { record_survey: SLACK_SURVEY },
    }),
    step({
      id: 702,
      position: 2,
      kind: 'segment.pin',
      label: KIND_LABEL['segment.pin'],
      title: 'Add Pizza Hut to At-risk renewals',
      preview: { segment_pin: { segment: { id: 4, name: 'At-risk renewals', members: 12 }, record: 'Pizza Hut', from: 'Not pinned', to: 'Pinned' } },
    }),
    step({
      id: 703,
      position: 3,
      kind: 'scenario.run',
      label: KIND_LABEL['scenario.run'],
      title: 'Run Escalation playbook on Pizza Hut',
      preview: { scenario_run: { scenario: { id: 7, name: 'Escalation playbook' }, record: 'Pizza Hut', run: null } },
    }),
  ],
});

/** The same bundle once it ran: the survey held for KAN-12, the scenario's run noted. */
export const B_SLACK_DONE: Bundle = bundle({
  ...B_SLACK,
  id: 710,
  status: 'done',
  has_newer_message: false,
  can_run: false,
  can_reject: false,
  ...RAN,
  steps: [
    { ...B_SLACK.steps[0], id: 711, status: 'applied', note: 'Sends when KAN-12 is resolved.', preview: { record_survey: { ...SLACK_SURVEY, timing: 'after_jira', issue: 'KAN-12', audience: null, wait: { status: 'waiting', label: 'Waiting for KAN-12' } } } },
    { ...B_SLACK.steps[1], id: 712, status: 'applied' },
    { ...B_SLACK.steps[2], id: 713, status: 'applied', preview: { scenario_run: { scenario: { id: 7, name: 'Escalation playbook' }, record: 'Pizza Hut', run: { id: 31, status: 'success', note: 'Made 2 tasks.' } } } },
  ],
});
