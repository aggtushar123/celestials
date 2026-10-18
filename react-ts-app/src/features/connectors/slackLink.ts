// A person's own Slack link (connections page spec 2026-10-16 §3): replies
// and agent steps they run post as them, and their channel messages are
// attributed to them. No DM permissions. The caller's link only; tokens
// never reach the page. No em dash.
import { apiFetch } from '../../lib/apiClient';

export interface SlackLink {
  name: string;
  slack_user_id: string;
  team_id: string;
  status: 'linked' | 'lost';
  linked_at: string;
}

export interface SlackLinkState {
  configured: boolean;
  workspace_connected: boolean;
  link: SlackLink | null;
}

export const fetchSlackLink = () => apiFetch<SlackLinkState>('/connectors/slack-link/');
// SOC2:AUTH-01 credentials, so the browser keeps the start's same-browser cookie.
export const startSlackLink = () =>
  apiFetch<{ authorize_url: string }>('/connectors/slack-link/', { method: 'POST', credentials: 'include' });
export const unlinkSlack = () => apiFetch<void>('/connectors/slack-link/', { method: 'DELETE' });
