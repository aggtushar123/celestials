// Reply drafts (Agents delivery 2 contract, "Reply drafts:
// /communications/drafts/"). A draft is a Revenact row: no provider holds
// it. No em dash.
import type { PersonRef } from '../work/workTypes';
import type { ActionRecord, AgentKind } from './agentTypes';

export type DraftChannel = 'email' | 'ticket';
/** A discarded draft no longer exists. */
export type DraftStatus = 'open' | 'sent';
/** A draft mid-send is `sent` with no `sent_at`: `pending` for its first 10
 *  minutes, then `unconfirmed` (the owner says what happened). Otherwise null. */
export type DraftSending = 'pending' | 'unconfirmed';

export interface EmailDraftSource {
  kind: 'email';
  id: number;
  subject: string;
  from: { name: string; address: string };
  sent_at: string;
}

export interface TicketDraftSource {
  kind: 'ticket';
  id: number;
  number: string;
  title: string;
  /** Null, with `source_name`, for a ticket raised in Revenact. */
  external_url: string | null;
  source_name: string | null;
}

export interface ReplyDraft {
  id: number;
  channel: DraftChannel;
  status: DraftStatus;
  record: ActionRecord;
  source: EmailDraftSource | TicketDraftSource;
  /** `[name, address]` pairs; null on a ticket draft. */
  to: [string, string][] | null;
  /** Null on a ticket draft. */
  subject: string | null;
  body: string;
  agent: AgentKind;
  agent_action_id: number;
  owner: PersonRef;
  /** The body or subject differs from what the agent wrote. */
  edited: boolean;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  /** Absent reads as null. */
  sending?: DraftSending | null;
  /** Contract question 3: read as `{id, name}`, like `owner`. */
  sent_by: PersonRef | null;
  /** The owner's, while it is open. Every write is owner-only. */
  can_edit: boolean;
  /** True only while `sending` is `unconfirmed` and the reader may send it. */
  can_resolve: boolean;
  /** The linked Gmail draft (two-way Gmail D3 contract §3): set only for its
   *  owner, and only when the source mail is in their own two-way Gmail. */
  mail_draft_id?: number | null;
}

/** GET /communications/drafts/: the reader's own, newest first, at most 100. */
export interface DraftsList {
  results: ReplyDraft[];
}

export interface DraftFilters {
  channel?: DraftChannel;
  /** `open` when left out. */
  status?: DraftStatus;
}

/** PATCH, and send's optional body: `subject` is for email drafts only. */
export interface DraftPatch {
  body?: string;
  subject?: string;
}

/** POST send/. */
export interface DraftSent {
  draft: ReplyDraft;
  email: { id: number; subject: string; sent_at: string; thread_id: string };
}

/** The queue row's `draft`: the reader's own open draft for that email or ticket. */
export interface QueueDraft {
  id: number;
  agent: AgentKind;
  created_at: string;
}
