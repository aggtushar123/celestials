// Test-only: the delivery 1 to 3 contracts' shapes, around the Work fixtures'
// people (Alice 1 admin, Mona 2, Carl 3, Dana 4) and records (Pizza Hut 7,
// Uber EMEA 9). No em dash.
import type { ActionKindSpec, AgentAction, AgentCard, AgentKind, AgentSettings, FastLaneSettings, Levels, MadeBy, SignalSettings } from './agentTypes';

export const NOW = '2026-10-08T09:00:00.000000Z';

export const CARDS: AgentCard[] = [
  { kind: 'cs', label: 'CS agent', enabled: true, monthly_credits: 133, spent_this_month: 12, resets_on: '2026-11-01', last_run: { at: '2026-10-08T00:40:00Z', proposed: 4, applied: 1, dropped: 0, skipped_reason: null }, waiting_threads: 0, waiting_reason: null },
  { kind: 'sales', label: 'Sales agent', enabled: true, monthly_credits: 133, spent_this_month: 0, resets_on: '2026-11-01', last_run: null, waiting_threads: 0, waiting_reason: null },
  { kind: 'ops', label: 'Ops agent', enabled: false, monthly_credits: 134, spent_this_month: 0, resets_on: '2026-11-01', last_run: { at: '2026-10-08T00:41:00Z', proposed: 0, applied: 0, dropped: 0, skipped_reason: 'disabled' }, waiting_threads: 0, waiting_reason: null },
];

const ALL: AgentKind[] = ['cs', 'sales', 'ops'];
const RECORDS: AgentKind[] = ['cs', 'sales'];
export const KINDS: ActionKindSpec[] = [
  { kind: 'record.lifecycle', label: 'Change lifecycle stage', example: 'Move Dough Co from Live to Renewal', max_level: 'auto', agents: RECORDS, irreversible: false, outside: false, locked: false },
  { kind: 'record.owner', label: 'Change owner', example: 'Give Uber EMEA to Dana CSM', max_level: 'ask', agents: RECORDS, irreversible: false, outside: false, locked: false },
  { kind: 'record.attribute', label: 'Set an AI attribute', example: 'Set Renewal likelihood to Low on Pizza Hut', max_level: 'auto', agents: RECORDS, irreversible: false, outside: false, locked: false },
  { kind: 'task.create', label: 'Create a task', example: 'Call Pizza Hut about the renewal', max_level: 'auto', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'task.reassign', label: 'Reassign a task', example: 'Give the QBR deck to Carl CSM', max_level: 'auto', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'task.redate', label: "Change a task's due date", example: 'Move the QBR deck to 20 Oct', max_level: 'auto', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'task.complete', label: 'Mark a task done', example: 'Close Send the contract: it was signed', max_level: 'ask', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'task.snooze', label: 'Snooze a task', example: 'Snooze the roadmap review to 1 Nov', max_level: 'auto', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'note.create', label: 'File a note', example: 'Note what the last call settled', max_level: 'auto', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'draft.reply', label: 'Draft a reply', example: "Draft a reply to Ann Lee's email about the renewal", max_level: 'auto', agents: RECORDS, irreversible: false, outside: false, locked: false },
  { kind: 'plan.start', label: 'Start a plan', example: 'Start the Onboarding plan on Dough Co', max_level: 'ask', agents: RECORDS, irreversible: false, outside: false, locked: false },
  { kind: 'segment.create', label: 'Build a segment', example: 'Build a segment of organisations renewing in 60 days with poor health', max_level: 'ask', agents: ['ops'], irreversible: false, outside: false, locked: false },
  { kind: 'scenario.create', label: 'Build a scenario', example: 'Build a scenario that tasks the owner when health drops below 4', max_level: 'ask', agents: ['ops'], irreversible: false, outside: false, locked: false },
  { kind: 'campaign.create', label: 'Draft a campaign', example: 'Draft a check-in campaign to champions of at-risk organisations', max_level: 'ask', agents: ['ops'], irreversible: false, outside: false, locked: false },
  { kind: 'campaign.send', label: 'Send a campaign', example: 'Send a check-in campaign to champions of at-risk organisations', max_level: 'ask', agents: ['ops'], irreversible: true, outside: false, locked: false },
  { kind: 'survey.send', label: 'Send a survey', example: 'Send an NPS survey to champions of at-risk organisations', max_level: 'ask', agents: ['ops'], irreversible: true, outside: false, locked: false },
  { kind: 'canvas.create', label: "Map a record's people", example: 'Map the people at Dough Co', max_level: 'ask', agents: ALL, irreversible: false, outside: false, locked: false },
  { kind: 'plan.template', label: 'Write a plan template', example: 'Write a save-plan template for at-risk renewals', max_level: 'ask', agents: ['ops'], irreversible: false, outside: false, locked: false },
  { kind: 'initiative.create', label: 'Start an initiative', example: 'Cut Analytics Suite risk to 10% by December', max_level: 'ask', agents: ['ops'], irreversible: false, outside: false, locked: false },
];

/** Every agent, every kind it uses, on Ask (the contract's fresh workspace). */
export const ALL_ASK: Levels = {
  cs: Object.fromEntries(KINDS.filter((k) => k.agents.includes('cs')).map((k) => [k.kind, 'ask'])),
  sales: Object.fromEntries(KINDS.filter((k) => k.agents.includes('sales')).map((k) => [k.kind, 'ask'])),
  ops: Object.fromEntries(KINDS.filter((k) => k.agents.includes('ops')).map((k) => [k.kind, 'ask'])),
};

/** The fast lane as a fresh workspace reads it (round 2 D3 contract §5.1): off, Jira's top priority on. */
export const FAST_LANE_OFF: FastLaneSettings = {
  on: false,
  rules: { jira_priority: true, slack_connectors: [], senders: [], words: [], poor_health: false },
  per_hour: 10,
  per_day: 50,
  used_hour: 0,
  used_day: 0,
  limits: { per_hour: 10, per_day: 50, senders: 50, words: 20 },
  slack_choices: [{ id: 6, name: 'Slack #support' }],
};

/** The fast lane on, with every kind of rule but poor health (used 1 of 10 and 3 of 50). */
export const FAST_LANE_ON: FastLaneSettings = {
  ...FAST_LANE_OFF,
  on: true,
  rules: { jira_priority: true, slack_connectors: [6], senders: ['@bigco.com'], words: ['outage', 'data loss'], poor_health: false },
  used_hour: 1,
  used_day: 3,
};

export const SIGNALS: SignalSettings = {
  interval: '1h',
  intervals: [
    { value: '30m', label: 'Every 30 minutes' },
    { value: '1h', label: 'Every hour' },
    { value: '4h', label: 'Every 4 hours' },
    { value: '24h', label: 'Once a day' },
  ],
  sources: [
    { key: 'mail', label: 'Email filed to a customer', enabled: true, connected: true },
    { key: 'slack', label: 'Slack', enabled: true, connected: false },
    { key: 'zendesk', label: 'Zendesk', enabled: true, connected: true },
    { key: 'freshdesk', label: 'Freshdesk', enabled: true, connected: false },
    { key: 'jira', label: 'Jira', enabled: true, connected: false },
    { key: 'webhook', label: 'Webhooks', enabled: true, connected: false },
  ],
  last_run_at: '2026-10-08T09:00:02Z',
  fast_lane: FAST_LANE_OFF,
};

export const AGENT_SETTINGS: AgentSettings = {
  ai_enabled: true,
  tone: 'professional',
  agents: CARDS,
  kinds: KINDS,
  levels: ALL_ASK,
  plan_monthly_credits: 2000,
  can_edit: true,
  can_run: true,
  signals: SIGNALS,
};

const base = {
  bundle: 0,
  rationale: 'Renewal is in 21 days and the renewal task is open.',
  evidence: [{ label: 'Renews 29 Oct', link: '/organizations/7' }],
  decided_by: null,
  decided_at: null,
  auto: false,
  applied_at: null,
  undo: null,
  undone_by: null,
  undone_at: null,
  result: {
    task_id: null,
    note_id: null,
    initiative_id: null,
    draft_id: null,
    plan_id: null,
    segment_id: null,
    rule_id: null,
    campaign_id: null,
    canvas_id: null,
    template_id: null,
  },
  created_at: '2026-10-08T00:40:00Z',
};

export const ACT_LIFECYCLE: AgentAction = {
  ...base,
  id: 81,
  bundle: 1081,
  agent: 'cs',
  kind: 'record.lifecycle',
  title: 'Move Pizza Hut to Renewal',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { field: 'Lifecycle stage', from: 'Live', to: 'Renewal' },
};

export const ACT_TASK_CREATE: AgentAction = {
  ...base,
  id: 82,
  bundle: 1082,
  agent: 'cs',
  kind: 'task.create',
  title: 'Call Pizza Hut about the renewal',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { task: { title: 'Call Pizza Hut about the renewal', assignee: { id: 3, name: 'Carl CSM' }, due_date: '2026-10-12', priority: 'high' } },
};

export const ACT_APPLIED_AUTO: AgentAction = {
  ...base,
  id: 83,
  bundle: 1083,
  agent: 'sales',
  kind: 'record.lifecycle',
  title: 'Move Uber EMEA to Renewal',
  status: 'applied',
  record: { kind: 'account', id: 9, name: 'Uber EMEA' },
  preview: { field: 'Lifecycle stage', from: 'Live', to: 'Renewal' },
  evidence: [{ label: 'Renews 29 Oct', link: '/accounts/9' }],
  auto: true,
  applied_at: '2026-10-08T00:42:00Z',
  undo: { allowed: true, until: '2026-10-15T00:42:00Z', reason: null },
};

export const ACT_UNDONE: AgentAction = {
  ...base,
  id: 84,
  bundle: 1084,
  agent: 'cs',
  kind: 'task.redate',
  title: 'Move the QBR deck to 20 Oct',
  status: 'undone',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { task: { id: 42, title: 'Send the QBR deck' }, field: 'Due date', from: '2026-10-07', to: '2026-10-20' },
  decided_by: { id: 2, name: 'Mona Manager' },
  decided_at: '2026-10-07T09:00:00Z',
  applied_at: '2026-10-07T09:00:00Z',
  undone_by: { id: 1, name: 'Alice' },
  undone_at: '2026-10-07T10:00:00Z',
};

export const ACT_INITIATIVE: AgentAction = {
  ...base,
  id: 85,
  bundle: 1085,
  agent: 'ops',
  kind: 'initiative.create',
  title: 'Cut Analytics Suite risk',
  status: 'proposed',
  record: null,
  evidence: [{ label: 'Analytics Suite risk is 24% of ARR', link: null }],
  preview: { initiative: { metric: 'At-risk ARR, Analytics Suite', target: '10% by 31 Dec 2026' } },
};

export const ACT_REJECTED: AgentAction = {
  ...base,
  id: 86,
  bundle: 1086,
  agent: 'cs',
  kind: 'note.create',
  title: 'Note what the last call settled',
  status: 'rejected',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { note: { title: 'Call recap, 6 Oct' } },
  decided_by: { id: 2, name: 'Mona Manager' },
  decided_at: '2026-10-07T11:00:00Z',
};

export const ACT_EXPIRED: AgentAction = {
  ...base,
  id: 87,
  bundle: 1087,
  agent: 'sales',
  kind: 'record.owner',
  title: 'Give Uber EMEA to Dana CSM',
  status: 'expired',
  record: { kind: 'account', id: 9, name: 'Uber EMEA' },
  evidence: [{ label: 'Owner left the team', link: '/accounts/9' }],
  preview: { field: 'Owner', from: 'Carl CSM', to: 'Dana CSM' },
};

/** A task the reader can't open: the server swaps its title and sends no id. */
export const ACT_TASK_HIDDEN: AgentAction = {
  ...base,
  id: 88,
  bundle: 1088,
  agent: 'ops',
  kind: 'task.reassign',
  title: 'Give the QBR deck to Carl CSM',
  status: 'applied',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { task: { id: null, title: "A task you can't see" }, field: 'Assignee', from: 'Dana CSM', to: 'Carl CSM' },
  applied_at: '2026-10-08T00:44:00Z',
};

/** A task deleted since: the server names it "A removed task" and sends no id. */
export const ACT_TASK_REMOVED: AgentAction = {
  ...base,
  id: 89,
  bundle: 1089,
  agent: 'cs',
  kind: 'task.snooze',
  title: 'Snooze the roadmap review to 1 Nov',
  status: 'applied',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { task: { id: null, title: 'A removed task' }, field: 'Due date', from: '2026-10-25', to: '2026-11-01' },
  applied_at: '2026-10-08T00:45:00Z',
};

/** The ids the drafts and plans stubs use for what these actions make. */
export const DRAFT_EMAIL_ID = 7;
export const DRAFT_TICKET_ID = 8;
export const STARTED_PLAN_ID = 31;

/** Applied by Auto: the CS agent drafted Alice's reply to Ann Lee (delivery 2). */
export const ACT_DRAFT_REPLY: AgentAction = {
  ...base,
  id: 90,
  bundle: 1090,
  agent: 'cs',
  kind: 'draft.reply',
  title: 'Draft a reply to Ann Lee about the renewal',
  status: 'applied',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'Ann asked about the renewal terms 2 days ago and has no answer.',
  evidence: [{ label: 'Email from Ann Lee, 6 Oct', link: '/organizations/7' }],
  preview: {
    draft: {
      channel: 'email',
      to: 'Ann Lee <ann@x.com>',
      subject: 'Re: Renewal terms',
      excerpt: 'Hi Ann,\n\nThanks for the note on the renewal terms. I will send the revised order form by Friday.',
    },
  },
  auto: true,
  applied_at: '2026-10-08T00:46:00Z',
  undo: { allowed: true, until: '2026-10-15T00:46:00Z', reason: null },
  result: { ...base.result, draft_id: DRAFT_EMAIL_ID },
};

/** Waiting for a decision: a reply on a Zendesk ticket. */
export const ACT_DRAFT_TICKET: AgentAction = {
  ...base,
  id: 91,
  bundle: 1091,
  agent: 'cs',
  kind: 'draft.reply',
  title: 'Draft a reply on TKT-1042',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'The export ticket has waited 7 days for an answer.',
  evidence: [{ label: 'TKT-1042, open since 1 Oct', link: '/organizations/7' }],
  preview: { draft: { channel: 'ticket', ticket: 'TKT-1042', subject: 'Export fails', excerpt: 'Hi Ann, the export fix ships on Thursday.' } },
};

/** Waiting for a decision (Ask is its cap): the Onboarding plan on Pizza Hut. */
export const ACT_PLAN_START: AgentAction = {
  ...base,
  id: 92,
  bundle: 1092,
  agent: 'cs',
  kind: 'plan.start',
  title: 'Start the Onboarding plan on Pizza Hut',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'Pizza Hut went live 3 days ago and has no onboarding plan.',
  evidence: [{ label: 'Live since 5 Oct', link: '/organizations/7' }],
  preview: { plan: { template: 'Onboarding', milestones: 3, tasks: 9 } },
};

/** The ids the stub gives what a builder action makes (Agents delivery 3). */
export const BUILT_SEGMENT_ID = 61;
export const BUILT_RULE_ID = 62;
export const BUILT_CAMPAIGN_ID = 63;
export const BUILT_CANVAS_ID = 64;
export const BUILT_TEMPLATE_ID = 65;

/** `made_by` on an object the Ops agent made and Alice approved. */
export const MADE_BY_OPS: MadeBy = { agent: 'ops', approved_by: { id: 1, name: 'Alice' } };

const WORKSPACE_FIGURES = [{ label: 'Workspace figures: 12 organisations renew within 60 days with poor health', link: null }];

/** Waiting for a view-all reader: a private segment for its approver. */
export const ACT_SEGMENT_CREATE: AgentAction = {
  ...base,
  id: 94,
  bundle: 1094,
  agent: 'ops',
  kind: 'segment.create',
  title: 'Build a segment of poor health renewals',
  status: 'proposed',
  record: null,
  rationale: 'Twelve organisations renew within 60 days with poor health, and no segment follows them.',
  evidence: WORKSPACE_FIGURES,
  preview: { segment: { kind: 'customer', name: 'Poor health renewals', conditions: 2, members: 12 } },
};

/** Waiting: a rule, switched off, with its own segment. */
export const ACT_SCENARIO_CREATE: AgentAction = {
  ...base,
  id: 95,
  bundle: 1095,
  agent: 'ops',
  kind: 'scenario.create',
  title: 'Build a scenario that tasks the owner of a poor health renewal',
  status: 'proposed',
  record: null,
  rationale: 'Poor health renewals get no task until someone notices them.',
  evidence: WORKSPACE_FIGURES,
  preview: { scenario: { name: 'Health watch', segment: 'Poor health renewals', trigger: 'Entered the segment', steps: ['Task the owner', 'Notify me'] } },
};

/** Waiting: a campaign draft, with its own segment. */
export const ACT_CAMPAIGN_CREATE: AgentAction = {
  ...base,
  id: 96,
  bundle: 1096,
  agent: 'ops',
  kind: 'campaign.create',
  title: 'Draft a check-in campaign to champions of at-risk organisations',
  status: 'proposed',
  record: null,
  rationale: 'Champions at at-risk organisations have not heard from us in 60 days.',
  evidence: WORKSPACE_FIGURES,
  preview: {
    campaign: {
      name: 'Champion check-in',
      segment: 'At-risk organisations',
      roles: ['Champion'],
      subject: 'Checking in, {first_name}',
      excerpt: 'Hi {first_name},\n\nCould we find 20 minutes next week to talk through the renewal?',
    },
  },
};

/** Waiting on the record's owner: a map of Pizza Hut's people, no links. */
export const ACT_CANVAS_CREATE: AgentAction = {
  ...base,
  id: 97,
  bundle: 1097,
  agent: 'cs',
  kind: 'canvas.create',
  title: 'Map the people at Pizza Hut',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'Pizza Hut has six people on record and no map.',
  evidence: [{ label: 'people: 6 (decision maker 1, champion 2, other 3)', link: '/organizations/7' }],
  preview: { canvas: { name: 'Pizza Hut people', people: 6 } },
};

/** Waiting: a workspace-shared save-plan template. */
export const ACT_PLAN_TEMPLATE: AgentAction = {
  ...base,
  id: 98,
  bundle: 1098,
  agent: 'ops',
  kind: 'plan.template',
  title: 'Write a save-plan template for at-risk renewals',
  status: 'proposed',
  record: null,
  rationale: 'Five save plans this quarter were built by hand with the same steps.',
  evidence: WORKSPACE_FIGURES,
  preview: { template: { kind: 'save', name: 'Save play for at-risk renewals', milestones: 3, tasks: 9 } },
};

/** Newest first, as the list answers. */
export const ACTIONS: AgentAction[] = [ACT_EXPIRED, ACT_REJECTED, ACT_INITIATIVE, ACT_UNDONE, ACT_APPLIED_AUTO, ACT_TASK_CREATE, ACT_LIFECYCLE];
