// Thin wrappers over apiClient's apiFetch — same pattern as
// features/campaigns/campaignApi.ts's own, for the same reason: a Copilot
// conversation is scoped to one User, not a Customer/Account, so it
// lives here rather than as thunks in features/customers/customersSlice.ts.
import { apiFetch } from '../../lib/apiClient';
import type { DraftReply, Conversation, ConversationSummary, SurfaceContext } from './types';

// Pagination is off on this endpoint (see ConversationListView's own
// docstring) — a plain array, not fetchAllPages's {count,next,...} shape.
export function fetchConversations(): Promise<ConversationSummary[]> {
  return apiFetch<ConversationSummary[]>('/copilot/conversations/');
}

export function fetchConversation(id: number | string): Promise<Conversation> {
  return apiFetch<Conversation>(`/copilot/conversations/${id}/`);
}

export function deleteConversation(id: number): Promise<null> {
  return apiFetch<null>(`/copilot/conversations/${id}/`, { method: 'DELETE' });
}

// Omit `conversationId` to start a new Conversation (titled from this
// message) — see SendMessageView's own docstring. `context` is the
// Dashboard's or Organizations' structured "where I am"; without it the body
// is exactly what it has always been, so Communications and the Copilot page
// are unchanged.
export function sendMessage(params: { conversationId?: number; content: string; context?: SurfaceContext }): Promise<Conversation> {
  return apiFetch<Conversation>('/copilot/messages/', {
    method: 'POST',
    body: {
      conversation_id: params.conversationId,
      content: params.content,
      ...(params.context ? { context: params.context } : {}),
    },
  });
}

/** A reply drafted as the current user for one email or mailbox message,
 *  grounded in the thread and the account's history, with its sources. */
export function draftReply(params: { kind: 'email' | 'mail_message'; id: number }): Promise<DraftReply> {
  return apiFetch<DraftReply>('/copilot/draft-reply/', { method: 'POST', body: params });
}
