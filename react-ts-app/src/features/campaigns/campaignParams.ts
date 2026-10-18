// The Campaigns pages' URL state (Decisions 3 and 7) and the queries they send.
import type { CampaignTab, SkipReason } from './campaignTypes';

export type DeliveryShow = 'all' | 'sent' | 'skipped';

export function campaignsTab(search: URLSearchParams): CampaignTab {
  return search.get('tab') === 'shared' ? 'shared' : 'mine';
}

export function withTab(search: URLSearchParams, tab: CampaignTab): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tab === 'mine') next.delete('tab');
  else next.set('tab', tab);
  return next;
}

export function showArchived(search: URLSearchParams): boolean {
  return search.get('archived') === '1';
}

export function withArchived(search: URLSearchParams, on: boolean): URLSearchParams {
  const next = new URLSearchParams(search);
  if (on) next.set('archived', '1');
  else next.delete('archived');
  return next;
}

export function openSendOf(search: URLSearchParams): number | null {
  const value = search.get('send') ?? '';
  return /^\d+$/.test(value) ? Number(value) : null;
}

export function withOpenSend(search: URLSearchParams, id: number | null): URLSearchParams {
  const next = new URLSearchParams(search);
  if (id === null) next.delete('send');
  else next.set('send', String(id));
  return next;
}

export function listQuery(tab: CampaignTab, archived: boolean, cursor: string | null): string {
  const query = new URLSearchParams({ tab });
  if (archived) query.set('archived', '1');
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

/** A reason travels only with Skipped (Decision 8). */
export function deliveryQuery(show: DeliveryShow, reason: SkipReason | '', cursor: string | null): string {
  const query = new URLSearchParams();
  if (show !== 'all') query.set('status', show);
  if (show === 'skipped' && reason) query.set('reason', reason);
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}
