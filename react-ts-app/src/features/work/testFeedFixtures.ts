// Test-only: the feed's items for Alice (id 1) on 7 Oct 2026, in the
// contract's shapes (2026-10-12-work-one-place-api.md §2.2). Times sit at
// noon UTC so the day reads the same in any test time zone.
import { B_PIZZA, TEAM_BUNDLE, bundleItem } from '../agents/testBundleFixtures';
import { MY_REVIEW_DETAIL } from '../brain/testDeskFixtures';
import { ALICE, CARL, CARL_CHASE, UBER, recRow, refOf, taskDetail } from './testWorkFixtures';
import type {
  DraftFeedItem,
  FeedFrom,
  FeedItem,
  PersonRef,
  QuestionFeedItem,
  RecommendationRow,
  ReviewFeedItem,
  SuggestionFeedItem,
  TaskDetail,
  TaskFeedItem,
  TaskRow,
} from './workTypes';

const NONE = { due_date: null, priority: null, private: false } as const;

export const BUNDLE_ITEM = bundleItem(B_PIZZA);

export const REVIEW: ReviewFeedItem = {
  ...NONE,
  key: 'rule_review:14',
  kind: 'rule_review',
  id: 14,
  title: 'Survey from Detractor follow-up',
  record: null,
  from: { type: 'rule', label: 'Detractor follow-up' },
  at: '2026-10-03T12:00:00Z',
  actions: ['approve', 'skip'],
  detail: MY_REVIEW_DETAIL,
};

export const QUESTION: QuestionFeedItem = {
  ...NONE,
  key: 'question:31',
  kind: 'question',
  id: 31,
  title: 'Who signs off renewals at Uber?',
  record: { type: 'customer', id: 3, name: 'Uber' },
  from: { type: 'person', label: 'Bob Sales' },
  at: '2026-10-04T12:00:00Z',
  actions: ['answer'],
  detail: { text: 'Who signs off renewals at Uber? Legal asked twice.', asked_by: { id: 9, name: 'Bob Sales' } },
};

export const DRAFT: DraftFeedItem = {
  ...NONE,
  key: 'draft:7',
  kind: 'draft',
  id: 7,
  title: 'Re: renewal terms',
  record: { type: 'customer', id: 7, name: 'Pizza Hut' },
  from: { type: 'agent', label: 'CS agent' },
  at: '2026-10-05T12:00:00Z',
  actions: ['open'],
  detail: { channel: 'email' },
};

/** Oldest first, as the decide group orders them. */
export const DECIDE_ITEMS: FeedItem[] = [REVIEW, QUESTION, DRAFT, BUNDLE_ITEM];

/** Alice's one to-do: no record, no date. */
export const TODO_ROOM: TaskDetail = taskDetail({
  id: 60,
  title: 'Book the QBR room',
  due_date: null,
  parent: null,
  created_by: refOf(ALICE),
  created_at: '2026-10-06T12:00:00.000000Z',
  editable: ['title', 'description', 'status', 'due_date', 'priority', 'assignee', 'record'],
});
export const TODOS: TaskDetail[] = [TODO_ROOM];

export function taskRow(task: TaskDetail): TaskRow {
  const { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan } = task;
  return { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan, private: parent === null };
}

function fromOf(task: TaskDetail): FeedFrom {
  if (task.source === 'agent') return { type: 'agent', label: 'AI agent' };
  if (task.source === 'rule') return { type: 'rule', label: 'A rule' };
  if (task.source === 'recommendation') return { type: 'revenact', label: 'Revenact' };
  return task.created_by ? { type: 'person', label: task.created_by.name } : { type: 'revenact', label: 'Revenact' };
}

/** A task or to-do as the feed lists it (contract §2.2). */
export function taskItem(task: TaskDetail): TaskFeedItem {
  return {
    key: `task:${task.id}`,
    kind: task.parent ? 'task' : 'todo',
    id: task.id,
    title: task.title,
    record: task.parent ? { type: task.parent.kind, id: task.parent.id, name: task.parent.name } : null,
    from: fromOf(task),
    at: task.created_at,
    due_date: task.due_date,
    priority: task.priority,
    private: task.parent === null,
    actions: ['done', 'open'],
    detail: taskRow(task),
  };
}

export function suggestionItem(row: RecommendationRow): SuggestionFeedItem {
  return {
    ...NONE,
    key: `recommendation:${row.id}`,
    kind: 'suggestion',
    id: row.id,
    title: row.title,
    record: row.record ? { type: row.record.kind, id: row.record.id, name: row.record.name } : null,
    from: { type: 'revenact', label: 'Revenact' },
    at: row.created_at,
    actions: ['add', 'assign', 'dismiss'],
    detail: row,
  };
}

// The Team queue (delivery 2 contract §1): Carl's items, which Alice (above him) may decide.

/** A Team queue item (delivery 2 contract §1.4): `for` and, when given, its actions. */
export function teamItem<T extends FeedItem>(item: T, person: PersonRef | null, actions?: T['actions']): T {
  return { ...item, for: person, ...(actions ? { actions } : {}) };
}

/** A suggestion in Carl's queue, which Alice (above him) may decide. */
export const TEAM_REC: RecommendationRow = recRow({
  id: 61,
  kind: 'health_drop',
  title: "Look into Uber EMEA's health",
  record: UBER,
  recipient: refOf(CARL),
  suggested_assignee: { ...refOf(CARL), active: true, can_open: true },
});

export const TEAM_BUNDLE_ITEM = teamItem(bundleItem(TEAM_BUNDLE), refOf(CARL));
export const TEAM_QUESTION = teamItem({ ...QUESTION, id: 72, key: 'question:72' }, refOf(CARL), []);
export const TEAM_TASK = teamItem(taskItem(CARL_CHASE), refOf(CARL), ['open']);
export const TEAM_SUGGESTION = teamItem(suggestionItem(TEAM_REC), refOf(CARL), ['assign', 'dismiss']);
export const TEAM_ITEMS: FeedItem[] = [TEAM_BUNDLE_ITEM, TEAM_QUESTION, TEAM_TASK, TEAM_SUGGESTION];
