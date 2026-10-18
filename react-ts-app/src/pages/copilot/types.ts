// Mirrors revenact-backend's copilot serializers field-for-field — see
// docs/API_CONTRACTS.md -> copilot.

import type { StoryKind } from '../../features/organizations/storyTypes';
import type { PipelineKindKey } from '../../features/pipelines/pipelineTypes';
import type { ScopeKey } from '../../features/brain/brainTypes';

export type MessageRole = 'user' | 'assistant';

/** The dashboard areas a question can be asked from. Mirrors the backend's
 *  DASHBOARD_VIEWS keys and src/pages/dashboard/areas.ts plus the Overview. */
export type DashboardArea = 'overview' | 'revenue' | 'health' | 'support';

/** What a dashboard question is narrowed to: the accounts behind a drilled
 *  number, or one item on the viewer's own attention list. */
export type DashboardFocus = { kind: 'companies'; ids: number[] } | { kind: 'attention'; key: string };

/** The three shared book filters; '' means "All". */
export interface DashboardFilters {
  owner: string;
  lifecycle: string;
  customer: string;
}

/** Where a dashboard question was asked. The server recomputes what that
 *  screen shows; the client never sends figures. */
export interface DashboardContext {
  surface: 'dashboard';
  area: DashboardArea;
  /** One of the area's sub-views; null on the Overview. */
  view: string | null;
  filters: DashboardFilters;
  focus: DashboardFocus | null;
}

/** A conversation's first dashboard context without its focus. Set once by
 *  the server, never overwritten. */
export type DashboardOrigin = Omit<DashboardContext, 'focus'>;

/** The Organizations pages a question can be asked from. */
export type OrganizationsView = 'list' | 'board';

/** The portfolio's params as GET /organizations/portfolio/ reads them (spec
 *  §2), **only the set keys present** — an unset key is left out, never sent
 *  as `''` (the backend reads a literal `ids: ''` as "names nothing", and a
 *  missing `group` as the view's own default). Lists are comma-joined,
 *  `include_churned` is present only as `'1'`, `sort` only when it differs
 *  from the default, `group` only when it differs from the view's default
 *  (or `''` for an explicit "None", which the Board never offers). The
 *  paging params (`cursor`, `group_value`, `limit`) are never part of it. */
export interface OrganizationsFilters {
  search?: string;
  owner?: string;
  lifecycle?: string;
  health?: string;
  product?: string;
  renews_within?: string;
  nps?: string;
  ids?: string;
  include_churned?: string;
  sort?: string;
  group?: string;
}

/** The only focus shape Organizations ever sends; the server `400`s on any
 *  other `kind` (e.g. the Dashboard's `attention`). */
export interface OrganizationsFocus {
  kind: 'companies';
  ids: number[];
}

/** Where an Organizations question was asked (spec §3). The server
 *  recomputes the filtered list for the asker; the client never sends
 *  figures, and never sends `labels` — the server builds them from the
 *  asker's own filter options and echoes them back on a stored context. */
export interface OrganizationsContext {
  surface: 'organizations';
  view: OrganizationsView;
  filters: OrganizationsFilters;
  focus: OrganizationsFocus | null;
  labels?: string[];
}

/** A conversation's first Organizations context without its focus. Unlike
 *  `OrganizationsContext`, `labels` is required: an origin is only ever
 *  built server-side, from the first message's validated context, which
 *  always carries them. */
export interface OrganizationsOrigin {
  surface: 'organizations';
  view: OrganizationsView;
  filters: OrganizationsFilters;
  labels: string[];
}

/** "Ask about this" on one story item (spec 2026-09-26 §3): the item's own
 *  `kind` and `id`, for one question. The server re-reads it under the
 *  story's rules and stores `null` when the asker may not read it. */
export interface StoryFocus {
  kind: StoryKind;
  id: number;
}

/** "Why this sentiment?" (spec 2026-09-28 §4.4): the next question is about
 *  the open person's sentiment. Sent as the person context's
 *  `focus: "sentiment"`; every other surface ignores it. */
export interface SentimentFocus {
  kind: 'sentiment';
}

/** Whatever the shared Ask slot narrows the next question to: a dashboard
 *  drill or attention item, an Organizations row, a story item, a Contacts
 *  person's sentiment, or a Pipelines item. The kinds never overlap, so
 *  `kind` tells them apart. */
export type AskFocus = DashboardFocus | StoryFocus | SentimentFocus | PipelineFocus;

/** Where a question on one organisation's page was asked (spec 2026-09-26
 *  §3, backend delivery 3). `account` is the account chip, null for every
 *  account. The client never sends names: the server builds `label` ("Pizza
 *  Hut" or "Pizza Hut · EMEA") and echoes it on a stored context. */
export interface OrganizationDetailContext {
  surface: 'organizations';
  view: 'detail';
  organization: number;
  account: number | null;
  focus: StoryFocus | null;
  label?: string;
}

/** A conversation's first organisation-page context without its focus;
 *  `label` is always there, built by the server. */
export interface OrganizationDetailOrigin {
  surface: 'organizations';
  view: 'detail';
  organization: number;
  account: number | null;
  label: string;
}

/** The Contacts page's URL filters, only the set keys (as the page's own URL
 *  carries them), sent as they are: the server parses them with the list's
 *  own code. */
export interface ContactsFilters {
  q?: string;
  customer?: string;
  account?: string;
  sentiment?: string;
  role?: string;
}

/** A question asked on the Contacts list (backend #72). The server builds
 *  `label` ("Contacts · Negative · Decision Maker") and echoes it. */
export interface ContactsListContext {
  surface: 'contacts';
  view: 'list';
  filters: ContactsFilters;
  label?: string;
}

/** A question asked with one person open. `focus` is "sentiment" for
 *  "Why this sentiment?". The server builds `label` ("Sam Pizza · Pizza Hut"). */
export interface ContactsPersonContext {
  surface: 'contacts';
  view: 'person';
  contact: number;
  focus: 'sentiment' | null;
  label?: string;
}

export interface ContactsListOrigin {
  surface: 'contacts';
  view: 'list';
  filters: ContactsFilters;
  label: string;
}

export interface ContactsPersonOrigin {
  surface: 'contacts';
  view: 'person';
  contact: number;
  label: string;
}

/** The Accounts portfolio's URL filters as a question carries them (backend
 *  `accounts_context.FILTER_KEYS`): only the set keys, in the page's own URL
 *  spelling. `sort` only when it is not the default; `group` only when it
 *  differs from the view's default, or `''` for the List's "None". */
export interface AccountsFilters {
  search?: string;
  organisation?: string;
  owner?: string;
  lifecycle?: string;
  health?: string;
  renews_within?: string;
  nps?: string;
  ids?: string;
  sort?: string;
  group?: string;
}

/** A question asked on the Accounts List or Board (spec 2026-09-29 §3). No
 *  focus: the server drops one on these views. The server builds `label`
 *  ("Accounts · Owner: Carl CSM") and echoes it on a stored context. */
export interface AccountsListContext {
  surface: 'accounts';
  view: OrganizationsView;
  filters: AccountsFilters;
  label?: string;
}

/** A question asked on one account's page. `focus` is "Ask about this" on a
 *  story item; the server refuses (400) an item the asker cannot open. The
 *  server builds `label` (the account's name). */
export interface AccountDetailContext {
  surface: 'accounts';
  view: 'detail';
  account: number;
  focus: StoryFocus | null;
  label?: string;
}

export interface AccountsListOrigin {
  surface: 'accounts';
  view: OrganizationsView;
  filters: AccountsFilters;
  label: string;
}

export interface AccountDetailOrigin {
  surface: 'accounts';
  view: 'detail';
  account: number;
  label: string;
}

/** The Pipelines book's URL filters as a question carries them (backend
 *  `pipelines_context.FILTER_KEYS`): only the set keys, in the page's own
 *  URL spelling. `sort` only when it is not `-mrr`; `group` only when it is
 *  not `stage`, `none` for the List's "None". */
export interface PipelinesFilters {
  search?: string;
  organisation?: string;
  account?: string;
  owner?: string;
  stage?: string;
  priority?: string;
  department?: string;
  date?: string;
  changed?: string;
  ids?: string;
  sort?: string;
  group?: string;
}

/** "Ask about this" on one Pipelines item (spec 2026-09-30 §3): its kind
 *  matches the page's (`opportunity` on opportunities, `risk` on risks); the
 *  server refuses (400) an item the asker may not read. */
export interface PipelineFocus {
  kind: 'opportunity' | 'risk';
  id: number;
}

/** A question asked on the Pipelines List or Board. The server builds
 *  `label` ("Pipelines · Opportunities · Owner: Carl CSM") and echoes it on
 *  a stored context, with the validated `focus`. */
export interface PipelinesContext {
  surface: 'pipelines';
  kind: PipelineKindKey;
  view: OrganizationsView;
  filters: PipelinesFilters;
  focus?: PipelineFocus | null;
  label?: string;
}

export interface PipelinesOrigin {
  surface: 'pipelines';
  kind: PipelineKindKey;
  view: OrganizationsView;
  filters: PipelinesFilters;
  label: string;
}

/** The four Brain questions a question can be asked on (brain ask spec
 *  2026-10-06 §2.1). Feature Requests, Anomalies and the Graph have none. */
export type BrainAskTab = 'changed' | 'waiting' | 'doing' | 'customers';

/** A question asked on a Brain tab: the scope the page settled on and the
 *  tab. No focus in this delivery, and never a figure or a name: the server
 *  rebuilds the tab's payload for the asker. */
export interface BrainAskContext {
  surface: 'brain';
  scope: ScopeKey;
  tab: BrainAskTab;
}

/** A conversation's first Brain context. It has no focus to drop, so it is
 *  the context itself. */
export type BrainAskOrigin = BrainAskContext;

/** Every structured context a question can carry, told apart by `surface`
 *  (and, on Organizations, Contacts and Accounts, by `view`). */
export type SurfaceContext =
  | DashboardContext
  | OrganizationsContext
  | OrganizationDetailContext
  | ContactsListContext
  | ContactsPersonContext
  | AccountsListContext
  | AccountDetailContext
  | PipelinesContext
  | BrainAskContext;
export type SurfaceOrigin =
  | DashboardOrigin
  | OrganizationsOrigin
  | OrganizationDetailOrigin
  | ContactsListOrigin
  | ContactsPersonOrigin
  | AccountsListOrigin
  | AccountDetailOrigin
  | PipelinesOrigin
  | BrainAskOrigin;
export type SurfaceName = SurfaceContext['surface'];

/** A record an answer was built from. A snapshot taken when the
 * answer was written, not a live reference — see the backend's
 * `_source_ref` for why. `id` is kept so the UI can still offer a link,
 * which simply won't resolve if the record has since been deleted. */
export interface MessageSource {
  type: 'email' | 'note' | 'ticket' | 'activity' | 'contribution';
  id: number;
  label: string;
  date: string;
  company: string;
  company_type: 'customer' | 'account';
  company_id: number;
}

/** What `POST /copilot/draft-reply/` returns: the reply written as the
 *  person, and the records it was built from. */
export interface DraftReply {
  draft: string;
  sources: MessageSource[];
}

export interface CopilotMessage {
  id: number;
  role: MessageRole;
  content: string;
  /** Always present; empty on user turns and on answers that had
   * nothing specific to quote. */
  sources: MessageSource[];
  /** The people this turn @mentioned — each became a routed question
   * (see services.knowledge). Empty on assistant turns. */
  questions: { id: number; assignee: { id: number; name: string }; status: 'open' | 'answered' }[];
  /** Assistant turns: the people responsible for the customer this answer
   * was about, offered as one-click "ask" — see services.knowledge. */
  ask_suggestions?: AskSuggestion[];
  /** Who wrote a user turn; null on assistant turns. */
  author?: { id: number; name: string; function: string } | null;
  /** User turns asked on the Dashboard or Organizations: the context as the
   *  server validated it (focus ids already intersected with the viewer's
   *  book). Null or absent everywhere else. */
  context?: SurfaceContext | null;
  created_at: string;
}

export interface AskSuggestion {
  user_id: number;
  name: string;
  function: string;
  function_display: string;
  customer_id: number;
  customer_name: string;
}

// No nested `messages` — the shape `fetchConversations` returns, for the
// sidebar's own "Chat history" list.
export interface ConversationSummary {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  /** Where a Dashboard or Organizations conversation started; null for every
   *  other one. There is no separate `origin_label`: an Organizations
   *  origin carries its own `labels`, server-built, that the History tag
   *  joins as `["Organizations", ...labels].join(' · ')`. */
  origin?: SurfaceOrigin | null;
}

// Adds `messages` — the shape `fetchConversation`/`sendMessage` return.
export interface Conversation extends ConversationSummary {
  messages: CopilotMessage[];
  /** "full" for the owner and session participants; "partial" for someone who was only mentioned and sees a slice. */
  visibility?: 'full' | 'partial';
}
