import type { StoryGroup, StoryKind } from './storyTypes';

/** The story's filters in toolbar order (spec §1.6). '' is All. */
export const STORY_GROUPS: { key: StoryGroup | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'tasks', label: 'Tasks & notes' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'health', label: 'Health & usage' },
];

export const GROUP_KEYS: StoryGroup[] = ['conversations', 'tickets', 'tasks', 'feedback', 'health'];

/** Every exact kind the story reads today, with its group (spec §1, "Where
 *  today's 13 feed filters go"). A source with no real data (in-app
 *  conversations, Revenact Support) is not listed until it is real. */
export const STORY_KINDS: { kind: StoryKind; label: string; group: StoryGroup }[] = [
  { kind: 'call', label: 'Calls', group: 'conversations' },
  { kind: 'activity', label: 'Activities', group: 'conversations' },
  { kind: 'email', label: 'Emails', group: 'conversations' },
  { kind: 'slack', label: 'Slack', group: 'conversations' },
  { kind: 'calendar_event', label: 'Calendar events', group: 'conversations' },
  { kind: 'ticket', label: 'Tickets', group: 'tickets' },
  { kind: 'task', label: 'Tasks', group: 'tasks' },
  { kind: 'note', label: 'Notes', group: 'tasks' },
  { kind: 'survey', label: 'Surveys', group: 'feedback' },
  { kind: 'health', label: 'Health changes', group: 'health' },
];

export const KIND_GROUP = Object.fromEntries(STORY_KINDS.map((k) => [k.kind, k.group])) as Record<StoryKind, StoryGroup>;

/** One item's kind in words, for its meta line ("Email · Carl CSM"). */
export const KIND_NAME: Record<StoryKind, string> = {
  call: 'Call',
  activity: 'Activity',
  email: 'Email',
  slack: 'Slack thread',
  calendar_event: 'Calendar event',
  ticket: 'Ticket',
  task: 'Task',
  note: 'Note',
  survey: 'Survey',
  health: 'Health change',
};

export function isStoryKind(value: string): value is StoryKind {
  return STORY_KINDS.some((k) => k.kind === value);
}

export function isStoryGroup(value: string): value is StoryGroup {
  return (GROUP_KEYS as string[]).includes(value);
}

/** The kinds a group covers; every kind for All. */
export function kindsIn(group: StoryGroup | ''): StoryKind[] {
  return STORY_KINDS.filter((k) => !group || k.group === group).map((k) => k.kind);
}

/** The Sources picker's kinds: the group's kinds that have data (`by_kind`,
 *  the backend's "a source with no real data never appears in Sources"),
 *  plus any already chosen so it can be unchosen. Every kind until the
 *  counts land. */
export function offeredSources(
  group: StoryGroup | '',
  byKind: Record<StoryKind, number> | null,
  selected: StoryKind[],
): StoryKind[] {
  return kindsIn(group).filter((kind) => !byKind || byKind[kind] > 0 || selected.includes(kind));
}

/** Where a record came from, in words: the provider values of the backend's
 *  `Connector.Provider` and `MailboxConnection.Provider`. A record logged in
 *  Revenact names no source (''); an unknown provider reads as it came. */
const SOURCE_NAMES: Record<string, string> = {
  revenact: '',
  zendesk: 'Zendesk',
  jira: 'Jira',
  freshdesk: 'Freshdesk',
  webhook: 'Webhook',
  intercom: 'Intercom',
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
  slack: 'Slack',
  gmail: 'Gmail',
  ms_teams: 'Microsoft Teams',
  zoom: 'Zoom',
  github: 'GitHub',
  figma: 'Figma',
  google: 'Gmail',
  microsoft: 'Outlook',
  imap: 'IMAP',
};

export function sourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}

/** "+ Add" on the story (spec §1.6): the existing create flows. Activity has
 *  no create endpoint; a call has one (POST /customers/{id}/calls/ and the
 *  account's), which CallSense's "Log a call" uses, so it stands in for
 *  "Log activity". */
export type AddKind = 'call' | 'task' | 'note' | 'survey' | 'meeting';
export const ADD_FLOWS: { key: AddKind; label: string }[] = [
  { key: 'call', label: 'Log a call' },
  { key: 'task', label: 'New task' },
  { key: 'note', label: 'New note' },
  { key: 'survey', label: 'Log survey' },
  // Google Calendar delivery 3: needs an organisation to book on.
  { key: 'meeting', label: 'Schedule meeting' },
];
