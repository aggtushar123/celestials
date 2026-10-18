import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B_DEPT, B_DONE, B_OUTSIDE_DONE, B_PARTLY, B_PIZZA, B_UNASSIGNED, BUNDLES } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

describe('History (spec §8.1; frontend Decision 13)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it("shows a finished bundle's outside result links (agent bundles D3 Decision 9)", async () => {
    stubBundles({ bundles: [...BUNDLES, B_OUTSIDE_DONE] });
    renderWork('/work?queue=history');
    const row = (await screen.findByText(B_OUTSIDE_DONE.title)).closest('li') as HTMLElement;
    const jira = within(row).getByRole('link', { name: 'Open SUP-77 in Jira (opens in a new tab)' });
    expect(jira).toHaveAttribute('target', '_blank');
    expect(within(row).getByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
    const plain = (await screen.findByText(B_DONE.title)).closest('li') as HTMLElement;
    expect(within(plain).queryByRole('link', { name: /opens in a new tab/ })).toBeNull();
  });

  it('lists finished bundles newest first with their status, and filters in the URL', async () => {
    stubBundles();
    renderWork('/work?queue=history');
    const list = await screen.findByRole('list', { name: 'Finished bundles' });
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual([B_PARTLY.title, B_DONE.title, 'Move Pizza Hut to Churn']);
    expect(within(list).getByText('Partly done')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done');
    await waitFor(() => expect(where()).toBe('/work?queue=history&status=done'));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Finished bundles' })).getAllByRole('heading').map((h) => h.textContent)).toEqual([B_DONE.title]));
  });

  it('opens a partly done bundle read-only with its links and error', { timeout: 15000 }, async () => {
    stubBundles();
    renderWork('/work?queue=history');
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PARTLY.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PARTLY.title });
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open segment' })).toHaveAttribute('href', '/segments/5');
    expect(within(within(panel).getByTestId('step-82')).getByRole('alert')).toHaveTextContent("Email isn't set up for this workspace yet, so surveys can't be sent.");
  });

  it('undoes a step of a done bundle', { timeout: 15000 }, async () => {
    stubBundles();
    renderWork(`/work?queue=history&bundle=${B_DONE.id}`);
    const done = await screen.findByRole('dialog', { name: B_DONE.title });
    await userEvent.click(within(done).getByRole('button', { name: 'Undo' }));
    expect(await within(done).findByText('Undone: Book the QBR.')).toBeInTheDocument();
  });

  it('names who ran a bundle and who rejected one (agent bundles D2-28)', async () => {
    stubBundles();
    renderWork('/work?queue=history');
    const list = await screen.findByRole('list', { name: 'Finished bundles' });
    const row = (title: string) => within(list).getByRole('heading', { name: title }).closest('li') as HTMLElement;
    expect(within(row(B_DONE.title)).getByText('Ran by Carl CSM')).toBeInTheDocument();
    expect(within(row('Move Pizza Hut to Churn')).getByText('Rejected by Carl CSM')).toBeInTheDocument();
  });

  it('says who a routed bundle was for and shows its channel, as its queue row did (Decisions 4, 5)', async () => {
    const rejected = { status: 'rejected' as const, can_run: false, can_reject: false, can_refresh: false, run_by: null, reject_reason: 'not_relevant' as const };
    stubBundles({ bundles: [{ ...B_DEPT, ...rejected }, { ...B_UNASSIGNED, ...rejected }, { ...B_DONE }] });
    renderWork('/work?queue=history');
    const list = await screen.findByRole('list', { name: 'Finished bundles' });
    const row = (title: string) => within(list).getByRole('heading', { name: title }).closest('li') as HTMLElement;
    expect(within(row(B_DEPT.title)).getByText('For Customer Success')).toBeInTheDocument();
    expect(row(B_DEPT.title).textContent).not.toContain('For the whole company');
    expect(row(B_DEPT.title).querySelector('[data-channel="zendesk"]')).not.toBeNull();
    expect(within(row(B_UNASSIGNED.title)).getByText('Unassigned')).toBeInTheDocument();
    expect(row(B_UNASSIGNED.title).querySelector('[data-channel="slack"]')).not.toBeNull();
    expect(row(B_DONE.title).querySelector('[data-channel]')).toBeNull();
  });

  it('says when nothing has finished, and when nothing matches the filters', async () => {
    stubBundles({ bundles: [] });
    renderWork('/work?queue=history');
    expect(await screen.findByText('Nothing finished yet')).toBeInTheDocument();
  });

  it('sends an old Activity link to its bundle in History', async () => {
    stubBundles({ actions: { 81: B_PARTLY.id } });
    renderWork('/work/activity?action=81');
    await waitFor(() => expect(where()).toBe('/work?queue=history&bundle=16'));
    expect(await screen.findByRole('dialog', { name: B_PARTLY.title })).toBeInTheDocument();
  });

  it('sends an old Activity link to a waiting step to its bundle on Mine', async () => {
    stubBundles({ actions: { 41: B_PIZZA.id } });
    renderWork('/work/activity?action=41');
    await waitFor(() => expect(where()).toBe('/work?queue=mine&bundle=12'));
    expect(await screen.findByRole('dialog', { name: B_PIZZA.title })).toBeInTheDocument();
  });

  it('lays a row out as a bundle row does, and says why a rejected one was rejected, never its note', async () => {
    stubBundles({ bundles: [{ ...B_DONE }, { ...B_DONE, id: 17, title: 'Move Pizza Hut to Churn', status: 'rejected', run_by: null, reject_reason: 'not_relevant', reject_note: 'Private note.' }] });
    renderWork('/work?queue=history');
    const list = await screen.findByRole('list', { name: 'Finished bundles' });
    const rejected = within(list).getByRole('heading', { name: 'Move Pizza Hut to Churn' }).closest('li') as HTMLElement;
    expect(rejected.className).toContain('items-start');
    expect(rejected.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(rejected).getByText('Not relevant')).toBeInTheDocument();
    expect(rejected.textContent).not.toContain('Private note.');
    const done = within(list).getByRole('heading', { name: B_DONE.title }).closest('li') as HTMLElement;
    expect(within(done).queryByText('Not relevant')).not.toBeInTheDocument();
  });

  it('sends an Activity link it cannot resolve to History', async () => {
    stubBundles();
    renderWork('/work/activity?action=999');
    await waitFor(() => expect(where()).toBe('/work?queue=history'));
  });
});
