import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SETTINGS, FAST_LANE_OFF, FAST_LANE_ON, SIGNALS } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import type { AgentSettings, FastLaneSettings } from '../../features/agents/agentTypes';
import { renderPage } from '../../pages/work/testPages';
import { AgentsSettingsPage } from '../../pages/settings/AgentsSettingsPage';
import { resetViewport } from '../../test/viewport';

/** The settings with this fast lane (undefined: an older backend that sends none). */
function withLane(lane: FastLaneSettings | undefined, canEdit = true): AgentSettings {
  const signals = { ...SIGNALS, fast_lane: lane };
  if (!lane) delete signals.fast_lane;
  return { ...AGENT_SETTINGS, can_edit: canEdit, signals };
}
const stubLane = (lane: FastLaneSettings | undefined, canEdit = true) => stubAgents({ settings: withLane(lane, canEdit) });
const renderForm = () => renderPage(<AgentsSettingsPage />, '/settings/agents');
const renderSummary = () => renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
/** Every PATCH body sent to the settings, and the last one. */
const patches = (spy: ReturnType<typeof vi.fn>) => sent(spy, 'PATCH', '/agents/settings/');
const lastBody = (spy: ReturnType<typeof vi.fn>) => patches(spy).at(-1);

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

describe('FastLane (round 2 D3 frontend Decision 7)', () => {
  it('is off by default and shows its rules once switched on', async () => {
    const s = stubLane(FAST_LANE_OFF);
    renderForm();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    expect(within(section).getByText(/^Urgent conversations are read after 2 quiet minutes/)).toBeInTheDocument();
    expect(within(section).queryByRole('switch', { name: "Jira's top priority" })).toBeNull();
    await userEvent.click(within(section).getByRole('switch', { name: 'Fast lane' }));
    expect(await within(section).findByRole('switch', { name: "Jira's top priority" })).toBeChecked();
    expect(patches(s.spy)).toEqual([{ fast_lane: { on: true } }]);
    expect(within(section).getByRole('switch', { name: 'Customers in poor health' })).not.toBeChecked();
    expect(within(section).getByRole('checkbox', { name: 'Slack #support' })).not.toBeChecked();
  });

  it('adds and removes words, and shows a refusal under them', async () => {
    const s = stubLane(FAST_LANE_ON);
    renderForm();
    const words = await screen.findByRole('group', { name: 'Words' });
    expect(within(words).getByText('2 of 20')).toBeInTheDocument();
    await userEvent.type(within(words).getByRole('textbox', { name: 'Words' }), 'x');
    await userEvent.click(within(words).getByRole('button', { name: 'Add' }));
    expect(await within(words).findByText('Use 2 to 40 characters for each word.')).toBeInTheDocument();
    expect(lastBody(s.spy)).toEqual({ fast_lane: { rules: { words: ['outage', 'data loss', 'x'] } } });
    await userEvent.click(within(words).getByRole('button', { name: 'Remove outage' }));
    expect(lastBody(s.spy)).toEqual({ fast_lane: { rules: { words: ['data loss'] } } });
    await waitFor(() => expect(within(words).queryByRole('button', { name: 'Remove outage' })).toBeNull());
    expect(within(words).queryByText('Use 2 to 40 characters for each word.')).toBeNull();
  });

  it('adds a word with Enter and clears the field once saved', async () => {
    const s = stubLane(FAST_LANE_ON);
    renderForm();
    const words = await screen.findByRole('group', { name: 'Words' });
    const input = within(words).getByRole('textbox', { name: 'Words' });
    await userEvent.type(input, '  Refund {Enter}');
    expect(lastBody(s.spy)).toEqual({ fast_lane: { rules: { words: ['outage', 'data loss', 'Refund'] } } });
    expect(await within(words).findByRole('button', { name: 'Remove refund' })).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('adds and removes senders, and shows a refusal under them', async () => {
    const s = stubLane(FAST_LANE_ON);
    renderForm();
    const senders = await screen.findByRole('group', { name: 'Senders' });
    await userEvent.type(within(senders).getByRole('textbox', { name: 'Senders' }), '@bigco');
    await userEvent.click(within(senders).getByRole('button', { name: 'Add' }));
    expect(await within(senders).findByText('Use an email address or @domain for each sender.')).toBeInTheDocument();
    expect(lastBody(s.spy)).toEqual({ fast_lane: { rules: { senders: ['@bigco.com', '@bigco'] } } });
    await userEvent.click(within(senders).getByRole('button', { name: 'Remove @bigco.com' }));
    expect(lastBody(s.spy)).toEqual({ fast_lane: { rules: { senders: [] } } });
    await waitFor(() => expect(within(senders).queryByRole('button', { name: 'Remove @bigco.com' })).toBeNull());
  });

  it('chooses Slack channels and lowers the caps', async () => {
    const s = stubLane(FAST_LANE_ON);
    renderForm();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    const slack = within(section).getByRole('checkbox', { name: 'Slack #support' });
    expect(slack).toBeChecked();
    await userEvent.click(slack);
    await waitFor(() => expect(within(section).getByRole('checkbox', { name: 'Slack #support' })).not.toBeChecked());
    expect(lastBody(s.spy)).toEqual({ fast_lane: { rules: { slack_connectors: [] } } });

    const hour = within(section).getByRole('combobox', { name: 'Per hour' });
    const day = within(section).getByRole('combobox', { name: 'Per day' });
    expect(within(hour).getAllByRole('option')).toHaveLength(11);
    expect(within(day).getAllByRole('option')).toHaveLength(51);
    await userEvent.selectOptions(hour, '5');
    await waitFor(() => expect(hour).toHaveValue('5'));
    expect(lastBody(s.spy)).toEqual({ fast_lane: { per_hour: 5 } });

    // A day below the hour takes the hour down with it.
    await userEvent.selectOptions(day, '3');
    await waitFor(() => expect(day).toHaveValue('3'));
    expect(hour).toHaveValue('3');
    expect(lastBody(s.spy)).toEqual({ fast_lane: { per_day: 3, per_hour: 3 } });
    expect(within(section).getByText('Used in the last hour: 1 of 3. In the last 24 hours: 3 of 3.')).toBeInTheDocument();

    // An hour over the day is the server's to refuse; its sentence sits under Limits.
    await userEvent.selectOptions(hour, '4');
    const limits = within(section).getByRole('group', { name: 'Limits' });
    expect(await within(limits).findByText("The hourly limit can't be more than the daily limit.")).toBeInTheDocument();
    expect(lastBody(s.spy)).toEqual({ fast_lane: { per_hour: 4 } });
    expect(hour).toHaveValue('3');
  });

  it('undoes a lowered day by sending both limits back', async () => {
    const s = stubLane({ ...FAST_LANE_ON, per_hour: 5 });
    renderForm();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    await userEvent.selectOptions(within(section).getByRole('combobox', { name: 'Per day' }), '2');
    await waitFor(() => expect(within(section).getByRole('combobox', { name: 'Per hour' })).toHaveValue('2'));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(section).getByRole('combobox', { name: 'Per hour' })).toHaveValue('5'));
    expect(within(section).getByRole('combobox', { name: 'Per day' })).toHaveValue('50');
    expect(patches(s.spy)).toEqual([{ fast_lane: { per_day: 2, per_hour: 2 } }, { fast_lane: { per_day: 50, per_hour: 5 } }]);
  });

  it('switches Jira and poor health at once', async () => {
    const s = stubLane(FAST_LANE_ON);
    renderForm();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    await userEvent.click(within(section).getByRole('switch', { name: "Jira's top priority" }));
    await waitFor(() => expect(within(section).getByRole('switch', { name: "Jira's top priority" })).not.toBeChecked());
    await userEvent.click(within(section).getByRole('switch', { name: 'Customers in poor health' }));
    await waitFor(() => expect(within(section).getByRole('switch', { name: 'Customers in poor health' })).toBeChecked());
    expect(patches(s.spy)).toEqual([{ fast_lane: { rules: { jira_priority: false } } }, { fast_lane: { rules: { poor_health: true } } }]);
  });

  it('says when there is no Slack connection', async () => {
    stubLane({ ...FAST_LANE_ON, slack_choices: [], rules: { ...FAST_LANE_ON.rules, slack_connectors: [] } });
    renderForm();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    expect(within(section).getByText('No Slack connection yet.')).toBeInTheDocument();
    expect(within(section).queryByRole('checkbox')).toBeNull();
  });

  it('says what was used', async () => {
    stubLane(FAST_LANE_ON);
    renderForm();
    expect(await screen.findByText('Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50.')).toBeInTheDocument();
  });

  it('a member reads a summary', async () => {
    stubLane(FAST_LANE_ON, false);
    renderSummary();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    expect(within(section).getByText('On')).toBeInTheDocument();
    expect(within(section).getByText("Jira's top priority; Slack #support; words: outage, data loss; senders: @bigco.com")).toBeInTheDocument();
    expect(within(section).getByText('Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50.')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Fast lane' })).toBeNull();
  });

  it('a member reads Off and nothing more when the lane is off', async () => {
    stubLane(FAST_LANE_OFF, false);
    renderSummary();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    expect(within(section).getByText('Off')).toBeInTheDocument();
    expect(within(section).queryByText(/^Used in the last hour/)).toBeNull();
    expect(within(section).queryByText(/Jira's top priority/)).toBeNull();
  });

  it.each([
    ['an admin', true],
    ['a member', false],
  ])('draws nothing for %s when an older backend sends no fast lane', async (_who, canEdit) => {
    stubLane(undefined, canEdit);
    if (canEdit) renderForm();
    else renderSummary();
    expect(await screen.findByRole('region', { name: 'Reading messages' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fast lane' })).toBeNull();
  });
});
