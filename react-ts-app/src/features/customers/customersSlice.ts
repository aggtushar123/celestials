import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { UserFunction } from '../auth/authSlice';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { accountBase } from '../../lib/accountPaths';
import { listScope } from '../../lib/listScope';
import type { User, CurrencyCode } from '../auth/authSlice';
import type { ContactHistory, ContactsPage, ContactsSummary } from '../contacts/contactsTypes';

// Mirrors revenact-backend's CustomerSerializer field-for-field — see
// revenact-backend/docs/API_CONTRACTS.md -> customers. One of a *tenant's*
// own customers (not to be confused with `Organisation`, the tenant
// itself). DRF's DecimalField serializes as a string by default (e.g.
// health_score: "9.3") — only FloatField/IntegerField come back as JSON
// numbers, which is why the types below are a mix of `string` and `number`.
/** One row of `Customer.health_breakdown`. `weight` and `points` are strings
 *  for the same reason the decimal fields are — exact tenths, not floats. */
export interface HealthComponent {
  key: string;
  label: string;
  weight: string;
  points: string;
  /** 0..1, or null when the component couldn't be measured. */
  ratio: number | null;
  available: boolean;
}

/** One band of `Customer.csat_breakdown` — see the backend's CSAT_BANDS. */
export interface CsatBand {
  key: string;
  label: string;
  count: number;
  /** Percentage of responses in this band, 0-100. */
  share: number;
}

/** How a customer's answered CSAT surveys spread across the five bands.
 *  `responses` is 0 when nobody has answered one. */
export interface CsatBreakdown {
  responses: number;
  bands: CsatBand[];
}

/**
 * Why a customer left — `Customer.ChurnReason` on the backend, a closed list
 * since migration 0028.
 *
 * The labels live in CHURN_REASONS below and on every record as
 * `churn_reason_display`, so a screen showing an existing reason should print
 * that field rather than looking it up here. This list is for the pickers,
 * which need the options before a reason exists.
 *
 * Hardcoded rather than fetched, the same as LIFECYCLE_OPTIONS: it is part of
 * the API contract, and one round-trip to learn eleven words nobody changes is
 * a worse trade than the duplication.
 */
export type ChurnReason =
  | 'price'
  | 'budget'
  | 'product_gap'
  | 'adoption'
  | 'competitor'
  | 'champion_left'
  | 'acquired'
  | 'shut_down'
  | 'consolidation'
  | 'support'
  | 'other';

/** The picker's options, in the order the backend declares them. */
export const CHURN_REASONS: { value: ChurnReason; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'budget', label: 'Budget cut' },
  { value: 'product_gap', label: 'Missing capability' },
  { value: 'adoption', label: 'Never adopted' },
  { value: 'competitor', label: 'Switched to a competitor' },
  { value: 'champion_left', label: 'Champion left' },
  { value: 'acquired', label: 'Acquired or merged' },
  { value: 'shut_down', label: 'Went out of business' },
  { value: 'consolidation', label: 'Vendor consolidation' },
  { value: 'support', label: 'Service or support' },
  { value: 'other', label: 'Other' },
];

export interface Customer {
  id: number;
  name: string;
  address: string;
  domain: string;
  /** Free-text, hand-entered via Add/Edit Organization — not part of
   * the original tableData.ts mock schema. Shown on ActivityFeed's
   * Overview tab and, the reason it exists, folded into what the
   * backend's Copilot embeds for semantic company matching (see
   * revenact-backend's services/copilot/retrieval.py) once set. */
  industry: string;
  /** Contact info shown on ActivityFeed's Overview tab — not part of
   * the original tableData.ts mock schema. */
  email: string;
  phone: string;
  owner: User | null;
  created_by: User | null;
  modified_by: User | null;
  created_at: string;
  updated_at: string;
  lifecycle_stage:
    | 'onboarding'
    | 'kickoff'
    | 'adoption'
    | 'live'
    | 'renewal'
    | 'churn'
    | 'expansion'
    | 'other';
  health_score: string;
  health_category: 'good' | 'average' | 'poor';
  pulse: number[];
  ai_pulse_score: 'very_satisfied' | 'satisfied' | 'moderate' | 'high_risk' | '';
  /** The five weighted components `health_score` is calculated from — see the
   *  backend's services/customers/health.py. The `points` of the available ones
   *  sum to `health_score`; an unavailable one had nothing to measure and was
   *  left out of the total rather than scored zero. */
  health_breakdown: HealthComponent[];
  /** The CSAT distribution behind `csat_score`, from answered surveys. */
  csat_breakdown: CsatBreakdown;
  /** True when someone pinned `health_score` by hand instead of letting the
   *  rubric decide it. */
  health_score_is_overridden: boolean;
  ai_pulse_reason: string;
  /** How the relationship feels right now — pulse.py over the organisation's own signals plus its accounts'. Optional: older fixtures omit it. */
  account_pulse?: AccountPulse;
  nps_score: number | null;
  csat_score: string | null;
  joined_date: string | null;
  renewal_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  /** This customer's own contract currency — independent of
   * Organisation.currency (the tenant's own reporting currency, see
   * authSlice.ts). Defaults to the org's currency at creation unless
   * explicitly overridden (see backend CustomerSerializer.create()). */
  currency: CurrencyCode;
  currency_display: string;
  arr_billed_at_account: string;
  arr_billed_at_hq: string;
  implementation_fee: string;
  total_contract_value: string;
  total_forecasted_renewal_revenue: string;
  /** A Product id — the tenant's own catalogue, /api/v1/products/. Free text
   *  until backend migration 0030. Null when nobody recorded one. */
  primary_product: number | null;
  /** The product's name, read-only, so a screen that only prints what they
   *  bought needn't fetch the catalogue. Empty string when there is none. */
  primary_product_name: string;
  /** How many *other* products, never which — nobody records that, which is
   *  the limit the Product Usage dashboard states on screen. */
  additional_products_count: number | null;
  top_source_channel: string;
  total_contracted_seats: number | null;
  total_active_seats: number | null;
  seat_utilization_percentage: number | null;
  total_hires: number | null;
  scope_web_app: string;
  ces_percentage: string | null;
  churn_date: string | null;
  /** One of CHURN_REASONS below, or '' when nobody recorded one — which is
   *  not the same as 'other'. A closed list since backend migration 0028. */
  churn_reason: ChurnReason | '';
  /** The label for churn_reason, served by the API so no screen keeps its own
   *  copy of the taxonomy. */
  churn_reason_display: string;
  churn_comment: string;
  is_archived: boolean;
}

// A Customer as referenced from an Account/Contact/Opportunity/Risk's
// own `customers`/`companies` list — just enough to link and label it,
// not the full Customer record.
export interface CompanyRef {
  id: number;
  name: string;
}

// Mirrors revenact-backend's AccountSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Account. A named sub-account
// that can belong to any number of Customers at once (many-to-many, no
// primary owner — see the backend Account model's own docstring for
// why: joint ventures, shared subsidiaries serviced by vendor and
// reseller, holding-company restructuring). Almost always exactly one
// in practice.
export interface Account {
  id: number;
  /** Every Customer this Account belongs to — see this interface's own
   * docstring. Only meaningful (and only actually needed) on the
   * standalone Accounts page, which spans every Customer; harmless
   * extra field everywhere else this interface is used, same reasoning
   * as Contact/Opportunity/Risk's own `companies`. */
  customers: CompanyRef[];
  name: string;
  domain: string;
  /** Falls back to the parent Customer's own value when blank — see
   * mapAccountToAccountRow.ts, which is where that fallback actually
   * happens for display (the backend also resolves this fallback
   * server-side, for Copilot's own semantic matching — see
   * services/copilot/retrieval.py's _effective_industry). */
  industry: string;
  /** Falls back to the parent Customer's own value when blank — see
   * mapAccountToAccountRow.ts, which is where that fallback actually
   * happens (not this type, and not the backend). */
  address: string;
  email: string;
  phone: string;
  owner: User | null;
  created_at: string;
  updated_at: string;
  lifecycle_stage: Customer['lifecycle_stage'];
  health_score: string;
  health_category: 'good' | 'average' | 'poor';
  pulse: number[];
  ai_pulse_score: 'very_satisfied' | 'satisfied' | 'moderate' | 'high_risk' | '';
  ai_pulse_reason: string;
  /** The AI pulse as a number (1-5), null when unscored; AccountSerializer's `ai_pulse_value`. Optional because older fixtures omit it. */
  ai_pulse_value?: number | null;
  /** The CSM's own pulse reading (1-5), null when unset; AccountSerializer's `csm_pulse_score` (round-2 fix, 2026-09-27). Optional because older fixtures omit it. */
  csm_pulse_score?: number | null;
  /** How the relationship feels right now — the backend's pulse.py blend of five signals. */
  account_pulse: AccountPulse;
  nps_score: number | null;
  csat_score: string | null;
  renewal_date: string | null;
  arr: string;
}

// Mirrors revenact-backend's ActivitySerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Activity. A timeline entry
// belonging to exactly one Customer or Account (never both, enforced
// server-side) — which one it belongs to is implied by which endpoint
// fetched it (fetchActivitiesForCustomer vs fetchActivitiesForAccount),
// not carried as a field here. Read-only, no write payload yet.
export interface Activity {
  id: number;
  type: string;
  /** Human label (e.g. "Health Check Review") — this is the card's title. */
  type_display: string;
  occurred_at: string;
  links: number;
  watchers: number;
}

// Mirrors revenact-backend's EmailSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Email. Which parent (Customer or
// Account) it belongs to is implied by which endpoint fetched it, same
// as Activity. `sender_name`/`recipient_name` are plain text, not a
// User/Contact reference — see the Email model's own docstring for why.
export interface Email {
  id: number;
  subject: string;
  sender_name: string;
  recipient_name: string;
  /** The summarized preview shown on the card. */
  body: string;
  sent_at: string;
  links: number;
  watchers: number;
  is_starred: boolean;
  /** Set on rows synced through someone's mailbox (services/mail); '' on logged/seeded rows. */
  direction?: 'sent' | 'received' | '';
  from_address?: string;
  to_addresses?: string[];
  thread_id?: string;
  /** Whose mailbox it came through — readable by them alone unless shared (2026-10-17). */
  mailbox_owner?: { id: number; name: string } | null;
  /** When its owner added it to Revenact; then anyone who can open the record reads it. */
  shared_at?: string | null;
}

// Mirrors revenact-backend's TaskSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Task. `priority`/`status`
// values match the frontend's own existing display-config keys
// exactly (e.g. "in-progress"), so no separate _display field is
// needed the way Activity's type_display was. No `group` — the
// Overdue/This Week/Next Week/Later bucket is computed from
// `due_date` at render time (see TasksTab.tsx), not carried here.
export interface Task {
  id: number;
  title: string;
  assignee_name: string;
  /** Who it is for and who made it, when created in the app; readable by them and their management chains. */
  assignee?: { id: number; name: string } | null;
  created_by?: { id: number; name: string } | null;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  /** `blocked` since Work delivery 1; the reason is read from the task panel. */
  status: 'pending' | 'in-progress' | 'blocked' | 'completed';
  /** The plan and milestone a task belongs to (plans spec §4, task serializer addition). */
  plan?: { id: number; name: string } | null;
  milestone?: { id: number; name: string } | null;
}

// Mirrors revenact-backend's NoteSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Note. `author_name` is plain
// text, not a FK, same reasoning as Task's `assignee_name`. `links` is
// a real count — the card only shows its link line when it's greater
// than zero ("links if any"). No `group` — the date-group header is
// derived from `logged_at` at render time (see NotesTab.tsx).
export interface Note {
  id: number;
  title: string;
  author_name: string;
  /** Who wrote it in the app; readable by them and their management chain. Null on seeded notes. */
  author?: { id: number; name: string } | null;
  body: string;
  logged_at: string;
  links: number;
}

// Mirrors revenact-backend's HeadlineSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Headline. `kind` splits the
// two card shapes the tab renders: 'summary' is the pinned TL;DR
// (carries `time_period_label` + `data_sources`, never a `status`),
// 'headline' is one storyline in the feed (carries a `status` and a
// period span). `group` is derived server-side from `period_end`, the
// way NotesTab derives its own date headers — the mock stored it as
// free text, which is how it drifted. `data_sources_display` is the
// footer's prose list, built from the keys the generator actually
// read, so the card can't claim a source nobody looked at.
export type HeadlineKind = 'summary' | 'headline';
export type HeadlineStatus = 'open' | 'in_progress' | 'closed';
export type HeadlineDataSource =
  | 'notes'
  | 'emails'
  | 'call_transcripts'
  | 'tickets'
  | 'activities';

export interface Headline {
  id: number;
  kind: HeadlineKind;
  kind_display: string;
  title: string;
  content: string;
  /** Empty string for a summary — the backend refuses a summary with a
   * status at the DB level, not just in the serializer. */
  status: HeadlineStatus | '';
  status_display: string;
  period_start: string | null;
  period_end: string | null;
  time_period_label: string;
  data_sources: HeadlineDataSource[];
  data_sources_display: string;
  /** '' for a summary, and for a headline with no `period_end` to
   * group under. */
  group: string;
  /** Set only on cards the model wrote — null when hand-written. */
  generated_at: string | null;
  created_at: string;
}

// Mirrors revenact-backend's TicketSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Ticket. Field set was
// reverse-engineered from the card, not dictated up front — see that
// model's own docstring. `status`/`priority` values match the
// frontend's own existing display-config keys exactly (e.g.
// "in-progress"). `links` is a real count, shown on the card only
// when greater than zero, same as Note. No `group` — the date-group
// header is derived from `opened_at` at render time (see
// TicketsTab.tsx).
export interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  assignee_name: string;
  status: 'open' | 'in-progress' | 'on-hold' | 'resolved' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  opened_at: string;
  links: number;
  /** Where it came from: the connector's name, or null when raised here. */
  connector_name: string | null;
  connector_provider: string | null;
  /** The department that may read it ('' = everyone). */
  department: string;
  department_display: string;
  description: string;
  requester_name: string;
  requester_email: string;
  external_url: string;
  synced_at: string | null;
}

// Mirrors revenact-backend's CalendarEventSerializer field-for-field —
// see docs/API_CONTRACTS.md -> customers -> CalendarEvent. `type`
// values match the frontend's own existing display-config keys
// exactly. `attendee_count` is a count, not the mock's full list of
// attendee names — the card only ever renders the count. No `group` —
// the date-group header is derived from `event_date` at render time
// (see CalendarEventsTab.tsx). `start_time`/`end_time` are "HH:MM:SS"
// (Django's default TimeField serialization), formatted to a
// 12-hour display string on the frontend.
export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  type: 'meeting' | 'call' | 'review' | 'demo';
  event_date: string;
  start_time: string;
  end_time: string;
  attendee_count: number;
}

// Mirrors revenact-backend's ContactSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Contact. Unlike Activity/
// Email/Task/Note/Ticket/CalendarEvent above (each one filter within
// ActivityFeed), Contact backs its own sibling tab — the Organization
// Details page's Contacts tab, the standalone Account page's Contacts
// tab, and the Contacts page (/contacts) — so it also carries
// `companies`/`account_name`, which those other models don't need
// (their parent scope is always already known from which endpoint
// fetched them; the global list page spans every Customer/Account at
// once, so it can't assume that). `companies` is every ultimate parent
// Customer — plural (not a single `company_id`/`company_name`) since
// an account-level contact's own Account can now belong to more than
// one Customer at once (see the backend Account model's own
// docstring); almost always exactly one in practice. `account_name` is
// `null` for an organization-level contact. No `avatar` — derived from
// `name` on the frontend, same as every other entity's avatar in this
// codebase.
export interface Contact {
  id: number;
  name: string;
  role: 'executive_sponsor' | 'champion' | 'economic_buyer' | 'technical_lead' |
    'decision_maker' | 'influencer' | 'finance_manager' | 'other';
  role_display: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Where the sentiment comes from: set by hand, or computed from the
   * person's own classified calls, emails and tickets (the backend's
   * contact_sentiment.py). Computed wins whenever there is evidence. */
  sentiment_source: 'manual' | 'computed';
  /** Old shape: revenact-backend PR fix/contacts-readable-evidence removes
   *  this field in favour of the row's `calls` below. Kept optional only
   *  until that backend change is live (this frontend deploys first); do
   *  not add new reads of it beyond `callsLabel`'s fallback. */
  sentiment_evidence?: ContactSentimentEvidence | Record<string, never>;
  sentiment_computed_at: string | null;
  last_contacted_at: string | null;
  companies: CompanyRef[];
  account_name: string | null;
  /** The account it is on; null on the organization itself (spec
   *  2026-09-27 §6). Optional: fixtures from before it read as null. */
  account_id?: number | null;
  /** The first parent organisation the viewer may open, and the account,
   *  as refs (the Contacts list, spec 2026-09-28 §2). Optional: older
   *  fixtures and nested lists read them from `companies`/`account_*`. */
  organisation?: CompanyRef | null;
  account?: CompanyRef | null;
  /** How many of their calls the viewer can open, counting every visible
   *  call, read or not (revenact-backend PR fix/contacts-readable-
   *  evidence). Optional until that backend change is live; `callsLabel`
   *  falls back to `sentiment_evidence.calls` until then. */
  calls?: number;
  /** When they unsubscribed from campaigns through an email's link (campaigns
   *  spec §1.6); null while subscribed. Optional until that backend ships. */
  campaigns_unsubscribed_at?: string | null;
}

export interface ContactSentimentEvidence {
  score: number;
  calls: number;
  emails: number;
  tickets: number;
  positive: number;
  neutral: number;
  negative: number;
  latest_at: string | null;
}


// The fields the Add/Edit Contact form actually exposes — everything
// ContactSerializer accepts except `customer`/`account` (never sent;
// the create thunk's own URL establishes the parent, and a Contact
// can't be moved between parents afterward — see ContactDetailView's
// own docstring on the backend).
export interface ContactWritePayload {
  name?: string;
  role?: Contact['role'];
  email?: string;
  phone?: string;
  status?: Contact['status'];
  sentiment?: Contact['sentiment'];
  /** Only `false`: a person re-subscribes someone by hand (campaigns spec §1.6). */
  campaigns_unsubscribed?: false;
}

// Mirrors revenact-backend's OpportunitySerializer field-for-field —
// see docs/API_CONTRACTS.md -> customers -> Opportunity. `stage` is
// the standalone Pipelines board's own 7 Kanban columns; `avatar`-style
// `orgColor`/`orgInitials` from the old mock aren't fields here at all
// — EntityAvatar derives both from `companies`/`account_name` on the
// frontend, same as every other entity's avatar in this codebase.
// `companies` is plural for the same reason as Contact's own field —
// an account-level opportunity's own Account can now belong to more
// than one Customer at once.
export interface Opportunity {
  id: number;
  title: string;
  mrr: string;
  stage: 'discovery' | 'qualification' | 'solution_validation' | 'proposal_price_review' |
    'negotiation' | 'closed_won' | 'closed_lost';
  stage_display: string;
  priority: 'high' | 'medium' | 'low';
  priority_display: string;
  /** Whose pipeline it is on ('' = whole company). Read department-wise:
   * a person sees their own department's plus undeparted ones; a role
   * that may view all accounts, and Leadership, see every department. */
  department: UserFunction | '';
  department_display: string;
  companies: CompanyRef[];
  account_name: string | null;
  /** The account it is on; null on the organization itself. */
  account_id?: number | null;
  /** Expected close, YYYY-MM-DD, or null ("No date"). The API always sends
   *  it (since 2026-09-30); optional because older fixtures omit it. */
  expected_close?: string | null;
  /** When the stage last changed (creation included). Read-only. */
  stage_changed_at?: string;
}

// The fields the Add/Edit Opportunity form actually exposes.
export interface OpportunityWritePayload {
  title?: string;
  mrr?: string;
  stage?: Opportunity['stage'];
  priority?: Opportunity['priority'];
  department?: UserFunction | '';
  expected_close?: string | null;
}

// Mirrors revenact-backend's RiskSerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Risk. Field-for-field identical
// to Opportunity above except `stage`, which is the board's own 4 Risk
// Kanban columns rather than Opportunity's 7.
export interface Risk {
  id: number;
  title: string;
  mrr: string;
  stage: 'open' | 'mitigated' | 'realised' | 'abandoned';
  stage_display: string;
  priority: 'high' | 'medium' | 'low';
  priority_display: string;
  /** Whose pipeline it is on ('' = whole company). Read department-wise:
   * a person sees their own department's plus undeparted ones; a role
   * that may view all accounts, and Leadership, see every department. */
  department: UserFunction | '';
  department_display: string;
  companies: CompanyRef[];
  account_name: string | null;
  /** The account it is on; null on the organization itself. */
  account_id?: number | null;
  /** Due by, YYYY-MM-DD, or null ("No date"). The API always sends it
   *  (since 2026-09-30); optional because older fixtures omit it. */
  due_by?: string | null;
  /** When the stage last changed (creation included). Read-only. */
  stage_changed_at?: string;
}

// The fields the Add/Edit Risk form actually exposes.
export interface RiskWritePayload {
  title?: string;
  mrr?: string;
  stage?: Risk['stage'];
  priority?: Risk['priority'];
  department?: UserFunction | '';
  due_by?: string | null;
}

// Mirrors revenact-backend's SurveySerializer field-for-field — see
// docs/API_CONTRACTS.md -> customers -> Survey. `score` is one field
// for all three types (-100..100 for NPS, 0..100 for CSAT/CES, the
// same ranges Customer['nps_score']/csat_score/ces_percentage already
// use) — null until responded.
export interface Survey {
  id: number;
  survey_type: 'nps' | 'csat' | 'ces';
  survey_type_display: string;
  status: 'sent' | 'responded' | 'expired';
  status_display: string;
  score: number | null;
  sent_at: string;
  responded_at: string | null;
  companies: CompanyRef[];
  /** Unlike Opportunity/Risk's own `account_name`-only shape, Survey
   * also exposes the raw id — the standalone Surveys page's own
   * row-click navigates to this Account's real Details page, and
   * `account_name` alone (a string) isn't enough to build that link. */
  account_id: number | null;
  account_name: string | null;
  created_at: string;
  /** The survey send whose answers this row aggregates, or null for a row
   * logged by hand (backend Decision 25). Such a row is read-only: the
   * backend refuses edits (400) and deletes (409), and updates it itself.
   * Optional because older fixtures omit it; the contract always sends it. */
  send_id?: number | null;
}

// "Log Survey" only sets survey_type/sent_at; "Log Response" only sets
// status/score (responded_at defaults server-side to today if omitted
// — see backend SurveySerializer.update()).
export interface SurveyWritePayload {
  survey_type?: Survey['survey_type'];
  sent_at?: string;
  status?: Survey['status'];
  score?: number | null;
  responded_at?: string;
}

// The subset of Account fields the Add/Edit Account form actually
// exposes — identity, ownership, lifecycle stage, and renewal date.
// Same product decision as CustomerWritePayload: health/pulse/AI-pulse/
// NPS/CSAT/ARR are meant to sync from other systems later, not be
// hand-typed here. `customer_ids` is never sent from the quick Add/Edit
// form — the backend always additively links the URL's own Customer
// regardless (see AccountListCreateView.perform_create's own
// docstring) — it exists here only for the standalone Account page's
// own Organizations tab, which fully replaces the linked set when it
// sends this field at all (see AccountSerializer's own docstring).
export interface AccountPulseReading {
  key: 'ai_pulse' | 'csm_pulse' | 'sentiment' | 'touch' | 'support';
  label: string;
  weight: string;
  /** 1-5 to a tenth, or null when the signal had nothing to measure. */
  reading: string | null;
  note: string;
}

export interface AccountPulse {
  /** 1-5 to a tenth, or null when no signal could be measured. */
  value: string | null;
  label: 'Thriving' | 'Healthy' | 'Watch' | 'At risk' | 'Critical' | 'No signal';
  /** Pulse-history dot code: 1 good, 3 warning, 2 bad, 0 no signal. */
  category: 0 | 1 | 2 | 3;
  breakdown: AccountPulseReading[];
}

export interface AccountWritePayload {
  name?: string;
  domain?: string;
  industry?: string;
  owner_id?: number | null;
  /** Why the owner is changing — written down as knowledge on every linked organisation. */
  handover_note?: string;
  lifecycle_stage?: Account['lifecycle_stage'];
  renewal_date?: string | null;
  customer_ids?: number[];
}

// The subset of Customer fields the Add/Edit forms actually expose —
// identity, ownership, lifecycle stage, and contract dates. Deliberately
// excludes financials, product usage, and NPS/CSAT/health: per the
// product decision behind this form, those are meant to eventually sync
// from other systems (billing, usage tracking, surveys) rather than be
// hand-typed when an organisation is added or edited. Also covers the
// Churn action's own fields (churn_date/reason/comment) and is_archived
// (Archive/unarchive) — both PATCH through the same updateCustomer thunk
// as a normal edit, just with a different field subset.
export interface CustomerWritePayload {
  name?: string;
  domain?: string;
  industry?: string;
  address?: string;
  owner_id?: number | null;
  lifecycle_stage?: Customer['lifecycle_stage'];
  joined_date?: string | null;
  renewal_date?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  currency?: CurrencyCode;
  churn_date?: string | null;
  churn_reason?: ChurnReason | '';
  churn_comment?: string;
  is_archived?: boolean;
}

interface CustomersPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Customer[];
}

interface StatsBucket {
  count: number;
  /** Derived (arr / 12) server-side — there's no stored MRR field. */
  mrr: number;
  arr: number;
}

// Mirrors revenact-backend's CustomerStatsView response exactly — see
// docs/API_CONTRACTS.md -> GET /api/v1/customers/stats/.
export interface CustomerStats {
  health: Record<Customer['health_category'], StatsBucket>;
  nps: { promoters: number; passives: number; detractors: number; score: number };
  lifecycle: Record<Customer['lifecycle_stage'], StatsBucket>;
  /** How many customers were counted but excluded from every mrr/arr sum
   * above because their own currency has no configured FxRate — see
   * CurrencySection.tsx's Exchange Rates section. Optional (not just 0)
   * because this same type is reused for GET /accounts/stats/, whose
   * response has no such field at all — Account has no currency of its
   * own (see mapToAccountRow.ts), so nothing there is ever unconverted. */
  unconverted_count?: number;
}

interface CustomersState {
  customers: Customer[];
  /** Count for the current (possibly search-filtered) fetch — drives the
   * table's "Showing X-Y of Z" pagination footer. */
  count: number;
  /** Count from the last *unfiltered* fetch — how many organisations are
   * onboarded overall, for MetricsPanel's "Number of Organizations" card.
   * Deliberately not just `count`, which would otherwise dip to a search's
   * result size while the user is filtering the table. */
  totalCount: number;
  next: string | null;
  previous: string | null;
  isLoading: boolean;
  error: string | null;
  /** Customers due for renewal within the window last asked for via
   * fetchUpcomingRenewals — a separate list from `customers` so opening
   * the Renewal popover never clobbers whatever the main table is
   * currently showing (which may itself be search-filtered). */
  renewals: Customer[];
  renewalsCount: number;
  renewalsLoading: boolean;
  renewalsError: string | null;
  /** MetricsPanel's Health/NPS/Lifecycle Stages sections — null until the
   * first fetch resolves. */
  stats: CustomerStats | null;
  statsLoading: boolean;
  statsError: string | null;
  /** The single organization Details.tsx (/organizations/:id) is showing.
   * Separate from `customers` (the paginated list) since Details is reached
   * directly by URL — it can't assume the list has already loaded this
   * particular row. */
  selectedCustomer: Customer | null;
  selectedCustomerLoading: boolean;
  selectedCustomerError: string | null;
  /** Accounts for whichever customer Details.tsx's Accounts tab is
   * currently showing — a single slot, same reasoning as
   * selectedCustomer: only one organization's Accounts tab is ever on
   * screen at a time. */
  accountsForCustomer: Account[];
  accountsLoading: boolean;
  accountsError: string | null;
  /** The customer the last accounts read asked for: `accountsForCustomer`
   * is that customer's (once it lands), and a slower read for another one
   * is dropped. Null before any read. */
  accountsCustomerId: number | null;
  /** Powers the standalone Accounts page (`/accounts/list`) — every
   * Account across every Customer the tenant has, paginated. Same
   * "raw path in, paginated page out" shape as `allContacts`, and
   * deliberately separate from `accountsForCustomer` above for the
   * same reason `allContacts` is separate from `contacts`. */
  allAccounts: Account[];
  allAccountsCount: number;
  allAccountsNext: string | null;
  allAccountsPrevious: string | null;
  allAccountsLoading: boolean;
  allAccountsError: string | null;
  /** Health/NPS/Lifecycle rollups across every Account the tenant has —
   * backs the standalone Accounts page's own MetricsPanel. Reuses the
   * `CustomerStats` type as-is (see that type's own comment) — same
   * shape, since Account's health_category/lifecycle_stage are the
   * exact same literal types as Customer's own. */
  accountStats: CustomerStats | null;
  accountStatsLoading: boolean;
  accountStatsError: string | null;
  /** Activities for whichever Customer or Account ActivityFeed's
   * "Activities" filter is currently showing — a single slot, same
   * reasoning as selectedCustomer/accountsForCustomer: only one
   * entity's Activity Feed is ever mounted at a time (Organization
   * Details page's General tab, or the standalone Account page). */
  activities: Activity[];
  activitiesLoading: boolean;
  activitiesError: string | null;
  /** Emails for whichever Customer or Account ActivityFeed's "Emails"
   * filter is currently showing — same single-slot reasoning as
   * `activities` above. */
  emails: Email[];
  emailsLoading: boolean;
  emailsError: string | null;
  /** Tasks for whichever Customer or Account ActivityFeed's "Tasks"
   * filter is currently showing — same single-slot reasoning as
   * `activities`/`emails` above. */
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  /** Notes for whichever Customer or Account ActivityFeed's "Notes"
   * filter is currently showing — same single-slot reasoning as
   * `activities`/`emails`/`tasks` above. */
  notes: Note[];
  notesLoading: boolean;
  notesError: string | null;
  /** Headlines for whichever Customer or Account ActivityFeed's
   * "Headlines" sub-tab is currently showing — same single-slot
   * reasoning as `activities`/`emails`/`tasks`/`notes` above, even
   * though Headlines is a top-level sub-tab rather than one of the
   * feed's own filters. */
  headlines: Headline[];
  headlinesLoading: boolean;
  headlinesError: string | null;
  /** Regenerating is tracked apart from `headlinesLoading`/
   * `headlinesError` on purpose. A failed *list* load means there are
   * no cards to show, so the tab renders the error in their place; a
   * failed *regenerate* leaves the existing cards untouched (the
   * backend does the delete and insert in one transaction), so its
   * error belongs in a banner above them, not instead of them. */
  headlinesGenerating: boolean;
  headlinesGenerateError: string | null;
  /** Tickets for whichever Customer or Account ActivityFeed's
   * "Tickets" filter is currently showing — same single-slot
   * reasoning as `activities`/`emails`/`tasks`/`notes` above. */
  tickets: Ticket[];
  ticketsLoading: boolean;
  ticketsError: string | null;
  /** Calendar events for whichever Customer or Account ActivityFeed's
   * "Calendar Events" filter is currently showing — same single-slot
   * reasoning as `activities`/`emails`/`tasks`/`notes`/`tickets`
   * above. */
  calendarEvents: CalendarEvent[];
  calendarEventsLoading: boolean;
  calendarEventsError: string | null;
  /** Contacts for whichever Customer or Account's own Contacts tab is
   * currently showing — same single-slot reasoning as `activities`/
   * `emails`/`tasks`/`notes`/`tickets`/`calendarEvents` above, even
   * though Contact is its own sibling tab rather than an ActivityFeed
   * filter (see Contact model's own docstring). */
  contacts: Contact[];
  contactsLoading: boolean;
  contactsError: string | null;
  /** Whose people `contacts` holds (listScope); null while none are. */
  contactsFor: string | null;
  /** The last contacts read asked for: a slower, earlier one never lands. */
  contactsRequestId?: string;
  /** The Contacts page's list (/contacts): every person the viewer may
   * open, filtered, paged by "Load more" — separate from `contacts`
   * above, which is one organisation's or account's people. */
  allContacts: Contact[];
  allContactsCount: number;
  allContactsNext: string | null;
  allContactsPrevious: string | null;
  allContactsLoading: boolean;
  allContactsError: string | null;
  /** Over the whole filtered set; null until a read lands. */
  allContactsSummary: ContactsSummary | null;
  /** The last list read asked for: a slower, earlier one never lands. */
  allContactsRequestId?: string;
  /** The path that read asked for, so a summary refresh lands only on it. */
  allContactsPath?: string;
  allContactsLoadingMore: boolean;
  allContactsMoreError: string | null;
  /** The Load more in flight for the list on screen; cleared when the list
   *  is read again or someone is deleted, so its late page never lands. */
  allContactsMoreRequestId?: string;
  /** The person the Contacts page's profile shows (/contacts/:id). */
  selectedContact: Contact | null;
  selectedContactLoading: boolean;
  selectedContactError: string | null;
  selectedContactRequestId?: string;
  /** Their calls, emails and tickets (GET /contacts/<id>/history/). */
  selectedContactHistory: ContactHistory | null;
  selectedContactHistoryLoading: boolean;
  selectedContactHistoryError: string | null;
  selectedContactHistoryRequestId?: string;
  /** Every Opportunity the caller's organisation owns — the standalone
   * Pipelines board's own "Opportunities" tab, unpaginated (a Kanban
   * board needs every card in every column at once, see
   * OpportunityListView's own docstring on the backend). */
  opportunities: Opportunity[];
  opportunitiesLoading: boolean;
  opportunitiesError: string | null;
  /** Every Risk the caller's organisation owns — the standalone
   * Pipelines board's own "Risks" tab, unpaginated, same reasoning as
   * `opportunities` above (see RiskListView's own docstring). */
  risks: Risk[];
  risksLoading: boolean;
  risksError: string | null;
  /** The Organization/Account Details page's own "Pipelines" tab —
   * either this Customer's own rolled-up Opportunities (organisation-
   * level and every one of its Accounts', see CustomerOpportunityListView's
   * own docstring) or one specific Account's own, same "one slot reused
   * for whichever scope is currently open, never both at once" pattern
   * as `contacts` above. Deliberately separate from `opportunities`
   * above — that one is the *global*, cross-Customer list the
   * standalone Pipelines board fetches; this is always scoped to a
   * single Customer or Account. */
  pipelineOpportunities: Opportunity[];
  pipelineOpportunitiesLoading: boolean;
  pipelineOpportunitiesError: string | null;
  /** Whose opportunities the slot holds (listScope); null while none are. */
  pipelineOpportunitiesFor: string | null;
  pipelineOpportunitiesRequestId?: string;
  /** Same as `pipelineOpportunities` above, for Risks. */
  pipelineRisks: Risk[];
  pipelineRisksLoading: boolean;
  pipelineRisksError: string | null;
  pipelineRisksFor: string | null;
  pipelineRisksRequestId?: string;
  /** Surveys for whichever Customer or Account ActivityFeed's
   * "Surveys" filter is currently showing — same single-slot reasoning
   * as `activities`/`emails`/`tasks`/`notes`/`tickets`/
   * `calendarEvents` above. Deliberately separate from `surveys` below
   * — that one is the *global*, cross-Customer list the standalone
   * Surveys page fetches; this is always scoped to a single Customer
   * or Account. */
  entitySurveys: Survey[];
  entitySurveysLoading: boolean;
  entitySurveysError: string | null;
  /** Every Survey the caller's organisation owns — the standalone
   * Surveys page, unpaginated (its own rollup cards are computed
   * client-side from this same list, see SurveyListView's own
   * docstring on the backend — same reasoning as `opportunities`
   * above). */
  surveys: Survey[];
  surveysLoading: boolean;
  surveysError: string | null;
  /** The last fetchSurveys asked for: an earlier, slower read (another
   *  organization's) never overwrites it. */
  surveysRequestId?: string;
  /** The organization the last fetchSurveys asked for (null: every one). */
  surveysFilter?: number | null;
  /** Whose surveys `surveys` holds: an organization's id, null for every
   *  one, undefined before the first read lands. */
  surveysFor?: number | null;
}

const initialState: CustomersState = {
  customers: [],
  count: 0,
  totalCount: 0,
  next: null,
  previous: null,
  isLoading: false,
  error: null,
  renewals: [],
  renewalsCount: 0,
  renewalsLoading: false,
  renewalsError: null,
  stats: null,
  statsLoading: false,
  statsError: null,
  selectedCustomer: null,
  selectedCustomerLoading: false,
  selectedCustomerError: null,
  accountsForCustomer: [],
  accountsLoading: false,
  accountsError: null,
  accountsCustomerId: null,
  allAccounts: [],
  allAccountsCount: 0,
  allAccountsNext: null,
  allAccountsPrevious: null,
  allAccountsLoading: false,
  allAccountsError: null,
  accountStats: null,
  accountStatsLoading: false,
  accountStatsError: null,
  activities: [],
  activitiesLoading: false,
  activitiesError: null,
  emails: [],
  emailsLoading: false,
  emailsError: null,
  tasks: [],
  tasksLoading: false,
  tasksError: null,
  notes: [],
  notesLoading: false,
  notesError: null,
  headlines: [],
  headlinesLoading: false,
  headlinesError: null,
  headlinesGenerating: false,
  headlinesGenerateError: null,
  tickets: [],
  ticketsLoading: false,
  ticketsError: null,
  calendarEvents: [],
  calendarEventsLoading: false,
  calendarEventsError: null,
  contacts: [],
  contactsLoading: false,
  contactsError: null,
  contactsFor: null,
  allContacts: [],
  allContactsCount: 0,
  allContactsNext: null,
  allContactsPrevious: null,
  allContactsLoading: false,
  allContactsError: null,
  allContactsSummary: null,
  allContactsLoadingMore: false,
  allContactsMoreError: null,
  selectedContact: null,
  selectedContactLoading: false,
  selectedContactError: null,
  selectedContactHistory: null,
  selectedContactHistoryLoading: false,
  selectedContactHistoryError: null,
  opportunities: [],
  opportunitiesLoading: false,
  opportunitiesError: null,
  risks: [],
  risksLoading: false,
  risksError: null,
  pipelineOpportunities: [],
  pipelineOpportunitiesFor: null,
  pipelineOpportunitiesLoading: false,
  pipelineOpportunitiesError: null,
  pipelineRisks: [],
  pipelineRisksFor: null,
  pipelineRisksLoading: false,
  pipelineRisksError: null,
  entitySurveys: [],
  entitySurveysLoading: false,
  entitySurveysError: null,
  surveys: [],
  surveysLoading: false,
  surveysError: null,
};

// `url`, when given, is one of DRF's own (already-absolute) `next`/
// `previous` links — paging forward/back re-fetches through those instead
// of re-deriving query params here. Omit it for the first page.
export const fetchCustomers = createAsyncThunk<CustomersPage, string | void, { rejectValue: string }>(
  'customers/fetchCustomers',
  async (url, { rejectWithValue }) => {
    try {
      return await apiFetch<CustomersPage>(url || '/customers/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load organizations.';
      return rejectWithValue(message);
    }
  }
);

// `days` becomes `?renewal_within=<days>` — see revenact-backend's
// customers/views.py for the exact window semantics (includes already-
// overdue renewals, not just upcoming ones).
export const fetchUpcomingRenewals = createAsyncThunk<CustomersPage, number, { rejectValue: string }>(
  'customers/fetchUpcomingRenewals',
  async (days, { rejectWithValue }) => {
    try {
      return await apiFetch<CustomersPage>(`/customers/?renewal_within=${days}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load upcoming renewals.';
      return rejectWithValue(message);
    }
  }
);

export const fetchCustomerStats = createAsyncThunk<CustomerStats, void, { rejectValue: string }>(
  'customers/fetchCustomerStats',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<CustomerStats>('/customers/stats/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load stats.';
      return rejectWithValue(message);
    }
  }
);

// Powers Details.tsx (/organizations/:id) — a single organization by its
// backend pk, independent of whatever page/search the list is on.
export const fetchCustomerById = createAsyncThunk<Customer, number, { rejectValue: string }>(
  'customers/fetchCustomerById',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<Customer>(`/customers/${id}/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load this organization.';
      return rejectWithValue(message);
    }
  }
);

// Powers Details.tsx's Accounts tab — every Account under one Customer.
// No pagination envelope, an individual organization's account list is
// expected to stay small.
export const fetchAccountsForCustomer = createAsyncThunk<
  Account[],
  number,
  { rejectValue: string }
>('customers/fetchAccountsForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Account[]>(`/customers/${customerId}/accounts/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load accounts.';
    return rejectWithValue(message);
  }
});

// `name` is the only field the backend requires — everything else in
// AccountWritePayload is optional, matching the quick-add form.
// `customerId` addresses the nested URL; it's never part of the body
// (the backend takes `customer` from the URL, not the payload).
export const createAccount = createAsyncThunk<
  Account,
  { customerId: number } & AccountWritePayload & { name: string },
  { rejectValue: string }
>('customers/createAccount', async ({ customerId, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Account>(`/customers/${customerId}/accounts/`, { method: 'POST', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add account.';
    return rejectWithValue(message);
  }
});

export const updateAccount = createAsyncThunk<
  Account,
  { customerId?: number | null; id: number } & AccountWritePayload,
  { rejectValue: string }
>('customers/updateAccount', async ({ customerId, id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Account>(`${accountBase(id, customerId)}/`, {
      method: 'PATCH',
      body: data,
    });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update account.';
    return rejectWithValue(message);
  }
});

interface AccountsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Account[];
}

// Powers the standalone Accounts page (/accounts/list) — spans every
// Customer the tenant owns, unlike fetchAccountsForCustomer above. Same
// "raw path in, paginated page out" shape as fetchAllContacts: pass a
// full `/accounts/?search=...&company=...` path for a fresh filtered
// fetch, or one of the response's own next/previous links to page
// through it.
export const fetchAllAccounts = createAsyncThunk<AccountsPage, string | void, { rejectValue: string }>(
  'customers/fetchAllAccounts',
  async (url, { rejectWithValue }) => {
    try {
      return await apiFetch<AccountsPage>(url || '/accounts/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load accounts.';
      return rejectWithValue(message);
    }
  }
);

// Powers the standalone Accounts page's own MetricsPanel — same shape
// as fetchCustomerStats above (reuses the CustomerStats type as-is).
export const fetchAccountStats = createAsyncThunk<CustomerStats, void, { rejectValue: string }>(
  'customers/fetchAccountStats',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<CustomerStats>('/accounts/stats/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load stats.';
      return rejectWithValue(message);
    }
  }
);

// Powers ActivityFeed's "Activities" filter on the Organization Details
// page's General tab — every organization-level Activity for one
// Customer.
export const fetchActivitiesForCustomer = createAsyncThunk<
  Activity[],
  number,
  { rejectValue: string }
>('customers/fetchActivitiesForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Activity[]>(`/customers/${customerId}/activities/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load activities.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Activities" filter on the standalone Account
// page — every account-level Activity for one Account. Needs
// `customerId` too since the endpoint is nested under its parent
// Customer (see AccountActivityListView on the backend).
export const fetchActivitiesForAccount = createAsyncThunk<
  Activity[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>('customers/fetchActivitiesForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Activity[]>(`/customers/${customerId}/accounts/${accountId}/activities/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load activities.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Emails" filter on the Organization Details
// page's General tab — every organization-level Email for one
// Customer.
export const fetchEmailsForCustomer = createAsyncThunk<
  Email[],
  number,
  { rejectValue: string }
>('customers/fetchEmailsForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Email[]>(`/customers/${customerId}/emails/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load emails.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Emails" filter on the standalone Account
// page — every account-level Email for one Account.
export const fetchEmailsForAccount = createAsyncThunk<
  Email[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>('customers/fetchEmailsForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Email[]>(`/customers/${customerId}/accounts/${accountId}/emails/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load emails.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Tasks" filter on the Organization Details
// page's General tab — every organization-level Task for one
// Customer.
export const fetchTasksForCustomer = createAsyncThunk<
  Task[],
  number,
  { rejectValue: string }
>('customers/fetchTasksForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Task[]>(`/customers/${customerId}/tasks/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load tasks.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Tasks" filter on the standalone Account
// page — every account-level Task for one Account.
// `customerId` is only optional when `accountId` is given — an
// organisation-level task (no account) always needs its organisation, so
// that shape can't compile without one. See accountOnlyPaths.test.ts.
type CreateTaskParent =
  | { customerId?: number | null; accountId: number }
  | { customerId: number; accountId?: undefined };

export const createTask = createAsyncThunk<
  Task,
  CreateTaskParent & { title: string; due_date: string; priority: Task['priority']; assignee_id?: number | null },
  { rejectValue: string }
>('customers/createTask', async ({ customerId, accountId, ...body }, { rejectWithValue }) => {
  const path = accountId ? `${accountBase(accountId, customerId)}/tasks/` : `/customers/${customerId}/tasks/`;
  try {
    return await apiFetch<Task>(path, { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not save the task.';
    return rejectWithValue(message);
  }
});

export const fetchTasksForAccount = createAsyncThunk<
  Task[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>('customers/fetchTasksForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Task[]>(`/customers/${customerId}/accounts/${accountId}/tasks/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load tasks.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Notes" filter on the Organization Details
// page's General tab — every organization-level Note for one
// Customer.
export const fetchNotesForCustomer = createAsyncThunk<
  Note[],
  number,
  { rejectValue: string }
>('customers/fetchNotesForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Note[]>(`/customers/${customerId}/notes/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load notes.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Notes" filter on the standalone Account
// page — every account-level Note for one Account.
// Same "customerId required only without an account" shape as
// CreateTaskParent above.
type CreateNoteParent =
  | { customerId?: number | null; accountId: number }
  | { customerId: number; accountId?: undefined };

export const createNote = createAsyncThunk<
  Note,
  CreateNoteParent & { title: string; body: string },
  { rejectValue: string }
>('customers/createNote', async ({ customerId, accountId, ...body }, { rejectWithValue }) => {
  const path = accountId ? `${accountBase(accountId, customerId)}/notes/` : `/customers/${customerId}/notes/`;
  try {
    return await apiFetch<Note>(path, { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not save the note.';
    return rejectWithValue(message);
  }
});

export const fetchNotesForAccount = createAsyncThunk<
  Note[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>('customers/fetchNotesForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Note[]>(`/customers/${customerId}/accounts/${accountId}/notes/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load notes.';
    return rejectWithValue(message);
  }
});

// Powers the "Headlines" sub-tab on the Organization Details page —
// every organization-level Headline for one Customer.
export const fetchHeadlinesForCustomer = createAsyncThunk<
  Headline[],
  number,
  { rejectValue: string }
>('customers/fetchHeadlinesForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Headline[]>(`/customers/${customerId}/headlines/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load headlines.';
    return rejectWithValue(message);
  }
});

// Powers the "Headlines" sub-tab on the standalone Account page —
// every account-level Headline for one Account.
export const fetchHeadlinesForAccount = createAsyncThunk<
  Headline[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>('customers/fetchHeadlinesForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Headline[]>(
      `/customers/${customerId}/accounts/${accountId}/headlines/`
    );
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load headlines.';
    return rejectWithValue(message);
  }
});

// The "Regenerate" button on the Headlines tab. POSTs to the generate
// endpoint, which reads the parent's real Notes/Emails/Tickets/
// Activities, rewrites the cards it wrote previously (leaving any
// hand-written one alone), and returns the full new list — so the
// fulfilled payload replaces the slot outright, no refetch needed.
//
// `accountId` omitted means the Customer-scoped endpoint, matching how
// the two fetch thunks above split.
export const regenerateHeadlines = createAsyncThunk<
  Headline[],
  { customerId: number; accountId?: number },
  { rejectValue: string }
>('customers/regenerateHeadlines', async ({ customerId, accountId }, { rejectWithValue }) => {
  const path =
    accountId === undefined
      ? `/customers/${customerId}/headlines/generate/`
      : `/customers/${customerId}/accounts/${accountId}/headlines/generate/`;
  try {
    return await apiFetch<Headline[]>(path, { method: 'POST' });
  } catch (err) {
    // The backend distinguishes "nothing to summarise" (422), "the
    // provider isn't configured" (503) and "the call failed" (502),
    // each with a message worth showing verbatim — a generic fallback
    // here would throw all three away.
    const message = err instanceof ApiError ? err.message : 'Could not regenerate headlines.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Tickets" filter on the Organization Details
// page's General tab — every organization-level Ticket for one
// Customer.
export const fetchTicketsForCustomer = createAsyncThunk<
  Ticket[],
  number,
  { rejectValue: string }
>('customers/fetchTicketsForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Ticket[]>(`/customers/${customerId}/tickets/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load tickets.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Tickets" filter on the standalone Account
// page — every account-level Ticket for one Account.
export const fetchTicketsForAccount = createAsyncThunk<
  Ticket[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>('customers/fetchTicketsForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Ticket[]>(`/customers/${customerId}/accounts/${accountId}/tickets/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load tickets.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Calendar Events" filter on the Organization
// Details page's General tab — every organization-level CalendarEvent
// for one Customer.
export const fetchCalendarEventsForCustomer = createAsyncThunk<
  CalendarEvent[],
  number,
  { rejectValue: string }
>('customers/fetchCalendarEventsForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<CalendarEvent[]>(`/customers/${customerId}/calendar-events/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load calendar events.';
    return rejectWithValue(message);
  }
});

// Powers ActivityFeed's "Calendar Events" filter on the standalone
// Account page — every account-level CalendarEvent for one Account.
export const fetchCalendarEventsForAccount = createAsyncThunk<
  CalendarEvent[],
  { customerId: number; accountId: number },
  { rejectValue: string }
>(
  'customers/fetchCalendarEventsForAccount',
  async ({ customerId, accountId }, { rejectWithValue }) => {
    try {
      return await apiFetch<CalendarEvent[]>(
        `/customers/${customerId}/accounts/${accountId}/calendar-events/`
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load calendar events.';
      return rejectWithValue(message);
    }
  }
);

// Powers the Organization Details page's own Contacts tab — every
// organization-level Contact for one Customer.
export const fetchContactsForCustomer = createAsyncThunk<
  Contact[],
  number,
  { rejectValue: string }
>('customers/fetchContactsForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Contact[]>(`/customers/${customerId}/contacts/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load contacts.';
    return rejectWithValue(message);
  }
});

// Powers the standalone Account page's own Contacts tab — every
// account-level Contact for one Account.
export const fetchContactsForAccount = createAsyncThunk<
  Contact[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>(
  'customers/fetchContactsForAccount',
  async ({ customerId, accountId }, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact[]>(`${accountBase(accountId, customerId)}/contacts/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load contacts.';
      return rejectWithValue(message);
    }
  }
);

// Powers the Contacts page (/contacts) — spans every Customer/Account the
// viewer may open, unlike the two entity-scoped thunks above. Pass a full
// `/contacts/?search=...&customer=...` path (contactsApiPath) for a fresh
// filtered read; loadMoreContacts appends the response's `next` page.
export const fetchAllContacts = createAsyncThunk<ContactsPage, string | void, { rejectValue: string }>(
  'customers/fetchAllContacts',
  async (url, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactsPage>(url || '/contacts/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load contacts.';
      return rejectWithValue(message);
    }
  }
);

/** The summary line again, for the list already on screen (after an edit
 *  changed someone's sentiment or status): the rows and pages loaded stay
 *  as they are, and updateContact has already patched the edited row. */
export const refreshContactsSummary = createAsyncThunk<ContactsSummary | null, string, { rejectValue: string }>(
  'customers/refreshContactsSummary',
  async (url, { rejectWithValue }) => {
    try {
      return (await apiFetch<ContactsPage>(url)).summary ?? null;
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not read the summary.');
    }
  }
);

/** The next page of the Contacts list (a response's own `next` link), appended. */
export const loadMoreContacts = createAsyncThunk<ContactsPage, string, { rejectValue: string }>(
  'customers/loadMoreContacts',
  async (next, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactsPage>(next);
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load more people.');
    }
  }
);

/** What a 404 on a person means: they are gone, or on an account this
 *  viewer cannot open (the backend answers both the same way). */
export const CONTACT_NOT_FOUND = 'This person is not here. They may have been deleted, or they are on an account you cannot open.';

function contactReadError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 404) return CONTACT_NOT_FOUND;
  return err instanceof ApiError ? err.message : fallback;
}

// Powers the Contacts page's profile (/contacts/:id).
export const fetchContactById = createAsyncThunk<Contact, number, { rejectValue: string }>(
  'customers/fetchContactById',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact>(`/contacts/${id}/`);
    } catch (err) {
      return rejectWithValue(contactReadError(err, 'Could not load this contact.'));
    }
  }
);

/** A person's calls, emails and tickets, each under its own record rule. */
export const fetchContactHistory = createAsyncThunk<ContactHistory, number, { rejectValue: string }>(
  'customers/fetchContactHistory',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactHistory>(`/contacts/${id}/history/`);
    } catch (err) {
      return rejectWithValue(contactReadError(err, 'Could not load their calls, emails and tickets.'));
    }
  }
);

// Adds an organization-level Contact under `customerId` — used both by
// the Organization Details page's own Contacts tab (customerId fixed)
// and the Contacts page's (/contacts) "Add Contact" (customerId
// picked from a dropdown; that page only ever creates org-level
// Contacts, there's no account-picker on it). No extraReducers case:
// unlike createAccount (which unshifts into the single
// accountsForCustomer slot), a created Contact could belong to either
// of two different slots (`contacts` or `allContacts`) depending on
// which page is asking — simpler and just as correct for the caller
// to refetch its own list after `.unwrap()` resolves, same as this
// thunk's own error handling (surfaced via the thrown error, not
// Redux state, matching AccountFormModal's own convention).
export const createContactForCustomer = createAsyncThunk<
  Contact,
  { customerId: number } & ContactWritePayload & { name: string; email: string },
  { rejectValue: string }
>('customers/createContactForCustomer', async ({ customerId, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Contact>(`/customers/${customerId}/contacts/`, { method: 'POST', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add contact.';
    return rejectWithValue(message);
  }
});

// Adds an account-level Contact under `accountId` — used by the
// standalone Account page's own Contacts tab's "Add Contact". Same
// "caller refetches" reasoning as createContactForCustomer above (this
// one's own caller is ContactsTab itself, via customerId/accountId
// props it already has for exactly this reason).
export const createContactForAccount = createAsyncThunk<
  Contact,
  { customerId?: number | null; accountId: number } & ContactWritePayload & { name: string; email: string },
  { rejectValue: string }
>(
  'customers/createContactForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact>(`${accountBase(accountId, customerId)}/contacts/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add contact.';
      return rejectWithValue(message);
    }
  }
);

// PATCH /api/v1/contacts/<id>/ — works for a Contact of either parent
// shape (see ContactDetailView's own docstring); same "caller
// refetches" reasoning as createContactForCustomer above.
export const updateContact = createAsyncThunk<
  Contact,
  { id: number } & ContactWritePayload,
  { rejectValue: string }
>('customers/updateContact', async ({ id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Contact>(`/contacts/${id}/`, { method: 'PATCH', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update contact.';
    return rejectWithValue(message);
  }
});

// DELETE /api/v1/contacts/<id>/ — same reasoning as updateContact above.
export const deleteContact = createAsyncThunk<number, number, { rejectValue: string }>(
  'customers/deleteContact',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<null>(`/contacts/${id}/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete contact.';
      return rejectWithValue(message);
    }
  }
);

// Powers the standalone Pipelines board's own "Opportunities" tab —
// every Opportunity the caller's organisation owns, org-level and
// account-level alike. Unpaginated (see OpportunityListView's own
// docstring) — a plain array, not a paginated envelope like
// fetchAllContacts.
export const fetchOpportunities = createAsyncThunk<Opportunity[], void, { rejectValue: string }>(
  'customers/fetchOpportunities',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<Opportunity[]>('/opportunities/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load opportunities.';
      return rejectWithValue(message);
    }
  }
);

// `customerId`/`accountId` — exactly one — become `customer_id`/
// `account_id` in the POST body; neither is a real OpportunitySerializer
// field, OpportunityListView's own perform_create reads them straight
// off the request to resolve which parent to create under (see that
// view's own docstring on the backend). Unlike createContactForCustomer,
// this thunk's own extraReducers can safely unshift the result straight
// into `opportunities` — there's only the one board-wide list to land
// in, not two possible slots.
export const createOpportunity = createAsyncThunk<
  Opportunity,
  { customerId?: number; accountId?: number } & OpportunityWritePayload & { title: string },
  { rejectValue: string }
>('customers/createOpportunity', async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
  const body =
    accountId !== undefined
      ? { ...data, account_id: accountId }
      : { ...data, customer_id: customerId };
  try {
    return await apiFetch<Opportunity>('/opportunities/', { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add opportunity.';
    return rejectWithValue(message);
  }
});

// PATCH /api/v1/opportunities/<id>/ — powers both the board's drag-
// and-drop (stage only) and its full Edit form.
export const updateOpportunity = createAsyncThunk<
  Opportunity,
  { id: number } & OpportunityWritePayload,
  { rejectValue: string }
>('customers/updateOpportunity', async ({ id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Opportunity>(`/opportunities/${id}/`, { method: 'PATCH', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update opportunity.';
    return rejectWithValue(message);
  }
});

export const deleteOpportunity = createAsyncThunk<number, number, { rejectValue: string }>(
  'customers/deleteOpportunity',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<null>(`/opportunities/${id}/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete opportunity.';
      return rejectWithValue(message);
    }
  }
);

// Powers the standalone Pipelines board's own "Risks" tab — same
// shape as fetchOpportunities above, field-for-field.
export const fetchRisks = createAsyncThunk<Risk[], void, { rejectValue: string }>(
  'customers/fetchRisks',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<Risk[]>('/risks/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load risks.';
      return rejectWithValue(message);
    }
  }
);

// Same `customerId`/`accountId` -> `customer_id`/`account_id` shape as
// createOpportunity above, same reasoning throughout.
export const createRisk = createAsyncThunk<
  Risk,
  { customerId?: number; accountId?: number } & RiskWritePayload & { title: string },
  { rejectValue: string }
>('customers/createRisk', async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
  const body =
    accountId !== undefined
      ? { ...data, account_id: accountId }
      : { ...data, customer_id: customerId };
  try {
    return await apiFetch<Risk>('/risks/', { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add risk.';
    return rejectWithValue(message);
  }
});

// PATCH /api/v1/risks/<id>/ — powers both the board's drag-and-drop
// (stage only) and its full Edit form.
export const updateRisk = createAsyncThunk<
  Risk,
  { id: number } & RiskWritePayload,
  { rejectValue: string }
>('customers/updateRisk', async ({ id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Risk>(`/risks/${id}/`, { method: 'PATCH', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update risk.';
    return rejectWithValue(message);
  }
});

export const deleteRisk = createAsyncThunk<number, number, { rejectValue: string }>(
  'customers/deleteRisk',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<null>(`/risks/${id}/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete risk.';
      return rejectWithValue(message);
    }
  }
);

// Powers the standalone Surveys page — every Survey across every
// Customer/Account the caller's organisation owns, or with `customerId`
// one organisation's (organisation-level and its visible accounts', spec
// 2026-09-27 §5). Unpaginated (see SurveyListView's own docstring on the
// backend — its own rollup cards are computed client-side from this list).
export const fetchSurveys = createAsyncThunk<Survey[], number | void, { rejectValue: string }>(
  'customers/fetchSurveys',
  async (customerId, { rejectWithValue }) => {
    try {
      return await apiFetch<Survey[]>(customerId ? `/surveys/?customer=${customerId}` : '/surveys/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load surveys.';
      return rejectWithValue(message);
    }
  }
);

// Same `customerId`/`accountId` -> `customer_id`/`account_id` shape as
// createOpportunity/createRisk above, same reasoning throughout —
// "Log Survey" from the standalone Surveys page's own company picker.
export const createSurvey = createAsyncThunk<
  Survey,
  { customerId?: number; accountId?: number } & SurveyWritePayload & { survey_type: Survey['survey_type']; sent_at: string },
  { rejectValue: string }
>('customers/createSurvey', async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
  const body =
    accountId !== undefined
      ? { ...data, account_id: accountId }
      : { ...data, customer_id: customerId };
  try {
    return await apiFetch<Survey>('/surveys/', { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add survey.';
    return rejectWithValue(message);
  }
});

// PATCH /api/v1/surveys/<id>/ — "Log Response" (status/score) as well
// as any other edit.
export const updateSurvey = createAsyncThunk<
  Survey,
  { id: number } & SurveyWritePayload,
  { rejectValue: string }
>('customers/updateSurvey', async ({ id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Survey>(`/surveys/${id}/`, { method: 'PATCH', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update survey.';
    return rejectWithValue(message);
  }
});

export const deleteSurvey = createAsyncThunk<number, number, { rejectValue: string }>(
  'customers/deleteSurvey',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<null>(`/surveys/${id}/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete survey.';
      return rejectWithValue(message);
    }
  }
);

// Powers the Organization Details page's own Deals & risks tab — every
// Opportunity rolled up for one Customer (organisation-level and every
// one of its Accounts' — see CustomerOpportunityListView's own
// docstring), same reasoning as fetchContactsForCustomer above.
export const fetchOpportunitiesForCustomer = createAsyncThunk<
  Opportunity[],
  number,
  { rejectValue: string }
>('customers/fetchOpportunitiesForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Opportunity[]>(`/customers/${customerId}/opportunities/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load opportunities.';
    return rejectWithValue(message);
  }
});

// Powers the standalone Account page's own Deals & risks tab — every
// account-level Opportunity for one Account.
export const fetchOpportunitiesForAccount = createAsyncThunk<
  Opportunity[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>(
  'customers/fetchOpportunitiesForAccount',
  async ({ customerId, accountId }, { rejectWithValue }) => {
    try {
      return await apiFetch<Opportunity[]>(`${accountBase(accountId, customerId)}/opportunities/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load opportunities.';
      return rejectWithValue(message);
    }
  }
);

// Adds an organization-level Opportunity under `customerId` — used by
// the Organization Details page's own Deals & risks tab. No extraReducers
// case, same "caller refetches" reasoning as createContactForCustomer
// — this thunk doesn't know whether the caller is a scoped Details-page
// tab (`pipelineOpportunities`) or something else, so it can't safely
// patch a specific slot itself.
export const createOpportunityForCustomer = createAsyncThunk<
  Opportunity,
  { customerId: number } & OpportunityWritePayload & { title: string },
  { rejectValue: string }
>(
  'customers/createOpportunityForCustomer',
  async ({ customerId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Opportunity>(`/customers/${customerId}/opportunities/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add opportunity.';
      return rejectWithValue(message);
    }
  }
);

// Adds an account-level Opportunity under `accountId` — used by the
// standalone Account page's own Deals & risks tab. Same "caller refetches"
// reasoning as createOpportunityForCustomer above.
export const createOpportunityForAccount = createAsyncThunk<
  Opportunity,
  { customerId?: number | null; accountId: number } & OpportunityWritePayload & { title: string },
  { rejectValue: string }
>(
  'customers/createOpportunityForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Opportunity>(`${accountBase(accountId, customerId)}/opportunities/`, { method: 'POST', body: data });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add opportunity.';
      return rejectWithValue(message);
    }
  }
);

// Same shape as fetchOpportunitiesForCustomer/fetchOpportunitiesForAccount
// above, for Risks.
export const fetchRisksForCustomer = createAsyncThunk<Risk[], number, { rejectValue: string }>(
  'customers/fetchRisksForCustomer',
  async (customerId, { rejectWithValue }) => {
    try {
      return await apiFetch<Risk[]>(`/customers/${customerId}/risks/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load risks.';
      return rejectWithValue(message);
    }
  }
);

export const fetchRisksForAccount = createAsyncThunk<
  Risk[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>('customers/fetchRisksForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Risk[]>(`${accountBase(accountId, customerId)}/risks/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load risks.';
    return rejectWithValue(message);
  }
});

// Same shape as createOpportunityForCustomer/createOpportunityForAccount
// above, for Risks.
export const createRiskForCustomer = createAsyncThunk<
  Risk,
  { customerId: number } & RiskWritePayload & { title: string },
  { rejectValue: string }
>('customers/createRiskForCustomer', async ({ customerId, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Risk>(`/customers/${customerId}/risks/`, { method: 'POST', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add risk.';
    return rejectWithValue(message);
  }
});

export const createRiskForAccount = createAsyncThunk<
  Risk,
  { customerId?: number | null; accountId: number } & RiskWritePayload & { title: string },
  { rejectValue: string }
>(
  'customers/createRiskForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Risk>(`${accountBase(accountId, customerId)}/risks/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add risk.';
      return rejectWithValue(message);
    }
  }
);

// Powers the Activity Feed's own "Surveys" filter — every Survey
// rolled up for one Customer (organisation-level and every one of its
// Accounts', see CustomerSurveyListView's own docstring on the backend).
export const fetchSurveysForCustomer = createAsyncThunk<
  Survey[],
  number,
  { rejectValue: string }
>('customers/fetchSurveysForCustomer', async (customerId, { rejectWithValue }) => {
  try {
    return await apiFetch<Survey[]>(`/customers/${customerId}/surveys/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load surveys.';
    return rejectWithValue(message);
  }
});

// Powers the standalone Account page's own Surveys filter — every
// account-level Survey for one Account.
export const fetchSurveysForAccount = createAsyncThunk<
  Survey[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>('customers/fetchSurveysForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Survey[]>(`${accountBase(accountId, customerId)}/surveys/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load surveys.';
    return rejectWithValue(message);
  }
});

// Adds an organization-level Survey under `customerId` — "Log Survey"
// from inside the Activity Feed's own Surveys tab. No extraReducers
// case, same "caller refetches" reasoning as createOpportunityForCustomer.
export const createSurveyForCustomer = createAsyncThunk<
  Survey,
  { customerId: number } & SurveyWritePayload & { survey_type: Survey['survey_type']; sent_at: string },
  { rejectValue: string }
>('customers/createSurveyForCustomer', async ({ customerId, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Survey>(`/customers/${customerId}/surveys/`, {
      method: 'POST',
      body: data,
    });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add survey.';
    return rejectWithValue(message);
  }
});

export const createSurveyForAccount = createAsyncThunk<
  Survey,
  { customerId?: number | null; accountId: number } & SurveyWritePayload & {
      survey_type: Survey['survey_type'];
      sent_at: string;
    },
  { rejectValue: string }
>(
  'customers/createSurveyForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Survey>(`${accountBase(accountId, customerId)}/surveys/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add survey.';
      return rejectWithValue(message);
    }
  }
);

// `name` is the only field the backend requires — everything else in
// CustomerWritePayload is optional, matching the quick-add form.
export const createCustomer = createAsyncThunk<
  Customer,
  CustomerWritePayload & { name: string },
  { rejectValue: string }
>('customers/createCustomer', async (data, { rejectWithValue }) => {
  try {
    return await apiFetch<Customer>('/customers/', { method: 'POST', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add organization.';
    return rejectWithValue(message);
  }
});

// Backs Edit, Churn, and Archive/Unarchive alike — each just sends a
// different subset of CustomerWritePayload as a partial update.
export const updateCustomer = createAsyncThunk<
  Customer,
  { id: number } & CustomerWritePayload,
  { rejectValue: string }
>('customers/updateCustomer', async ({ id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Customer>(`/customers/${id}/`, { method: 'PATCH', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update organization.';
    return rejectWithValue(message);
  }
});

const customersSlice = createSlice({
  name: 'customers',
  initialState,
  reducers: {
    // ActivityFeed calls this when it's mounted for an account reached
    // with no resolvable real ids (a direct URL visit/refresh with no
    // navigation state — see AccountDetails' own comment on that
    // fallback). Without it, switching from a real entity's Activities
    // straight into that fallback would leave the previous entity's
    // activities on screen instead of the correct "none loaded" state.
    clearActivities(state) {
      state.activities = [];
      state.activitiesLoading = false;
      state.activitiesError = null;
    },
    // Same reasoning as clearActivities above, for the "Emails" filter.
    clearEmails(state) {
      state.emails = [];
      state.emailsLoading = false;
      state.emailsError = null;
    },
    // Same reasoning as clearActivities/clearEmails above, for the
    // "Tasks" filter.
    clearTasks(state) {
      state.tasks = [];
      state.tasksLoading = false;
      state.tasksError = null;
    },
    // Same reasoning as clearActivities/clearEmails/clearTasks above,
    // for the "Notes" filter.
    clearNotes(state) {
      state.notes = [];
      state.notesLoading = false;
      state.notesError = null;
    },
    // Same reasoning as clearActivities/clearEmails/clearTasks/
    // clearNotes above, for the "Headlines" sub-tab.
    clearHeadlines(state) {
      state.headlines = [];
      state.headlinesLoading = false;
      state.headlinesError = null;
      state.headlinesGenerating = false;
      state.headlinesGenerateError = null;
    },
    // Same reasoning as clearActivities/clearEmails/clearTasks/
    // clearNotes above, for the "Tickets" filter.
    clearTickets(state) {
      state.tickets = [];
      state.ticketsLoading = false;
      state.ticketsError = null;
    },
    // Same reasoning as clearActivities/clearEmails/clearTasks/
    // clearNotes/clearTickets above, for the "Calendar Events" filter.
    clearCalendarEvents(state) {
      state.calendarEvents = [];
      state.calendarEventsLoading = false;
      state.calendarEventsError = null;
    },
    // Same reasoning as clearActivities/clearEmails/clearTasks/
    // clearNotes/clearTickets/clearCalendarEvents above, for the
    // "Surveys" filter.
    clearSurveys(state) {
      state.entitySurveys = [];
      state.entitySurveysLoading = false;
      state.entitySurveysError = null;
    },
    // Same reasoning as clearActivities/clearEmails/clearTasks/
    // clearNotes/clearTickets/clearCalendarEvents above, for a
    // Customer/Account's own Contacts tab.
    clearContacts(state) {
      state.contacts = [];
      state.contactsFor = null;
      state.contactsLoading = false;
      state.contactsError = null;
    },
    // Same reasoning as clearContacts above, for the standalone Account
    // page's own Organizations tab — a mock-fallback account has no
    // real parent Customer id to fetch, so any previously-fetched
    // selectedCustomer needs clearing rather than showing stale data.
    clearSelectedCustomer(state) {
      state.selectedCustomer = null;
      state.selectedCustomerLoading = false;
      state.selectedCustomerError = null;
    },
    // Same reasoning as clearContacts above, for the Organization/
    // Account Details page's own Deals & risks tab.
    clearPipelineData(state) {
      state.pipelineOpportunities = [];
      state.pipelineOpportunitiesFor = null;
      state.pipelineOpportunitiesLoading = false;
      state.pipelineOpportunitiesError = null;
      state.pipelineRisks = [];
      state.pipelineRisksFor = null;
      state.pipelineRisksLoading = false;
      state.pipelineRisksError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.customers = action.payload.results;
        state.count = action.payload.count;
        state.next = action.payload.next;
        state.previous = action.payload.previous;
        // `action.meta.arg` is the exact URL this fetch was dispatched
        // with. A search-filtered fetch (this one, or a next/previous page
        // reached while a search is active — DRF's pagination links carry
        // existing query params through) still has `search=` in it; same
        // for a dashboard drill's `ids=` — only a plain listing fetch
        // updates the "onboarded overall" total.
        const url = action.meta.arg;
        if (!url || (!url.includes('search=') && !url.includes('ids='))) {
          state.totalCount = action.payload.count;
        }
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchUpcomingRenewals.pending, (state) => {
        state.renewalsLoading = true;
        state.renewalsError = null;
      })
      .addCase(fetchUpcomingRenewals.fulfilled, (state, action) => {
        state.renewalsLoading = false;
        state.renewals = action.payload.results;
        state.renewalsCount = action.payload.count;
      })
      .addCase(fetchUpcomingRenewals.rejected, (state, action) => {
        state.renewalsLoading = false;
        state.renewalsError = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchCustomerStats.pending, (state) => {
        state.statsLoading = true;
        state.statsError = null;
      })
      .addCase(fetchCustomerStats.fulfilled, (state, action) => {
        state.statsLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchCustomerStats.rejected, (state, action) => {
        state.statsLoading = false;
        state.statsError = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchCustomerById.pending, (state) => {
        state.selectedCustomerLoading = true;
        state.selectedCustomerError = null;
        // Cleared, not left stale — otherwise navigating straight from one
        // org's Details page to another's briefly shows the previous org's
        // data under the new id while the fetch is in flight.
        state.selectedCustomer = null;
      })
      .addCase(fetchCustomerById.fulfilled, (state, action) => {
        state.selectedCustomerLoading = false;
        state.selectedCustomer = action.payload;
      })
      .addCase(fetchCustomerById.rejected, (state, action) => {
        state.selectedCustomerLoading = false;
        state.selectedCustomerError = action.payload ?? 'Could not load this organization.';
      })
      .addCase(fetchAccountsForCustomer.pending, (state, action) => {
        state.accountsLoading = true;
        state.accountsError = null;
        state.accountsCustomerId = action.meta.arg;
        // Cleared for the same reason as selectedCustomer's own pending
        // case — otherwise switching orgs briefly shows the previous
        // org's accounts under the new one's tab.
        state.accountsForCustomer = [];
      })
      .addCase(fetchAccountsForCustomer.fulfilled, (state, action) => {
        // A slower read for the organization before this one: not its accounts.
        if (action.meta.arg !== state.accountsCustomerId) return;
        state.accountsLoading = false;
        state.accountsForCustomer = action.payload;
      })
      .addCase(fetchAccountsForCustomer.rejected, (state, action) => {
        if (action.meta.arg !== state.accountsCustomerId) return;
        state.accountsLoading = false;
        state.accountsError = action.payload ?? 'Could not load accounts.';
      })
      .addCase(fetchAllAccounts.pending, (state) => {
        state.allAccountsLoading = true;
        state.allAccountsError = null;
      })
      .addCase(fetchAllAccounts.fulfilled, (state, action) => {
        state.allAccountsLoading = false;
        state.allAccounts = action.payload.results;
        state.allAccountsCount = action.payload.count;
        state.allAccountsNext = action.payload.next;
        state.allAccountsPrevious = action.payload.previous;
      })
      .addCase(fetchAllAccounts.rejected, (state, action) => {
        state.allAccountsLoading = false;
        state.allAccountsError = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchAccountStats.pending, (state) => {
        state.accountStatsLoading = true;
        state.accountStatsError = null;
      })
      .addCase(fetchAccountStats.fulfilled, (state, action) => {
        state.accountStatsLoading = false;
        state.accountStats = action.payload;
      })
      .addCase(fetchAccountStats.rejected, (state, action) => {
        state.accountStatsLoading = false;
        state.accountStatsError = action.payload ?? 'Could not load stats.';
      })
      // fetchActivitiesForCustomer and fetchActivitiesForAccount share the
      // same activities/activitiesLoading/activitiesError slots — only one
      // of the two is ever in flight at a time, same reasoning as the
      // single accountsForCustomer slot above.
      .addCase(fetchActivitiesForCustomer.pending, (state) => {
        state.activitiesLoading = true;
        state.activitiesError = null;
        state.activities = [];
      })
      .addCase(fetchActivitiesForCustomer.fulfilled, (state, action) => {
        state.activitiesLoading = false;
        state.activities = action.payload;
      })
      .addCase(fetchActivitiesForCustomer.rejected, (state, action) => {
        state.activitiesLoading = false;
        state.activitiesError = action.payload ?? 'Could not load activities.';
      })
      .addCase(fetchActivitiesForAccount.pending, (state) => {
        state.activitiesLoading = true;
        state.activitiesError = null;
        state.activities = [];
      })
      .addCase(fetchActivitiesForAccount.fulfilled, (state, action) => {
        state.activitiesLoading = false;
        state.activities = action.payload;
      })
      .addCase(fetchActivitiesForAccount.rejected, (state, action) => {
        state.activitiesLoading = false;
        state.activitiesError = action.payload ?? 'Could not load activities.';
      })
      // fetchEmailsForCustomer and fetchEmailsForAccount share the same
      // emails/emailsLoading/emailsError slots, same reasoning as the
      // activities slots above.
      .addCase(fetchEmailsForCustomer.pending, (state) => {
        state.emailsLoading = true;
        state.emailsError = null;
        state.emails = [];
      })
      .addCase(fetchEmailsForCustomer.fulfilled, (state, action) => {
        state.emailsLoading = false;
        state.emails = action.payload;
      })
      .addCase(fetchEmailsForCustomer.rejected, (state, action) => {
        state.emailsLoading = false;
        state.emailsError = action.payload ?? 'Could not load emails.';
      })
      .addCase(fetchEmailsForAccount.pending, (state) => {
        state.emailsLoading = true;
        state.emailsError = null;
        state.emails = [];
      })
      .addCase(fetchEmailsForAccount.fulfilled, (state, action) => {
        state.emailsLoading = false;
        state.emails = action.payload;
      })
      .addCase(fetchEmailsForAccount.rejected, (state, action) => {
        state.emailsLoading = false;
        state.emailsError = action.payload ?? 'Could not load emails.';
      })
      // fetchTasksForCustomer and fetchTasksForAccount share the same
      // tasks/tasksLoading/tasksError slots, same reasoning as the
      // activities/emails slots above.
      .addCase(createTask.fulfilled, (state, action) => {
        state.tasks = [action.payload, ...state.tasks];
      })
      .addCase(fetchTasksForCustomer.pending, (state) => {
        state.tasksLoading = true;
        state.tasksError = null;
        state.tasks = [];
      })
      .addCase(fetchTasksForCustomer.fulfilled, (state, action) => {
        state.tasksLoading = false;
        state.tasks = action.payload;
      })
      .addCase(fetchTasksForCustomer.rejected, (state, action) => {
        state.tasksLoading = false;
        state.tasksError = action.payload ?? 'Could not load tasks.';
      })
      .addCase(fetchTasksForAccount.pending, (state) => {
        state.tasksLoading = true;
        state.tasksError = null;
        state.tasks = [];
      })
      .addCase(fetchTasksForAccount.fulfilled, (state, action) => {
        state.tasksLoading = false;
        state.tasks = action.payload;
      })
      .addCase(fetchTasksForAccount.rejected, (state, action) => {
        state.tasksLoading = false;
        state.tasksError = action.payload ?? 'Could not load tasks.';
      })
      // fetchNotesForCustomer and fetchNotesForAccount share the same
      // notes/notesLoading/notesError slots, same reasoning as the
      // activities/emails/tasks slots above.
      .addCase(createNote.fulfilled, (state, action) => {
        state.notes = [action.payload, ...state.notes];
      })
      .addCase(fetchNotesForCustomer.pending, (state) => {
        state.notesLoading = true;
        state.notesError = null;
        state.notes = [];
      })
      .addCase(fetchNotesForCustomer.fulfilled, (state, action) => {
        state.notesLoading = false;
        state.notes = action.payload;
      })
      .addCase(fetchNotesForCustomer.rejected, (state, action) => {
        state.notesLoading = false;
        state.notesError = action.payload ?? 'Could not load notes.';
      })
      .addCase(fetchNotesForAccount.pending, (state) => {
        state.notesLoading = true;
        state.notesError = null;
        state.notes = [];
      })
      .addCase(fetchNotesForAccount.fulfilled, (state, action) => {
        state.notesLoading = false;
        state.notes = action.payload;
      })
      .addCase(fetchNotesForAccount.rejected, (state, action) => {
        state.notesLoading = false;
        state.notesError = action.payload ?? 'Could not load notes.';
      })
      // fetchHeadlinesForCustomer and fetchHeadlinesForAccount share
      // the same headlines/headlinesLoading/headlinesError slots, same
      // reasoning as the activities/emails/tasks/notes slots above.
      .addCase(fetchHeadlinesForCustomer.pending, (state) => {
        state.headlinesLoading = true;
        state.headlinesError = null;
        state.headlines = [];
      })
      .addCase(fetchHeadlinesForCustomer.fulfilled, (state, action) => {
        state.headlinesLoading = false;
        state.headlines = action.payload;
      })
      .addCase(fetchHeadlinesForCustomer.rejected, (state, action) => {
        state.headlinesLoading = false;
        state.headlinesError = action.payload ?? 'Could not load headlines.';
      })
      .addCase(fetchHeadlinesForAccount.pending, (state) => {
        state.headlinesLoading = true;
        state.headlinesError = null;
        state.headlines = [];
      })
      .addCase(fetchHeadlinesForAccount.fulfilled, (state, action) => {
        state.headlinesLoading = false;
        state.headlines = action.payload;
      })
      .addCase(fetchHeadlinesForAccount.rejected, (state, action) => {
        state.headlinesLoading = false;
        state.headlinesError = action.payload ?? 'Could not load headlines.';
      })
      // Regenerate deliberately leaves `headlines` alone while it runs
      // and when it fails — the old cards stay on screen until new ones
      // genuinely arrive, so a failed regenerate never costs the user
      // what they were already reading.
      .addCase(regenerateHeadlines.pending, (state) => {
        state.headlinesGenerating = true;
        state.headlinesGenerateError = null;
      })
      .addCase(regenerateHeadlines.fulfilled, (state, action) => {
        state.headlinesGenerating = false;
        state.headlines = action.payload;
      })
      .addCase(regenerateHeadlines.rejected, (state, action) => {
        state.headlinesGenerating = false;
        state.headlinesGenerateError = action.payload ?? 'Could not regenerate headlines.';
      })
      // fetchTicketsForCustomer and fetchTicketsForAccount share the
      // same tickets/ticketsLoading/ticketsError slots, same reasoning
      // as the activities/emails/tasks/notes slots above.
      .addCase(fetchTicketsForCustomer.pending, (state) => {
        state.ticketsLoading = true;
        state.ticketsError = null;
        state.tickets = [];
      })
      .addCase(fetchTicketsForCustomer.fulfilled, (state, action) => {
        state.ticketsLoading = false;
        state.tickets = action.payload;
      })
      .addCase(fetchTicketsForCustomer.rejected, (state, action) => {
        state.ticketsLoading = false;
        state.ticketsError = action.payload ?? 'Could not load tickets.';
      })
      .addCase(fetchTicketsForAccount.pending, (state) => {
        state.ticketsLoading = true;
        state.ticketsError = null;
        state.tickets = [];
      })
      .addCase(fetchTicketsForAccount.fulfilled, (state, action) => {
        state.ticketsLoading = false;
        state.tickets = action.payload;
      })
      .addCase(fetchTicketsForAccount.rejected, (state, action) => {
        state.ticketsLoading = false;
        state.ticketsError = action.payload ?? 'Could not load tickets.';
      })
      // fetchCalendarEventsForCustomer and fetchCalendarEventsForAccount
      // share the same calendarEvents/calendarEventsLoading/
      // calendarEventsError slots, same reasoning as the other feed
      // filters' slots above.
      .addCase(fetchCalendarEventsForCustomer.pending, (state) => {
        state.calendarEventsLoading = true;
        state.calendarEventsError = null;
        state.calendarEvents = [];
      })
      .addCase(fetchCalendarEventsForCustomer.fulfilled, (state, action) => {
        state.calendarEventsLoading = false;
        state.calendarEvents = action.payload;
      })
      .addCase(fetchCalendarEventsForCustomer.rejected, (state, action) => {
        state.calendarEventsLoading = false;
        state.calendarEventsError = action.payload ?? 'Could not load calendar events.';
      })
      .addCase(fetchCalendarEventsForAccount.pending, (state) => {
        state.calendarEventsLoading = true;
        state.calendarEventsError = null;
        state.calendarEvents = [];
      })
      .addCase(fetchCalendarEventsForAccount.fulfilled, (state, action) => {
        state.calendarEventsLoading = false;
        state.calendarEvents = action.payload;
      })
      .addCase(fetchCalendarEventsForAccount.rejected, (state, action) => {
        state.calendarEventsLoading = false;
        state.calendarEventsError = action.payload ?? 'Could not load calendar events.';
      })
      // fetchContactsForCustomer and fetchContactsForAccount share the
      // same contacts/contactsLoading/contactsError slots, same
      // reasoning as the other feed filters' slots above.
      .addCase(fetchContactsForCustomer.pending, (state, action) => {
        state.contactsLoading = true;
        state.contactsError = null;
        state.contactsRequestId = action.meta.requestId;
        // A read again for the same scope keeps its rows until the new ones
        // land; another organization's or account's never show under this one.
        if (listScope(action.meta.arg) !== state.contactsFor) {
          state.contacts = [];
          state.contactsFor = null;
        }
      })
      .addCase(fetchContactsForCustomer.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.contactsRequestId) return;
        state.contactsLoading = false;
        state.contacts = action.payload;
        state.contactsFor = listScope(action.meta.arg);
      })
      .addCase(fetchContactsForCustomer.rejected, (state, action) => {
        if (action.meta.requestId !== state.contactsRequestId) return;
        state.contactsLoading = false;
        state.contactsError = action.payload ?? 'Could not load contacts.';
      })
      .addCase(fetchContactsForAccount.pending, (state, action) => {
        state.contactsLoading = true;
        state.contactsError = null;
        state.contactsRequestId = action.meta.requestId;
        // A read again for the same scope keeps its rows until the new ones
        // land; another organization's or account's never show under this one.
        if (listScope(action.meta.arg.customerId, action.meta.arg.accountId) !== state.contactsFor) {
          state.contacts = [];
          state.contactsFor = null;
        }
      })
      .addCase(fetchContactsForAccount.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.contactsRequestId) return;
        state.contactsLoading = false;
        state.contacts = action.payload;
        state.contactsFor = listScope(action.meta.arg.customerId, action.meta.arg.accountId);
      })
      .addCase(fetchContactsForAccount.rejected, (state, action) => {
        if (action.meta.requestId !== state.contactsRequestId) return;
        state.contactsLoading = false;
        state.contactsError = action.payload ?? 'Could not load contacts.';
      })
      .addCase(fetchAllContacts.pending, (state, action) => {
        state.allContactsRequestId = action.meta.requestId;
        state.allContactsPath = action.meta.arg || '/contacts/';
        state.allContactsMoreRequestId = undefined;
        state.allContactsLoading = true;
        state.allContactsError = null;
        state.allContactsLoadingMore = false;
        state.allContactsMoreError = null;
      })
      .addCase(fetchAllContacts.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.allContactsRequestId) return;
        state.allContactsLoading = false;
        state.allContacts = action.payload.results;
        state.allContactsCount = action.payload.count;
        state.allContactsNext = action.payload.next;
        state.allContactsPrevious = action.payload.previous;
        state.allContactsSummary = action.payload.summary ?? null;
      })
      .addCase(fetchAllContacts.rejected, (state, action) => {
        if (action.meta.requestId !== state.allContactsRequestId) return;
        state.allContactsLoading = false;
        state.allContactsError = action.payload ?? 'Something went wrong.';
      })
      // A failed refresh keeps the summary it had.
      .addCase(refreshContactsSummary.fulfilled, (state, action) => {
        if (state.allContactsLoading || action.meta.arg !== state.allContactsPath || !action.payload) return;
        state.allContactsSummary = action.payload;
      })
      .addCase(loadMoreContacts.pending, (state, action) => {
        state.allContactsMoreRequestId = action.meta.requestId;
        state.allContactsLoadingMore = true;
        state.allContactsMoreError = null;
      })
      // A page lands only on the list it continues: not while a fresh read
      // is on its way, and not after one replaced the list or a delete
      // shifted it (the request id; the new list's `next` can be the same URL).
      .addCase(loadMoreContacts.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.allContactsMoreRequestId) return;
        if (state.allContactsLoading || state.allContactsNext !== action.meta.arg) return;
        state.allContactsLoadingMore = false;
        const seen = new Set(state.allContacts.map((c) => c.id));
        state.allContacts.push(...action.payload.results.filter((c) => !seen.has(c.id)));
        state.allContactsCount = action.payload.count;
        state.allContactsNext = action.payload.next;
      })
      .addCase(loadMoreContacts.rejected, (state, action) => {
        if (action.meta.requestId !== state.allContactsMoreRequestId) return;
        if (state.allContactsNext !== action.meta.arg) return;
        state.allContactsLoadingMore = false;
        state.allContactsMoreError = action.payload ?? 'Could not load more people.';
      })
      .addCase(fetchContactById.pending, (state, action) => {
        state.selectedContactRequestId = action.meta.requestId;
        state.selectedContactLoading = true;
        state.selectedContactError = null;
        // Another person: cleared, not left stale (same reasoning as
        // fetchCustomerById). The same person read again (after a save)
        // stays on screen until the fresh copy lands.
        if (state.selectedContact?.id !== action.meta.arg) state.selectedContact = null;
      })
      .addCase(fetchContactById.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.selectedContactRequestId) return;
        state.selectedContactLoading = false;
        state.selectedContact = action.payload;
      })
      .addCase(fetchContactById.rejected, (state, action) => {
        if (action.meta.requestId !== state.selectedContactRequestId) return;
        state.selectedContactLoading = false;
        state.selectedContactError = action.payload ?? 'Could not load this contact.';
      })
      .addCase(fetchContactHistory.pending, (state, action) => {
        state.selectedContactHistoryRequestId = action.meta.requestId;
        state.selectedContactHistoryLoading = true;
        state.selectedContactHistoryError = null;
        if (state.selectedContactHistory?.contact_id !== action.meta.arg) state.selectedContactHistory = null;
      })
      .addCase(fetchContactHistory.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.selectedContactHistoryRequestId) return;
        state.selectedContactHistoryLoading = false;
        state.selectedContactHistory = action.payload;
      })
      .addCase(fetchContactHistory.rejected, (state, action) => {
        if (action.meta.requestId !== state.selectedContactHistoryRequestId) return;
        state.selectedContactHistoryLoading = false;
        state.selectedContactHistoryError = action.payload ?? 'Could not load their calls, emails and tickets.';
      })
      // updateContact/deleteContact patch every list a Contact could be
      // showing in (`contacts`, `allContacts`, `selectedContact`) rather
      // than making the caller refetch — cheap and unambiguous, since an
      // update/delete always targets a known id, unlike create (see
      // createContactForCustomer's own docstring on why that one can't
      // do the same). Their own rejections are shown inline in the
      // form/confirm modal instead (same pattern as createAccount/
      // updateAccount above) — no .rejected case needed here.
      .addCase(updateContact.fulfilled, (state, action) => {
        const updated = action.payload;
        const inContacts = state.contacts.findIndex((c) => c.id === updated.id);
        if (inContacts !== -1) state.contacts[inContacts] = updated;
        const inAllContacts = state.allContacts.findIndex((c) => c.id === updated.id);
        if (inAllContacts !== -1) state.allContacts[inAllContacts] = updated;
        if (state.selectedContact?.id === updated.id) state.selectedContact = updated;
      })
      .addCase(deleteContact.fulfilled, (state, action) => {
        const id = action.payload;
        state.contacts = state.contacts.filter((c) => c.id !== id);
        state.allContacts = state.allContacts.filter((c) => c.id !== id);
        state.allContactsCount = Math.max(0, state.allContactsCount - 1);
        // A page read before the delete is offset against the old list.
        state.allContactsMoreRequestId = undefined;
        state.allContactsLoadingMore = false;
      })
      .addCase(fetchOpportunities.pending, (state) => {
        state.opportunitiesLoading = true;
        state.opportunitiesError = null;
      })
      .addCase(fetchOpportunities.fulfilled, (state, action) => {
        state.opportunitiesLoading = false;
        state.opportunities = action.payload;
      })
      .addCase(fetchOpportunities.rejected, (state, action) => {
        state.opportunitiesLoading = false;
        state.opportunitiesError = action.payload ?? 'Could not load opportunities.';
      })
      // createOpportunity/updateOpportunity/deleteOpportunity's own
      // rejections are shown inline in the form/board instead (same
      // pattern as Contact's own create/update/delete) — no .rejected
      // case needed for any of them here. Unlike Contact, create can
      // safely patch `opportunities` directly too — there's only the
      // one board-wide list an Opportunity could land in.
      .addCase(createOpportunity.fulfilled, (state, action) => {
        state.opportunities.unshift(action.payload);
      })
      .addCase(updateOpportunity.fulfilled, (state, action) => {
        // Patches both the standalone board's own `opportunities` and
        // the Details page's own scoped `pipelineOpportunities` — this
        // thunk is shared by both surfaces (see OpportunityFormModal's
        // own docstring), and either list could be showing this
        // Opportunity, same "patch every slot it could be in" reasoning
        // as updateContact above.
        const updated = action.payload;
        const index = state.opportunities.findIndex((o) => o.id === updated.id);
        if (index !== -1) state.opportunities[index] = updated;
        const pipelineIndex = state.pipelineOpportunities.findIndex((o) => o.id === updated.id);
        if (pipelineIndex !== -1) state.pipelineOpportunities[pipelineIndex] = updated;
      })
      .addCase(deleteOpportunity.fulfilled, (state, action) => {
        state.opportunities = state.opportunities.filter((o) => o.id !== action.payload);
        state.pipelineOpportunities = state.pipelineOpportunities.filter(
          (o) => o.id !== action.payload
        );
      })
      .addCase(fetchOpportunitiesForCustomer.pending, (state, action) => {
        state.pipelineOpportunitiesLoading = true;
        state.pipelineOpportunitiesError = null;
        state.pipelineOpportunitiesRequestId = action.meta.requestId;
        // Another organization's or account's never show under this one.
        if (listScope(action.meta.arg) !== state.pipelineOpportunitiesFor) {
          state.pipelineOpportunities = [];
          state.pipelineOpportunitiesFor = null;
        }
      })
      .addCase(fetchOpportunitiesForCustomer.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.pipelineOpportunitiesRequestId) return;
        state.pipelineOpportunitiesLoading = false;
        state.pipelineOpportunities = action.payload;
        state.pipelineOpportunitiesFor = listScope(action.meta.arg);
      })
      .addCase(fetchOpportunitiesForCustomer.rejected, (state, action) => {
        if (action.meta.requestId !== state.pipelineOpportunitiesRequestId) return;
        state.pipelineOpportunitiesLoading = false;
        state.pipelineOpportunitiesError = action.payload ?? 'Could not load opportunities.';
      })
      // fetchOpportunitiesForCustomer/fetchOpportunitiesForAccount share
      // the one `pipelineOpportunities` slot, same reasoning as
      // fetchContactsForCustomer/fetchContactsForAccount above.
      .addCase(fetchOpportunitiesForAccount.pending, (state, action) => {
        state.pipelineOpportunitiesLoading = true;
        state.pipelineOpportunitiesError = null;
        state.pipelineOpportunitiesRequestId = action.meta.requestId;
        // Another organization's or account's never show under this one.
        if (listScope(action.meta.arg.customerId, action.meta.arg.accountId) !== state.pipelineOpportunitiesFor) {
          state.pipelineOpportunities = [];
          state.pipelineOpportunitiesFor = null;
        }
      })
      .addCase(fetchOpportunitiesForAccount.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.pipelineOpportunitiesRequestId) return;
        state.pipelineOpportunitiesLoading = false;
        state.pipelineOpportunities = action.payload;
        state.pipelineOpportunitiesFor = listScope(action.meta.arg.customerId, action.meta.arg.accountId);
      })
      .addCase(fetchOpportunitiesForAccount.rejected, (state, action) => {
        if (action.meta.requestId !== state.pipelineOpportunitiesRequestId) return;
        state.pipelineOpportunitiesLoading = false;
        state.pipelineOpportunitiesError = action.payload ?? 'Could not load opportunities.';
      })
      // createOpportunityForCustomer/createOpportunityForAccount's own
      // rejections are shown inline in the form instead — no .rejected
      // case needed, and no .fulfilled case either: DealsTab
      // refetches its own `pipelineOpportunities` after a successful
      // create (see createOpportunityForCustomer's own docstring).
      .addCase(fetchRisks.pending, (state) => {
        state.risksLoading = true;
        state.risksError = null;
      })
      .addCase(fetchRisks.fulfilled, (state, action) => {
        state.risksLoading = false;
        state.risks = action.payload;
      })
      .addCase(fetchRisks.rejected, (state, action) => {
        state.risksLoading = false;
        state.risksError = action.payload ?? 'Could not load risks.';
      })
      // Same "no .rejected case, create/update/delete patch `risks`
      // directly" reasoning as Opportunity above.
      .addCase(createRisk.fulfilled, (state, action) => {
        state.risks.unshift(action.payload);
      })
      .addCase(updateRisk.fulfilled, (state, action) => {
        // Same "patch every slot it could be in" reasoning as
        // updateOpportunity above.
        const updated = action.payload;
        const index = state.risks.findIndex((r) => r.id === updated.id);
        if (index !== -1) state.risks[index] = updated;
        const pipelineIndex = state.pipelineRisks.findIndex((r) => r.id === updated.id);
        if (pipelineIndex !== -1) state.pipelineRisks[pipelineIndex] = updated;
      })
      .addCase(deleteRisk.fulfilled, (state, action) => {
        state.risks = state.risks.filter((r) => r.id !== action.payload);
        state.pipelineRisks = state.pipelineRisks.filter((r) => r.id !== action.payload);
      })
      .addCase(fetchRisksForCustomer.pending, (state, action) => {
        state.pipelineRisksLoading = true;
        state.pipelineRisksError = null;
        state.pipelineRisksRequestId = action.meta.requestId;
        // Another organization's or account's never show under this one.
        if (listScope(action.meta.arg) !== state.pipelineRisksFor) {
          state.pipelineRisks = [];
          state.pipelineRisksFor = null;
        }
      })
      .addCase(fetchRisksForCustomer.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.pipelineRisksRequestId) return;
        state.pipelineRisksLoading = false;
        state.pipelineRisks = action.payload;
        state.pipelineRisksFor = listScope(action.meta.arg);
      })
      .addCase(fetchRisksForCustomer.rejected, (state, action) => {
        if (action.meta.requestId !== state.pipelineRisksRequestId) return;
        state.pipelineRisksLoading = false;
        state.pipelineRisksError = action.payload ?? 'Could not load risks.';
      })
      .addCase(fetchRisksForAccount.pending, (state, action) => {
        state.pipelineRisksLoading = true;
        state.pipelineRisksError = null;
        state.pipelineRisksRequestId = action.meta.requestId;
        // Another organization's or account's never show under this one.
        if (listScope(action.meta.arg.customerId, action.meta.arg.accountId) !== state.pipelineRisksFor) {
          state.pipelineRisks = [];
          state.pipelineRisksFor = null;
        }
      })
      .addCase(fetchRisksForAccount.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.pipelineRisksRequestId) return;
        state.pipelineRisksLoading = false;
        state.pipelineRisks = action.payload;
        state.pipelineRisksFor = listScope(action.meta.arg.customerId, action.meta.arg.accountId);
      })
      .addCase(fetchRisksForAccount.rejected, (state, action) => {
        if (action.meta.requestId !== state.pipelineRisksRequestId) return;
        state.pipelineRisksLoading = false;
        state.pipelineRisksError = action.payload ?? 'Could not load risks.';
      })
      .addCase(fetchSurveys.pending, (state, action) => {
        state.surveysLoading = true;
        state.surveysError = null;
        state.surveysRequestId = action.meta.requestId;
        state.surveysFilter = action.meta.arg ?? null;
      })
      .addCase(fetchSurveys.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.surveysRequestId) return;
        state.surveysLoading = false;
        state.surveys = action.payload;
        state.surveysFor = action.meta.arg ?? null;
      })
      .addCase(fetchSurveys.rejected, (state, action) => {
        if (action.meta.requestId !== state.surveysRequestId) return;
        state.surveysLoading = false;
        state.surveysError = action.payload ?? 'Could not load surveys.';
      })
      // Same "no .rejected case, create/update/delete patch `surveys`
      // directly" reasoning as Opportunity/Risk above.
      .addCase(createSurvey.fulfilled, (state, action) => {
        // A list filtered to one organization takes only that organization's.
        const filter = state.surveysFilter ?? null;
        if (filter !== null && !action.payload.companies.some((company) => company.id === filter)) return;
        state.surveys.unshift(action.payload);
      })
      .addCase(updateSurvey.fulfilled, (state, action) => {
        // Same "patch every slot it could be in" reasoning as
        // updateOpportunity/updateRisk above — a responded Survey
        // could be showing in both the standalone page's own `surveys`
        // and the Activity Feed's own `entitySurveys` at once.
        const updated = action.payload;
        const index = state.surveys.findIndex((s) => s.id === updated.id);
        if (index !== -1) state.surveys[index] = updated;
        const entityIndex = state.entitySurveys.findIndex((s) => s.id === updated.id);
        if (entityIndex !== -1) state.entitySurveys[entityIndex] = updated;
      })
      .addCase(deleteSurvey.fulfilled, (state, action) => {
        state.surveys = state.surveys.filter((s) => s.id !== action.payload);
        state.entitySurveys = state.entitySurveys.filter((s) => s.id !== action.payload);
      })
      .addCase(fetchSurveysForCustomer.pending, (state) => {
        state.entitySurveysLoading = true;
        state.entitySurveysError = null;
        // Same "clear on pending, not just on a real no-id fallback"
        // convention as fetchTicketsForCustomer above — avoids a stale
        // previous entity's surveys flashing while switching between
        // organizations/accounts before this fetch resolves.
        state.entitySurveys = [];
      })
      .addCase(fetchSurveysForCustomer.fulfilled, (state, action) => {
        state.entitySurveysLoading = false;
        state.entitySurveys = action.payload;
      })
      .addCase(fetchSurveysForCustomer.rejected, (state, action) => {
        state.entitySurveysLoading = false;
        state.entitySurveysError = action.payload ?? 'Could not load surveys.';
      })
      .addCase(fetchSurveysForAccount.pending, (state) => {
        state.entitySurveysLoading = true;
        state.entitySurveysError = null;
        state.entitySurveys = [];
      })
      .addCase(fetchSurveysForAccount.fulfilled, (state, action) => {
        state.entitySurveysLoading = false;
        state.entitySurveys = action.payload;
      })
      .addCase(fetchSurveysForAccount.rejected, (state, action) => {
        state.entitySurveysLoading = false;
        state.entitySurveysError = action.payload ?? 'Could not load surveys.';
      })
      // createSurveyForCustomer/createSurveyForAccount ("Log Survey"
      // from inside the Activity Feed's own Surveys tab) have no
      // .fulfilled case here — same "this thunk doesn't know whether
      // the caller is a scoped Details-page tab or something else, so
      // it can't safely patch a specific slot itself" reasoning as
      // createOpportunityForCustomer/ForAccount above; SurveysTab.tsx
      // refetches `entitySurveys` afterward instead.
      // createCustomer/updateCustomer's own rejections are shown inline in
      // their modal forms instead (same pattern as userManagementSlice's
      // addCSM/updateCSM) — no .rejected case needed here.
      .addCase(createCustomer.fulfilled, (state, action) => {
        state.customers.unshift(action.payload);
        state.count += 1;
        state.totalCount += 1;
      })
      .addCase(updateCustomer.fulfilled, (state, action) => {
        const updated = action.payload;
        if (updated.is_archived) {
          // Archived — soft-hidden from the list, same as the backend
          // does for GET /customers/. Drop it locally too rather than
          // leaving a stale, now-archived row visible until next fetch.
          const wasPresent = state.customers.some((c) => c.id === updated.id);
          state.customers = state.customers.filter((c) => c.id !== updated.id);
          if (wasPresent) {
            state.count = Math.max(0, state.count - 1);
            state.totalCount = Math.max(0, state.totalCount - 1);
          }
        } else {
          const index = state.customers.findIndex((c) => c.id === updated.id);
          if (index !== -1) state.customers[index] = updated;
        }
        if (state.selectedCustomer?.id === updated.id) {
          state.selectedCustomer = updated;
        }
      })
      // createAccount/updateAccount's own rejections are shown inline in
      // their modal form instead, same pattern as above. No .fulfilled
      // case for createAccount — now that there are two possible lists
      // an Account could land in (the Organization Details page's own
      // `accountsForCustomer`, or the standalone Accounts page's own
      // `allAccounts`), this thunk doesn't know which one to patch, so
      // both callers refetch their own list instead via AccountFormModal's
      // own `onSaved`, same "caller refetches" reasoning as Contact's
      // own createContactForCustomer.
      .addCase(updateAccount.fulfilled, (state, action) => {
        // Update can safely patch both directly, though — it never adds
        // a new entry, only replaces an existing one by id if present,
        // same "patch every slot it could be in" reasoning as
        // updateContact/updateOpportunity/updateRisk.
        const updated = action.payload;
        const inAccountsForCustomer = state.accountsForCustomer.findIndex((a) => a.id === updated.id);
        if (inAccountsForCustomer !== -1) state.accountsForCustomer[inAccountsForCustomer] = updated;
        const inAllAccounts = state.allAccounts.findIndex((a) => a.id === updated.id);
        if (inAllAccounts !== -1) state.allAccounts[inAllAccounts] = updated;
      });
  },
});

export const {
  clearActivities,
  clearEmails,
  clearTasks,
  clearNotes,
  clearHeadlines,
  clearTickets,
  clearCalendarEvents,
  clearSurveys,
  clearContacts,
  clearSelectedCustomer,
  clearPipelineData,
} = customersSlice.actions;
export default customersSlice.reducer;
