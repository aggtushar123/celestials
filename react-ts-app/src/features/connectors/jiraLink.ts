// A person's own Jira link (agent bundles round 2 D2 contract §2). The
// caller's link only; tokens never reach the page. No em dash.
import { apiFetch } from '../../lib/apiClient';

export interface JiraLinkConnector {
  id: number;
  name: string;
  host: string;
}

export interface JiraLink {
  name: string;
  email: string;
  status: 'linked' | 'lost';
  sites: { url: string; name: string }[];
  /** Ids of `connectors` this link acts as the person in. */
  covers: number[];
  linked_at: string;
}

export interface JiraLinkState {
  configured: boolean;
  connectors: JiraLinkConnector[];
  link: JiraLink | null;
}

export const fetchJiraLink = () => apiFetch<JiraLinkState>('/connectors/jira-link/');
// SOC2:AUTH-01 credentials, so the browser keeps the start's same-browser cookie.
export const startJiraLink = () =>
  apiFetch<{ authorize_url: string }>('/connectors/jira-link/', { method: 'POST', credentials: 'include' });
export const unlinkJira = () => apiFetch<void>('/connectors/jira-link/', { method: 'DELETE' });
