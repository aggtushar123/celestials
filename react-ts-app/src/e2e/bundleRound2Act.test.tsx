import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_AS_YOU, B_BLOCKED, B_LIVE, OUTSIDE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { stubMail } from '../features/mail/testMail';
import { stubJiraLink } from '../features/connectors/testJiraLink';
import { Integrations } from '../pages/integrations/Integrations';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real panel, router and settings
// page; only fetch is stubbed, in the round 2 D2 contract's shapes. Nothing
// reaches Jira, Slack or Atlassian. Carl sees he acts as himself in Jira,
// moves a Slack reply to a channel Revenact doesn't sync, reads a blocked
// step's text, and links and unlinks his Jira account.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles round 2 D2', () => {
  it('names you on a Jira step you will run as yourself', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES, B_AS_YOU] });
    renderWork(`/work?queue=mine&bundle=${B_AS_YOU.id}`);
    const panel = await screen.findByRole('dialog', { name: B_AS_YOU.title });
    expect(within(panel).getByText('Created in Jira as you (Carl Lee)')).toBeInTheDocument();
  });

  it('moves a Slack reply to an unsynced channel and runs it', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, B_LIVE] });
    renderWork(`/work?queue=mine&bundle=${B_LIVE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_LIVE.title });
    const step = within(panel).getByTestId('step-471');
    await userEvent.type(within(step).getByRole('searchbox', { name: 'Search channels' }), 'esc');
    const channel = await within(step).findByRole('combobox', { name: 'Channel' });
    // Wait for the answer to "esc", not the first, unfiltered list: that one
    // also has #escalations, and the search's 300 ms pause can then fire
    // mid-pick, leaving the select on its loading state without the option.
    await waitFor(() => {
      expect(within(channel).queryByRole('option', { name: '#random (Not synced)' })).not.toBeInTheDocument();
      expect(within(channel).getByRole('option', { name: '#escalations (Not synced)' })).toBeInTheDocument();
    });
    await userEvent.selectOptions(channel, '5:C0ESCALATE');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    // Only a successful run sends the choice and turns the step to Applied.
    expect(await within(step).findByText('Applied')).toBeInTheDocument();
    const run = spy.mock.calls.find(([u, i]) => String(u).endsWith('/agents/bundles/407/run/') && i?.method === 'POST');
    expect(run).toBeDefined();
    expect(JSON.parse(String(run![1]!.body))).toEqual({ steps: [{ id: 471, selected: true }] });
    // The choice is saved on the step before the run is asked for.
    const saved = spy.mock.calls.find(([u, i]) => String(u).endsWith('/agents/bundles/407/steps/471/') && i?.method === 'PATCH');
    expect(JSON.parse(String(saved![1]!.body)).fields.channel_choice).toBe('5:C0ESCALATE');
    expect(spy.mock.calls.indexOf(saved!)).toBeLessThan(spy.mock.calls.indexOf(run!));
    expect(within(step).getByText(/#escalations/)).toBeInTheDocument();
  });

  it('shows a blocked Slack step its message', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_BLOCKED.id}`);
    const panel = await screen.findByRole('dialog', { name: B_BLOCKED.title });
    expect(within(within(panel).getByTestId('step-421')).getByText('We are looking into it.')).toBeInTheDocument();
  });

  it('links and unlinks your Jira account on Settings, Connections', { timeout: 30000 }, async () => {
    stubMail();
    const mail = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
    const spy = stubJiraLink({}, { next: mail });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, search: '?jira_link=linked', assign });
    render(
      <Provider store={configureStore({ reducer: rootReducer })}>
        <MemoryRouter initialEntries={['/integrations?jira_link=linked']}>
          <Integrations />
        </MemoryRouter>
      </Provider>,
    );
    expect(await screen.findByText('Jira account linked.')).toBeInTheDocument();
    const yours = await screen.findByRole('list', { name: 'Jira' });
    const section = within(yours).getByRole('group', { name: 'Your account' }).closest('li') as HTMLElement;
    expect(await within(section).findByText('Linked as Carl Lee (carl@acme.io) · Jira')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Unlink' }));
    const confirm = await screen.findByRole('dialog', { name: 'Unlink your Jira account?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Unlink' }));
    const fresh = () => within(within(yours).getByRole('group', { name: 'Your account' })).findByRole('button', { name: 'Link Jira' });
    expect(await fresh()).toBeInTheDocument();
    expect(spy.mock.calls.some(([u, i]) => String(u).endsWith('/connectors/jira-link/') && i?.method === 'DELETE')).toBe(true);
    await userEvent.click(await fresh());
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://auth.atlassian.com/authorize?state=s1'));
  });
});
