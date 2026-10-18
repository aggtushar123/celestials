// Thin apiFetch wrappers over revenact-backend's services/mcp — see
// docs/API_CONTRACTS.md's `mcp` section.
import { apiFetch } from '../../lib/apiClient';

export interface AgentToken {
  id: number;
  label: string;
  /** The last few characters. The secret itself is returned once, at issue. */
  hint: string;
  last_used_at: string | null;
  created_at: string;
}

export interface IssuedToken extends AgentToken {
  /** Shown once and never again. Nobody can recover it, not even an admin. */
  token: string;
}

export function fetchAgentTokens(): Promise<AgentToken[]> {
  return apiFetch<AgentToken[]>('/mcp/tokens/');
}

export function issueAgentToken(label: string): Promise<IssuedToken> {
  return apiFetch<IssuedToken>('/mcp/tokens/', { method: 'POST', body: { label } });
}

export function revokeAgentToken(id: number): Promise<null> {
  return apiFetch<null>(`/mcp/tokens/${id}/`, { method: 'DELETE' });
}
