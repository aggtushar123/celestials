import { describe, expect, it } from 'vitest';
import type { Connector } from './connectorsSlice';
import { accessHint, accessLine } from './agentAccess';

// Agent bundles D3 contract §4.3; frontend Decision 10.
const base = { id: 5, provider: 'slack', provider_display: 'Slack', name: 'Support Slack' } as Connector;
const agents = (over: Partial<NonNullable<Connector['agents']>>) => ({ ...base, agents: { kinds: ['slack.reply'], can_act: false, needs: 'token' as const, allowed_by: null, allowed_at: null, ...over } });

describe('agent access words', () => {
  it('says read only or can act, and who allowed it', () => {
    expect(accessLine(agents({}))).toBe('Agents: Read only');
    expect(accessLine(agents({ can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice Admin' } }))).toBe('Agents: Can act · Allowed by Alice Admin');
    expect(accessLine({ ...base, provider: 'zendesk', provider_display: 'Zendesk', agents: { kinds: [], can_act: false, needs: null, allowed_by: null, allowed_at: null } })).toBe('Agents: Read only');
    expect(accessLine(base)).toBeNull();
  });

  it('hints at what Allow agents to act will do', () => {
    expect(accessHint(agents({ needs: 'consent' }))).toBe('Slack will ask you to let Revenact post.');
    expect(accessHint(agents({ needs: 'token' }))).toBe('Needs a Slack bot token that can post (chat:write).');
    expect(accessHint({ ...agents({}), provider: 'jira', agents: { kinds: ['jira.create', 'jira.assign'], can_act: false, needs: 'permission', allowed_by: null, allowed_at: null } })).toBe('Revenact checks this Jira account can create and assign issues.');
    expect(accessHint({ ...base, provider: 'zendesk', provider_display: 'Zendesk', agents: { kinds: [], can_act: false, needs: null, allowed_by: null, allowed_at: null } })).toBe("Agents can't act in Zendesk yet.");
  });

  it('asks for a reconnect first (round 2 D1 contract R2D1-10)', () => {
    expect(accessHint(agents({ needs: 'reconnect' }))).toBe('Reconnect Slack before agents can act.');
    expect(accessHint({ ...agents({}), provider: 'jira', provider_display: 'Jira Software', agents: { kinds: ['jira.create', 'jira.assign', 'jira.comment'], can_act: false, needs: 'reconnect', allowed_by: null, allowed_at: null } })).toBe('Reconnect Jira before agents can act.');
  });
});
