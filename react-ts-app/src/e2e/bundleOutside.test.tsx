import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_BLOCKED, B_OUTSIDE, B_OUTSIDE_DONE, OUTSIDE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real panel, router and History.
// Only fetch is stubbed, in the agent bundles D3 contract's shapes. Nothing is
// sent to Slack, Jira or a mailbox. Alice edits an outside bundle's Jira step
// from Jira's live lists and runs it; a Slack post fails and her Retry
// succeeds; History shows the links; a blocked step sends her to Connections.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

type Spy = ReturnType<typeof stubBundles>['spy'];

/** The fields a step's saves (PATCH) and run sent, in order. */
function sentFields(spy: Spy, stepId: number): Record<string, unknown>[] {
  return spy.mock.calls.flatMap(([input, init]) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as { fields?: Record<string, unknown>; steps?: { id: number; fields?: Record<string, unknown> }[] }) : null;
    if (!body) return [];
    if (init?.method === 'PATCH' && path.endsWith(`/steps/${stepId}/`) && body.fields) return [body.fields];
    if (path.endsWith('/run/')) return (body.steps ?? []).filter((s) => s.id === stepId && s.fields).map((s) => s.fields as Record<string, unknown>);
    return [];
  });
}

describe('Agent bundles D3: outside actions', () => {
  it('edits a Jira step from live lists, runs it with the edit, and retries a failed Slack post', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES], failOutside: { 412: "Slack refused the post: the app isn't in #support." } });
    renderWork(`/work?queue=mine&bundle=${B_OUTSIDE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_OUTSIDE.title });
    const create = within(panel).getByTestId('step-413');
    expect(within(create).getByText("Can't be undone")).toBeInTheDocument();
    const project = await within(create).findByRole('combobox', { name: 'Project' });
    await waitFor(() => expect(within(project).getByRole('option', { name: /ENG/ })).toBeInTheDocument()); // the live list arrives after the stored value shows
    await userEvent.selectOptions(project, 'ENG');
    const type = await within(create).findByRole('combobox', { name: 'Issue type' });
    await waitFor(() => expect(within(type).getAllByRole('option').map((o) => o.textContent)).toEqual(['Task', 'Bug'])); // the stored name stays visible beside ENG's live list (PickSelect keeps a name-only value)
    const assign = within(panel).getByTestId('step-414');
    expect(within(assign).getByText('Jira ticket from step 3')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const slack = within(panel).getByTestId('step-412');
    expect(await within(slack).findByRole('alert')).toHaveTextContent("Slack refused the post: the app isn't in #support.");
    expect(sentFields(spy, 413).some((fields) => fields.project === 'ENG')).toBe(true);
    expect(within(create).getByRole('link', { name: 'Open SUP-501 in Jira (opens in a new tab)' })).toHaveAttribute('target', '_blank');
    await userEvent.click(within(slack).getByRole('button', { name: 'Retry' }));
    expect(await within(slack).findByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
  });

  it('Unassigned on a Jira issue clears the model member: the save sends assignee null', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_OUTSIDE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_OUTSIDE.title });
    const create = within(panel).getByTestId('step-413');
    const who = within(create).getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;
    expect(who.selectedOptions[0].textContent).toMatch(/^Erin Eng/);
    await userEvent.selectOptions(who, '__none__');
    fireEvent.blur(who);
    await waitFor(() => expect(sentFields(spy, 413)).toContainEqual({ assignee: null }));
    await waitFor(() => expect(within(create).queryByText('Erin Eng (matched in Jira by email when it runs)')).toBeNull());
    expect(who.selectedOptions[0].textContent).toBe('Unassigned');
  });

  it('History shows a finished bundle with its outside links', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork('/work?queue=history');
    const row = (await screen.findByText(B_OUTSIDE_DONE.title)).closest('li') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Open SUP-77 in Jira (opens in a new tab)' })).toHaveAttribute('href', 'https://acme.atlassian.net/browse/SUP-77');
  });

  it('a blocked step links only to an app path', { timeout: 30000 }, async () => {
    const hostile = { ...B_BLOCKED, steps: B_BLOCKED.steps.map((s) => (s.disabled_link ? { ...s, disabled_link: '//evil.com' } : s)) };
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES.filter((b) => b.id !== B_BLOCKED.id), hostile] });
    renderWork(`/work?queue=mine&bundle=${B_BLOCKED.id}`);
    const panel = await screen.findByRole('dialog', { name: B_BLOCKED.title });
    expect(within(panel).queryByRole('link', { name: 'Open Connections' })).toBeNull();
  });

  it('a blocked step sends its reader to Connections', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_BLOCKED.id}`);
    const panel = await screen.findByRole('dialog', { name: B_BLOCKED.title });
    await userEvent.click(within(panel).getByRole('link', { name: 'Open Connections' }));
    await waitFor(() => expect(where()).toBe('/settings/connections'));
  });
});
