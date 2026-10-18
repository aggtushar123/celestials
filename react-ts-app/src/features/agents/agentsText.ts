// Agents' words and rules (deliveries 1 to 3), kept free of React so they are
// unit-tested on their own. Sentence case, no em dash.
import { formatDate } from '../customers/formatters';
import { KIND_LABEL as PLAN_KIND_LABEL } from '../plans/planOptions';
import { KIND_NOUN } from '../segments/segmentFields';
import { ACTION_KINDS, AGENT_KINDS } from './agentTypes';
import { whenText } from './whenText';
import type {
  ActionKind,
  ActionKindSpec,
  ActionLevel,
  ActionResult,
  ActionStatus,
  AgentAction,
  AgentCard,
  AgentKind,
  AgentSettings,
  AgentSettingsPatch,
  Levels,
  MadeBy,
  ScenarioPreview,
  SkippedReason,
  UndoReason,
} from './agentTypes';

export const AGENTS = {
  SETTINGS_TITLE: 'Agents',
  SETTINGS_INTRO: 'Three agents read the workspace each night and customer messages on the schedule below. They propose or apply actions within the budget and the rules you set here.',
  ACTIONS_TITLE: 'Actions & approvals',
  ACTIONS_INTRO: 'What each agent may do on its own (Auto), only with a person (Ask), or never.',
  GRID_TITLE: 'What each agent may do',
  WORKSPACE_AI: 'Workspace AI',
  AGENT_SWITCH: 'This agent',
  LOAD: 'Could not load the agent settings.',
  LOADING: 'Loading the agent settings',
  READ_ONLY: 'Only admins can change these.',
  AI_SWITCH: 'AI for this workspace',
  AI_OFF: "AI is off for this workspace: agents don't run.",
  AI_DETAIL: 'Off stops every agent, Copilot and the other AI features.',
  TONE: 'Tone',
  ON: 'On',
  OFF: 'Off',
  BUDGET: 'Monthly credits',
  SAVE_FAILED: 'Could not save these settings.',
  RUN: 'Run now',
  RUNNING: 'Running…',
  RUN_FAILED: 'Could not run this agent.',
  ALWAYS_ASKS: 'Always asks',
  CANT_UNDO: "Can't be undone",
  NOT_USED: 'Not used',
  NEVER_NOTE: "Setting an action to Never also expires that agent's waiting actions of that kind.",
  ACTION: 'Action',
  WHAT_EACH_DOES: 'What each action does',
  ACTIVITY_LOAD: 'Could not load agent activity.',
  ACTIVITY_LOADING: 'Loading agent activity',
  ACTIVITY_LIST: 'Agent actions',
  EMPTY_TITLE: 'No agent actions yet',
  EMPTY_DETAIL: 'What the CS, Sales and Ops agents propose or apply shows here, with Undo for 7 days.',
  EMPTY_FILTERED_TITLE: 'Nothing matches these filters',
  CLEAR_FILTERS: 'Clear filters',
  ALL_AGENTS: 'All agents',
  ALL_ACTIONS: 'All actions',
  ALL_STATUSES: 'All statuses',
  AGENT: 'Agent',
  STATUS: 'Status',
  PREVIOUS: 'Previous',
  NEXT: 'Next',
  APPLY: 'Apply',
  REJECT: 'Reject',
  REJECT_IT: 'Reject it',
  CANCEL: 'Cancel',
  WHY_NOT: 'Why not? (optional)',
  NOTE_HINT: 'Up to 255 characters.',
  WORKING: 'Working…',
  UNDO: 'Undo',
  UNDOING: 'Undoing…',
  WHY: 'Why',
  EVIDENCE: 'Evidence',
  DECIDE_FAILED: 'Could not record that decision. Try again.',
  UNDO_FAILED: 'Could not undo that. Try again.',
  OPEN_TASK: 'Open task',
  OPEN_DRAFT: 'Open draft',
  OPEN_PLAN: 'Open plan',
  OPEN_SEGMENT: 'Open segment',
  OPEN_SCENARIO: 'Open scenario',
  OPEN_CAMPAIGN: 'Open campaign',
  OPEN_MAP: 'Open map',
  OPEN_TEMPLATE: 'Open template',
  GONE: "That action isn't there any more.",
  // Only for a client pre-check before sending; the server's refusal is shown verbatim.
  NOTE_TOO_LONG: 'Keep the note under 255 characters.',
} as const;

export const AGENT_LABEL: Record<AgentKind, string> = { cs: 'CS agent', sales: 'Sales agent', ops: 'Ops agent' };
export const LEVEL_LABEL: Record<ActionLevel, string> = { auto: 'Auto', ask: 'Ask', never: 'Never' };
export const STATUS_LABEL: Record<ActionStatus, string> = {
  proposed: 'Waiting for a decision',
  applied: 'Applied',
  rejected: 'Rejected',
  expired: 'Expired',
  undone: 'Undone',
  failed: 'Failed',
  skipped: 'Skipped',
};
/** The contract's labels, for the filters before settings are read. */
export const KIND_LABEL: Record<ActionKind, string> = {
  'record.lifecycle': 'Change lifecycle stage',
  'record.owner': 'Change owner',
  'record.attribute': 'Set an AI attribute',
  'task.create': 'Create a task',
  'task.reassign': 'Reassign a task',
  'task.redate': "Change a task's due date",
  'task.complete': 'Mark a task done',
  'task.snooze': 'Snooze a task',
  'note.create': 'File a note',
  'draft.reply': 'Draft a reply',
  'plan.start': 'Start a plan',
  'segment.create': 'Build a segment',
  'scenario.create': 'Build a scenario',
  'campaign.create': 'Draft a campaign',
  'campaign.send': 'Send a campaign',
  'survey.send': 'Send a survey',
  'mail.send_reply': 'Send an email reply',
  'slack.reply': 'Reply in Slack',
  'jira.create': 'Create a Jira issue',
  'jira.assign': 'Assign a Jira issue',
  'jira.comment': 'Comment on a Jira issue',
  'canvas.create': "Map a record's people",
  'plan.template': 'Write a plan template',
  'survey.record': 'Send a survey to this customer',
  'segment.pin': 'Add to a segment',
  'scenario.run': 'Run a scenario',
  'record.diagnose': 'Diagnose',
  'mail.compose': 'Write an email',
  'mail.send_draft': 'Send it',
  'report.sales': 'Prepare the sales report',
  'initiative.create': 'Start an initiative',
};

/** A step kind in a word or two, for a chain of chips (Work's Ready to run). */
export const SHORT_KIND_LABEL: Record<ActionKind, string> = {
  'record.lifecycle': 'Lifecycle',
  'record.owner': 'Owner',
  'record.attribute': 'AI attribute',
  'task.create': 'To-do',
  'task.reassign': 'Reassign',
  'task.redate': 'New date',
  'task.complete': 'Done',
  'task.snooze': 'Snooze',
  'note.create': 'Note',
  'draft.reply': 'Draft',
  'plan.start': 'Plan',
  'segment.create': 'Segment',
  'scenario.create': 'Scenario',
  'campaign.create': 'Campaign draft',
  'campaign.send': 'Campaign',
  'survey.send': 'Survey',
  'mail.send_reply': 'Email reply',
  'slack.reply': 'Reply',
  'jira.create': 'Jira',
  'jira.assign': 'Jira assign',
  'jira.comment': 'Jira comment',
  'canvas.create': 'Canvas',
  'plan.template': 'Plan template',
  'survey.record': 'Survey',
  'segment.pin': 'Segment',
  'scenario.run': 'Scenario',
  'record.diagnose': 'Diagnose',
  'mail.compose': 'Email',
  'mail.send_draft': 'Send',
  'report.sales': 'Sales report',
  'initiative.create': 'Initiative',
};

const KIND_BY_LABEL = new Map(Object.entries(KIND_LABEL).map(([kind, label]) => [label, kind as ActionKind]));

/** A bundle's step label (a KIND_LABEL value, or the kind itself) in its short form; anything else as it came. */
export function shortStepLabel(label: string): string {
  const kind = KIND_BY_LABEL.get(label) ?? (Object.hasOwn(SHORT_KIND_LABEL, label) ? (label as ActionKind) : null);
  return kind ? SHORT_KIND_LABEL[kind] : label;
}

const RANKED: readonly ActionLevel[] = ['auto', 'ask', 'never'];

/** The levels a cell may offer: never above the kind's `max_level`. */
export function levelsUpTo(max: ActionLevel): ActionLevel[] {
  return RANKED.slice(RANKED.indexOf(max));
}

const LEADING_DATE = /^(\d{4}-\d{2}-\d{2})(.*)$/;
/** A display value: a date (or a leading date, as in a snooze's "(snoozed: reason)") is formatted. */
const shown = (value: string | null | undefined): string => {
  if (!value) return 'Nobody';
  const match = LEADING_DATE.exec(value);
  return match ? `${formatDate(match[1])}${match[2]}` : value;
};

const counted = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/** One line for what the action does or did. */
export function previewText(action: AgentAction): string {
  const p = action.preview;
  if (action.kind === 'task.create' && p.task) {
    const parts = [p.task.title];
    if (p.task.assignee) parts.push(`for ${p.task.assignee.name}`);
    if (p.task.due_date) parts.push(`due ${formatDate(p.task.due_date)}`);
    if (p.task.priority) parts.push(`${p.task.priority} priority`);
    return `Create a task: ${parts.join(', ')}`;
  }
  if (action.kind === 'note.create' && p.note) return `File a note: ${p.note.title}`;
  if (action.kind === 'initiative.create' && p.initiative) return `Start an initiative: ${p.initiative.metric}, target ${p.initiative.target}`;
  if (action.kind === 'draft.reply' && p.draft) {
    return p.draft.channel === 'email' ? `Draft a reply to ${p.draft.to}: ${p.draft.subject}` : `Draft a reply on ${p.draft.ticket}: ${p.draft.subject}`;
  }
  if (action.kind === 'plan.start' && p.plan) return `Start a plan: ${p.plan.template}, ${counted(p.plan.milestones, 'milestone')}, ${counted(p.plan.tasks, 'task')}`;
  if (action.kind === 'segment.create' && p.segment) {
    const noun = KIND_NOUN[p.segment.kind] ?? { one: p.segment.kind, many: p.segment.kind };
    return `Build a segment: ${p.segment.name}, ${counted(p.segment.conditions, 'condition')}, ${p.segment.members} ${p.segment.members === 1 ? noun.one : noun.many}`;
  }
  if (action.kind === 'scenario.create' && p.scenario) return `Build a scenario: ${p.scenario.name}, on ${p.scenario.segment}`;
  if ((action.kind === 'campaign.create' || action.kind === 'campaign.send') && p.campaign) {
    const audience = [p.campaign.segment, ...p.campaign.roles].join(', ');
    const verb = action.kind === 'campaign.send' ? 'Send a campaign' : 'Draft a campaign';
    return `${verb}: ${p.campaign.name} (${audience}): ${p.campaign.subject}`;
  }
  if (action.kind === 'survey.send' && p.survey) {
    const audience = [p.survey.segment, ...p.survey.roles].join(', ');
    return `Send a survey: ${p.survey.name} (${audience}): ${p.survey.subject}`;
  }
  if (action.kind === 'survey.record' && p.record_survey) {
    const s = p.record_survey;
    const who = s.roles.length > 0 ? s.roles.join(', ') : 'contacts';
    const head = `Send a ${s.survey_type.toUpperCase()} survey to ${s.record}'s ${who}: ${s.subject}`;
    if (s.timing !== 'after_jira') return head;
    return `${head}, when ${s.issue || 'the Jira issue'} is resolved`;
  }
  if (action.kind === 'segment.pin' && p.segment_pin) {
    const pin = p.segment_pin;
    return `Add ${pin.record} to ${pin.segment.name}, ${counted(pin.segment.members, 'member')}`;
  }
  if (action.kind === 'record.diagnose' && p.diagnose) return p.diagnose.summary ? p.diagnose.summary : `Diagnose what is going on with ${p.diagnose.record}`;
  if (action.kind === 'mail.compose' && p.compose) return p.compose.to ? `Write an email to ${p.compose.to.name} about ${p.compose.record}` : `Write an email about ${p.compose.record}`;
  if (action.kind === 'mail.send_draft' && p.send) {
    if (!p.send.to) return 'Send the email once it is written';
    const head = `${p.send.sent ? 'Sent the email' : 'Send the email'} to ${p.send.to.name}`;
    return p.send.subject ? `${head}: ${p.send.subject}` : head;
  }
  if (action.kind === 'report.sales' && p.sales_report) return `Prepare the sales report for ${p.sales_report.meeting.title}, last 30 days`;
  if (action.kind === 'scenario.run' && p.scenario_run) return `Run ${p.scenario_run.scenario.name} on ${p.scenario_run.record}`;
  if (action.kind === 'canvas.create' && p.canvas) return `Map a record's people: ${p.canvas.name}, ${p.canvas.people === 1 ? '1 person' : `${p.canvas.people} people`}`;
  if (action.kind === 'plan.template' && p.template) {
    return `Write a plan template: ${p.template.name} (${PLAN_KIND_LABEL[p.template.kind]}), ${counted(p.template.milestones, 'milestone')}, ${counted(p.template.tasks, 'task')}`;
  }
  if (action.kind === 'mail.send_reply' && p.mail) return `Send a reply to ${p.mail.to.join(', ')}: ${p.mail.subject}`;
  if (action.kind === 'slack.reply' && p.slack) return p.slack.in_thread ? `Reply in Slack in ${p.slack.channel}, in the thread` : `Post in Slack in ${p.slack.channel}`;
  if (action.kind === 'jira.create' && p.jira) return `Create a Jira ${p.jira.issue_type}${p.jira.project ? ` in ${p.jira.project}` : ''}: ${p.jira.summary}`;
  if (action.kind === 'jira.comment' && p.jira_comment) {
    const later = /^\{\{\s*step\s+(\d+)\./.exec(p.jira_comment.issue);
    return later ? `Comment in Jira on the issue from step ${later[1]}` : `Comment on ${p.jira_comment.issue} in Jira`;
  }
  if (action.kind === 'jira.assign' && p.jira_assign) return `Assign ${p.jira_assign.issue} in Jira${p.jira_assign.assignee ? ` to ${p.jira_assign.assignee.name}` : ''}`;
  if (p.task && p.field) return `${p.task.title}: ${taskChangeText(action)}`;
  return `${p.field ?? KIND_LABEL[action.kind]}: ${shown(p.from)} → ${shown(p.to)}`;
}

/** A reply draft's place on Communications (Decision 1). */
export const draftHref = (id: number): string => `/communications?draft=${id}`;

/** A scenario's trigger and steps, the server's sentences joined as they come (Decision 1). */
export const scenarioStepsText = (scenario: ScenarioPreview): string => [scenario.trigger, ...scenario.steps].join(' \u00b7 ');

type BuiltKey = keyof Pick<ActionResult, 'rule_id' | 'campaign_id' | 'segment_id' | 'canvas_id' | 'template_id'>;

/** What a builder action made, in the order a row lists it (Decision 2). */
const BUILT: readonly { key: BuiltKey; label: string; href: (id: number) => string }[] = [
  { key: 'rule_id', label: AGENTS.OPEN_SCENARIO, href: (id) => `/scenarios/rules/${id}` },
  { key: 'campaign_id', label: AGENTS.OPEN_CAMPAIGN, href: (id) => `/campaigns/${id}` },
  { key: 'segment_id', label: AGENTS.OPEN_SEGMENT, href: (id) => `/segments/${id}` },
  { key: 'canvas_id', label: AGENTS.OPEN_MAP, href: (id) => `/canvas/${id}` },
  // Templates have no page of their own: the editor is where one opens.
  { key: 'template_id', label: AGENTS.OPEN_TEMPLATE, href: (id) => `/projects/templates/${id}/edit` },
];

/** Links to what an action built, only while it is applied: undo deletes them. */
export function builtLinks(action: AgentAction): { label: string; to: string }[] {
  if (action.status !== 'applied') return [];
  return BUILT.flatMap(({ key, label, href }) => {
    const id = action.result[key];
    return id == null ? [] : [{ label, to: href(id) }];
  });
}

/** "Made by the Ops agent, approved by Alice" (contract "Made by the agent"). */
export const madeByText = (madeBy: MadeBy): string =>
  `Made by the ${AGENT_LABEL[madeBy.agent]}${madeBy.approved_by ? `, approved by ${madeBy.approved_by.name}` : ''}`;

/** A task kind's change, without the task title in front: "Due date 7 Oct 2026 → 20 Oct 2026". */
export function taskChangeText(action: AgentAction): string {
  const p = action.preview;
  return `${p.field ?? KIND_LABEL[action.kind]} ${shown(p.from)} → ${shown(p.to)}`;
}

const nameFor = (person: { id: number; name: string } | null, me: number | null) => (!person ? 'someone' : person.id === me ? 'you' : person.name);

export function statusText(action: AgentAction, me: number | null): string {
  if (action.status === 'proposed') return STATUS_LABEL.proposed;
  if (action.status === 'expired') return STATUS_LABEL.expired;
  if (action.status === 'undone') return `Undone by ${nameFor(action.undone_by, me)}`;
  if (action.status === 'rejected') return `Rejected by ${nameFor(action.decided_by, me)}`;
  if (action.auto) return 'Applied automatically';
  return action.decided_by ? `Applied by ${nameFor(action.decided_by, me)}` : STATUS_LABEL.applied;
}

export function undoReasonText(reason: UndoReason): string {
  if (reason === 'expired') return 'Undo was available for 7 days.';
  if (reason === 'irreversible') return "Can't be undone.";
  if (reason === 'cant_decide') return 'Only someone who could approve this can undo it.';
  return 'This has changed since it applied.';
}

export const changedSinceText = (current: string, applied: string): string => `Now: ${current} · Agent set: ${applied}`;

export function skippedText(reason: SkippedReason, resetsOn: string): string {
  if (reason === 'ai_off') return 'AI is switched off for this workspace.';
  if (reason === 'disabled') return 'Switched off.';
  if (reason === 'no_actions') return 'Every action is set to never.';
  if (reason === 'budget') return `Budget used up: resumes on ${formatDate(resetsOn)}.`;
  if (reason === 'credits') return 'Workspace credits are used up.';
  return 'The last run failed. Try Run now.';
}

export function lastRunText(card: AgentCard): string {
  const run = card.last_run;
  if (!run) return 'Has not run yet.';
  if (run.skipped_reason) return skippedText(run.skipped_reason, card.resets_on);
  return `Last run ${formatDate(run.at.slice(0, 10))}: ${run.proposed} proposed, ${run.applied} applied`;
}

export const budgetText = (card: AgentCard): string =>
  `${card.spent_this_month} of ${card.monthly_credits} credits this month · resets on ${formatDate(card.resets_on)}`;

/** Contract D2-23: conversations the agent would read, waiting on credits. */
export function waitingText(card: AgentCard): string | null {
  const n = card.waiting_threads;
  if (!n || !card.waiting_reason) return null;
  const head = n === 1 ? '1 conversation is waiting' : `${n} conversations are waiting`;
  const why = card.waiting_reason === 'budget' ? `this agent's credits are used up until ${formatDate(card.resets_on)}` : 'the workspace is out of AI credits';
  return `${head}: ${why}.`;
}

const SHORT_AGENT: Record<AgentKind, string> = { cs: 'CS', sales: 'Sales', ops: 'Ops' };

export function runAnswerText(card: AgentCard): string {
  const run = card.last_run;
  const name = `The ${SHORT_AGENT[card.kind]} agent`;
  if (!run) return `${name} ran.`;
  if (run.skipped_reason === 'failed') return `${name} could not run. Try again.`;
  if (run.skipped_reason) return `${name} did not run. ${skippedText(run.skipped_reason, card.resets_on)}`;
  return `${name} ran: ${run.proposed} proposed, ${run.applied} applied.`;
}

export function hiddenActivityText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more about a record you can't open" : `${n} more about records you can't open`;
}

export const waitingKindLabel = (action: AgentAction): string => `${AGENT_LABEL[action.agent]} · ${KIND_LABEL[action.kind]}`;

// The Settings › Agents form (Decision 7).

export interface AgentsDraft {
  ai_enabled: boolean;
  tone: AgentSettings['tone'];
  cs: { enabled: boolean; budget: string };
  sales: { enabled: boolean; budget: string };
  ops: { enabled: boolean; budget: string };
}

export function agentsDraftOf(settings: AgentSettings): AgentsDraft {
  const of = (kind: AgentKind) => {
    const card = settings.agents.find((c) => c.kind === kind);
    return { enabled: card?.enabled ?? false, budget: String(card?.monthly_credits ?? 0) };
  };
  return { ai_enabled: settings.ai_enabled, tone: settings.tone, cs: of('cs'), sales: of('sales'), ops: of('ops') };
}

const wholeIn = (text: string, max: number): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= max ? value : null;
};

/** The browser's own checks, in the contract's words: agent to message. */
export function validateAgents(draft: AgentsDraft, plan: number): Partial<Record<AgentKind, string>> {
  const errors: Partial<Record<AgentKind, string>> = {};
  for (const kind of AGENT_KINDS) {
    if (wholeIn(draft[kind].budget, plan) === null) errors[kind] = `Choose a whole number from 0 to ${plan}.`;
  }
  return errors;
}

/** Only what changed (call after validateAgents passed). */
export function agentsPatchOf(settings: AgentSettings, draft: AgentsDraft): AgentSettingsPatch {
  const patch: AgentSettingsPatch = {};
  if (draft.ai_enabled !== settings.ai_enabled) patch.ai_enabled = draft.ai_enabled;
  if (draft.tone !== settings.tone) patch.tone = draft.tone;
  for (const kind of AGENT_KINDS) {
    const card = settings.agents.find((c) => c.kind === kind);
    if (!card) continue;
    const change: { enabled?: boolean; monthly_credits?: number } = {};
    if (draft[kind].enabled !== card.enabled) change.enabled = draft[kind].enabled;
    const budget = wholeIn(draft[kind].budget, Number.MAX_SAFE_INTEGER);
    if (budget !== null && budget !== card.monthly_credits) change.monthly_credits = budget;
    if (Object.keys(change).length > 0) patch.agents = { ...patch.agents, [kind]: change };
  }
  return patch;
}

// Actions & approvals (Decision 6).

export function levelsDraftOf(settings: AgentSettings): Levels {
  return JSON.parse(JSON.stringify(settings.levels)) as Levels;
}

/** Whether the agent can use the kind (else the grid shows "Not used"). */
export const usesKind = (kinds: ActionKindSpec[], agent: AgentKind, kind: ActionKind): boolean =>
  kinds.some((k) => k.kind === kind && k.agents.includes(agent));

/** The highest level the kind allows (its `max_level`); `auto` when unknown. */
export const capFor = (kinds: ActionKindSpec[], kind: ActionKind): ActionLevel => kinds.find((k) => k.kind === kind)?.max_level ?? 'auto';

/** Only changed cells, clamped to the kind's cap, and none for a kind the agent does not use or a locked (outside) kind. */
export function levelsPatchOf(settings: AgentSettings, draft: Levels): AgentSettingsPatch {
  const levels: NonNullable<AgentSettingsPatch['levels']> = {};
  for (const agent of AGENT_KINDS) {
    for (const kind of ACTION_KINDS) {
      if (!usesKind(settings.kinds, agent, kind) || settings.kinds.find((k) => k.kind === kind)?.locked) continue;
      const wanted = draft[agent][kind];
      if (wanted === undefined) continue;
      const cap = capFor(settings.kinds, kind);
      const next = RANKED.indexOf(wanted) < RANKED.indexOf(cap) ? cap : wanted;
      if (next !== settings.levels[agent][kind]) levels[agent] = { ...levels[agent], [kind]: next };
    }
  }
  return Object.keys(levels).length > 0 ? { levels } : {};
}

export const SIGNALS_TEXT = {
  TITLE: 'Reading messages',
  HINT: 'Agents read new customer messages on this schedule, after a conversation has been quiet for 15 minutes. Each conversation read uses AI credits.',
  INTERVAL: 'How often',
  NOT_CONNECTED: 'Not connected',
  ON: AGENTS.ON,
  OFF: AGENTS.OFF,
  SAVE_FAILED: 'Could not save that. Try again.',
} as const;

export const lastReadText = (at: string | null): string => (at ? `Last read ${whenText(at)}.` : 'Not read yet.');
