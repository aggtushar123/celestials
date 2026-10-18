import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SETTINGS } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import { renderPage } from '../../pages/work/testPages';
import { AgentsSettingsPage } from '../../pages/settings/AgentsSettingsPage';
import { resetViewport } from '../../test/viewport';

/** The server default has every source on (contract D2-26); these tests turn Webhooks off on purpose, to cover the off rendering. */
const WEBHOOK_OFF = { ...AGENT_SETTINGS, signals: { ...AGENT_SETTINGS.signals, sources: AGENT_SETTINGS.signals.sources.map((s) => (s.key === 'webhook' ? { ...s, enabled: false } : s)) } };

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

describe('Settings › Agents › Reading messages (agent bundles D2 §4.8; Decision 12)', () => {
  it('shows how often and each source, marking the unconnected ones', async () => {
    stubAgents({ settings: WEBHOOK_OFF });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const section = await screen.findByRole('region', { name: 'Reading messages' });
    expect(within(section).getByLabelText('How often')).toHaveValue('1h');
    expect(within(section).getByRole('switch', { name: 'Email filed to a customer' })).toBeChecked();
    expect(within(section).getByRole('switch', { name: 'Webhooks' })).not.toBeChecked();
    expect(within(section).getAllByText('Not connected')).toHaveLength(4);
    expect(within(section).getByText(/^Last read/)).toBeInTheDocument();
  });

  it('saves the interval and a source at once', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const section = await screen.findByRole('region', { name: 'Reading messages' });
    await userEvent.selectOptions(within(section).getByLabelText('How often'), '4h');
    await waitFor(() => expect(within(section).getByLabelText('How often')).toHaveValue('4h'));
    await userEvent.click(within(section).getByRole('switch', { name: 'Slack' }));
    await waitFor(() => expect(within(section).getByRole('switch', { name: 'Slack' })).not.toBeChecked());
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ signal_interval: '4h' }, { signal_sources: { slack: false } }]);
  });

  it('shows the values as text to a member', async () => {
    stubAgents({ settings: { ...WEBHOOK_OFF, can_edit: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    const section = await screen.findByRole('region', { name: 'Reading messages' });
    expect(within(section).getByText('Every hour')).toBeInTheDocument();
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(section).getAllByText('On · Not connected')).toHaveLength(3);
    expect(within(section).getByText('Slack')).toBeInTheDocument();
    expect(within(section).queryByText(/^Slack: /)).not.toBeInTheDocument();
    expect(within(section).getByText('Off · Not connected')).toBeInTheDocument();
  });
});
