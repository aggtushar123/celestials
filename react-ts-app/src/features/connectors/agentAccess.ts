// Settings › Connections: what agents may do through a connection (agent
// bundles D3 contract §4.3; frontend Decision 10). No em dash.
import type { Connector } from './connectorsSlice';

export const AGENT_ACCESS = {
  ALLOW: 'Allow agents to act',
  ALLOWING: 'Allowing…',
  READ_ONLY: 'Make read only',
  SAVING: 'Saving…',
  DONE: 'Agents can now act through this connection.',
  FAILED: 'Could not change what agents may do.',
} as const;

const toolName = (c: Connector) => c.provider_display.replace(' Software', '');

export function accessLine(c: Connector): string | null {
  if (!c.agents) return null;
  if (!c.agents.can_act) return 'Agents: Read only';
  return c.agents.allowed_by ? `Agents: Can act · Allowed by ${c.agents.allowed_by.name}` : 'Agents: Can act';
}

export function accessHint(c: Connector): string | null {
  if (!c.agents) return null;
  if (c.agents.kinds.length === 0) return `Agents can't act in ${toolName(c)} yet.`;
  if (c.agents.needs === 'reconnect') return `Reconnect ${toolName(c)} before agents can act.`;
  if (c.agents.needs === 'consent') return 'Slack will ask you to let Revenact post.';
  if (c.agents.needs === 'token') return 'Needs a Slack bot token that can post (chat:write).';
  if (c.agents.needs === 'permission') return 'Revenact checks this Jira account can create and assign issues.';
  return null;
}
