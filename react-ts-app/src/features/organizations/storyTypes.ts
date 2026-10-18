// Mirrors GET /api/v1/organizations/{id}/story/. The backend is the source of
// truth: revenact-backend services/organizations/story/ (params.py, items.py,
// build.py) and its plan's Task 7 (attention). Change the two together.

/** The story's filter groups (`group`). All is the absence of one. */
export type StoryGroup = 'conversations' | 'tickets' | 'tasks' | 'feedback' | 'health';

/** The exact record kinds (`source` takes a comma list of these). */
export type StoryKind =
  | 'activity'
  | 'calendar_event'
  | 'call'
  | 'email'
  | 'health'
  | 'note'
  | 'slack'
  | 'survey'
  | 'task'
  | 'ticket';

export interface StoryRef {
  id: number;
  name: string;
}

/** Who did it. `id` is a user id when the record links a user, null when it
 *  stores only a name (a sender, a call host, a ticket requester). */
export interface StoryActor {
  id: number | null;
  name: string;
}

export interface StoryLink {
  /** An email's thread (read with `?thread=`); null for every other kind and
   *  for an email with no thread. */
  thread_id: string | null;
  /** A ticket's external URL or a call's recording, only ever http(s); null
   *  otherwise. */
  url: string | null;
}

/** Slack escalations D4 contract §2.3: a Jira ticket filed from a Slack thread. */
export interface LinkedTicket {
  id: number;
  number: string;
  status: string;
  /** Null when nobody has it. */
  assignee: string | null;
  /** https only, else null. */
  url: string | null;
}

/** Contract §2.4: the Slack thread a ticket came from. */
export interface FromSlack {
  id: number;
  /** "#all-alfiee", or '' when the channel has no name. */
  channel: string;
  started_by: string;
}

export interface StoryItem {
  /** The record's own id; unique together with `kind`. */
  id: number;
  kind: StoryKind;
  /** Where the record came from, in lower case: a connector's or mailbox's
   *  provider ('zendesk', 'zoom', 'google', ...), or 'revenact' when it was
   *  logged in the app. `sourceName` puts it in words. */
  source: string;
  /** Always an ISO 8601 UTC timestamp. */
  occurred_at: string;
  /** A date-only record: its day is the date part of `occurred_at` (midnight
   *  UTC), and it has no time of day. */
  all_day: boolean;
  /** The account it is filed against; null when it is on the organization itself. */
  account: StoryRef | null;
  title: string;
  /** One line, at most 240 characters. A call's is its CallSense summary. '' when there is none. */
  summary: string;
  /** Null when nobody is recorded (activities, meetings, surveys, health). */
  actor: StoryActor | null;
  link: StoryLink;
  /** A task in a plan, and its milestone (plans spec §2.5; Contract note 5).
   *  Absent or null for anything else. */
  plan?: { id: number; name: string } | null;
  milestone?: { id: number; name: string } | null;
  /** A Slack thread's replies (kind `slack`); absent for anything else. */
  replies?: number;
  /** Kind slack (contract §2.3): its tickets the reader may read. */
  tickets?: LinkedTicket[];
  /** Kind ticket (contract §2.4): its thread, or null. */
  from_slack?: FromSlack | null;
  /** Linked items the reader may not read (SE4-17). */
  hidden_links?: number;
}

/** Needs attention (backend plan Task 7). It follows the account filter only;
 *  each part is null when nothing needs it. */
export interface StoryAttention {
  /** Only when overdue or due within 30 days; never for a churned organization. */
  renewal: { date: string; days: number; overdue: boolean } | null;
  /** Open High or Critical tickets, and the age of the oldest in days. */
  tickets: { count: number; oldest_days: number } | null;
  /** Open tasks past their due date, and how many days the oldest is late. */
  overdue_tasks: { count: number; oldest_days: number } | null;
  /** Unanswered Knowledge questions on the organization. */
  questions: { count: number } | null;
  /** The latest live anomaly. `title` is withheld server-side ("Similar
   *  reports across 1 of your companies") unless the viewer sees everything. */
  anomaly: { id: number; title: string; first_seen_at: string; last_seen_at: string } | null;
}

export interface StoryCounts {
  /** `all` and every group, under the account and search filters (not group or source). */
  by_group: Record<StoryGroup | 'all', number>;
  /** Every kind, under the account and search filters (not group or source). */
  by_kind: Record<StoryKind, number>;
  /** `all`, `none` (records on the organization itself) and every account in
   *  scope by id, under the group, source and search filters (not the account filter). */
  by_account: Record<string, number>;
}

export interface StoryResponse {
  items: StoryItem[];
  /** Opaque; null on the last page. */
  next_cursor: string | null;
  counts: StoryCounts;
  attention: StoryAttention;
}
