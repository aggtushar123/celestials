// Thin apiFetch wrappers over revenact-backend's /api/v1/campaigns/ (spec §4)
// and the public unsubscribe pair, sent without a session.
import { apiFetch } from '../../lib/apiClient';
import { deliveryQuery, listQuery, type DeliveryShow } from './campaignParams';
import type {
  Audience,
  Campaign,
  CampaignPatch,
  CampaignRow,
  CampaignSend,
  CampaignTab,
  CampaignWrite,
  DeliveriesPage,
  Page,
  Preview,
  PreviewRequest,
  PublicUnsubscribe,
  SkipReason,
} from './campaignTypes';

export const CAMPAIGNS_PATH = '/campaigns/';
const one = (id: number) => `${CAMPAIGNS_PATH}${id}/`;
const withQuery = (path: string, query: string) => (query ? `${path}?${query}` : path);

export function fetchCampaigns(tab: CampaignTab, archived: boolean, cursor: string | null): Promise<Page<CampaignRow>> {
  return apiFetch<Page<CampaignRow>>(withQuery(CAMPAIGNS_PATH, listQuery(tab, archived, cursor)));
}

/** Every page of mine, archived left out: the rule picker's campaigns (Contract note 17). */
export async function fetchAllMine(): Promise<CampaignRow[]> {
  const rows: CampaignRow[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<CampaignRow> = await fetchCampaigns('mine', false, cursor);
    rows.push(...page.results);
    cursor = page.next;
  } while (cursor);
  return rows;
}

export function fetchCampaign(id: number): Promise<Campaign> {
  return apiFetch<Campaign>(one(id));
}

export function createCampaign(body: CampaignWrite): Promise<Campaign> {
  return apiFetch<Campaign>(CAMPAIGNS_PATH, { method: 'POST', body });
}

/** Owner only. `status: 'archived'` archives; `'active'` unarchives. */
export function updateCampaign(id: number, body: CampaignPatch): Promise<Campaign> {
  return apiFetch<Campaign>(one(id), { method: 'PATCH', body });
}

/** Owner only; 409 CAMPAIGN_SENT once it has sends. */
export function deleteCampaign(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

export function fetchAudience(id: number): Promise<Audience> {
  return apiFetch<Audience>(`${one(id)}audience/`);
}

export function previewCampaign(id: number, body: PreviewRequest): Promise<Preview> {
  return apiFetch<Preview>(`${one(id)}preview/`, { method: 'POST', body });
}

export function fetchSends(id: number, cursor: string | null): Promise<Page<CampaignSend>> {
  return apiFetch<Page<CampaignSend>>(withQuery(`${one(id)}sends/`, cursor ? new URLSearchParams({ cursor }).toString() : ''));
}

/** Send now: the whole segment, as the owner (201). */
export function sendCampaign(id: number): Promise<CampaignSend> {
  return apiFetch<CampaignSend>(`${one(id)}sends/`, { method: 'POST' });
}

export function fetchCampaignSend(id: number, sendId: number): Promise<CampaignSend> {
  return apiFetch<CampaignSend>(`${one(id)}sends/${sendId}/`);
}

export function fetchDeliveries(id: number, sendId: number, show: DeliveryShow, reason: SkipReason | '', cursor: string | null): Promise<DeliveriesPage> {
  return apiFetch<DeliveriesPage>(withQuery(`${one(id)}sends/${sendId}/deliveries/`, deliveryQuery(show, reason, cursor)));
}

/** The public link carries no session: no token, and a 401 never signs anyone out. */
const NO_SESSION = { accessToken: null, skipAuthRetry: true } as const;
const link = (token: string) => `${CAMPAIGNS_PATH}unsubscribe/${encodeURIComponent(token)}/`;

export function fetchUnsubscribe(token: string): Promise<PublicUnsubscribe> {
  return apiFetch<PublicUnsubscribe>(link(token), NO_SESSION);
}

/** 204, also for someone already unsubscribed; 404 for any bad link. */
export function confirmUnsubscribe(token: string): Promise<null> {
  return apiFetch<null>(link(token), { ...NO_SESSION, method: 'POST' });
}
