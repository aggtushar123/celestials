import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { TEAM_MEMBERS } from '../../features/knowledge/testHeads';
import { BUNDLES, B_ESCALATION, B_PARTICIPANT } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { renderWork } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

const NOTE = 'Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work.';

async function openEscalation(stub: Parameters<typeof stubBundles>[0] = {}) {
  stubBundles({ bundles: [...BUNDLES, B_ESCALATION], members: TEAM_MEMBERS, ...stub });
  renderWork(`/work?queue=mine&bundle=${B_ESCALATION.id}`);
  return screen.findByRole('dialog', { name: B_ESCALATION.title });
}

describe('An escalation bundle (Slack escalations D4, frontend Decisions 1 and 4)', () => {
  it('lists the reply first, says it runs last, and keeps its run number', async () => {
    const panel = await openEscalation();
    const steps = within(within(panel).getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    expect(steps.map((s) => s.getAttribute('data-step'))).toEqual(['614', '611', '612', '613']);
    expect(within(steps[0]).getByText('4. Reply in Slack')).toBeInTheDocument();
    expect(within(steps[0]).getByText('Runs last, once the Jira issue exists')).toBeInTheDocument();
    expect(within(steps[1]).queryByText(/Runs last/)).toBeNull();
  });

  it('shows a skipped step note where "Not run" would be', async () => {
    const panel = await openEscalation({ skipSteps: { 612: NOTE }, outputs: { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const assign = within(panel).getByTestId('step-612');
    expect(await within(assign).findByText(NOTE)).toBeInTheDocument();
    expect(within(assign).queryByText('Not run')).toBeNull();
  });

  it('lists any other bundle by position, with no "Runs last"', async () => {
    stubBundles({ bundles: BUNDLES });
    renderWork(`/work?queue=mine&bundle=${BUNDLES[0].id}`);
    const panel = await screen.findByRole('dialog', { name: BUNDLES[0].title });
    expect(within(panel).queryByText(/Runs last/)).toBeNull();
  });
});

describe('Change who handles an escalation (Decision 2, contract §4)', () => {
  it('rewrites the assignment and the to-do and says so', async () => {
    const panel = await openEscalation();
    expect(within(panel).getByText('Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '13');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByText('Now handled by Erin Engineer.')).toBeInTheDocument();
    expect(within(panel).getByText('Erin Engineer (Engineering)')).toBeInTheDocument();
    expect(within(panel).getByText('The thread said: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-612')).getByText(/in Jira to Erin Engineer/)).toBeInTheDocument();
  });

  it('on a 409 with a fresh bundle, takes the bundle and shows the refusal above the buttons', async () => {
    const stub = stubBundles({ bundles: [...BUNDLES, B_ESCALATION], members: TEAM_MEMBERS });
    renderWork(`/work?queue=mine&bundle=${B_ESCALATION.id}`);
    const panel = await screen.findByRole('dialog', { name: B_ESCALATION.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '13');
    // Someone else rejects it before this Save lands.
    const stored = stub.bundles.get(B_ESCALATION.id)!;
    stored.status = 'rejected';
    stored.title = 'Globex (QA): CSV exports fail, updated';
    stored.escalation!.can_change = false;
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    const fresh = await screen.findByRole('dialog', { name: 'Globex (QA): CSV exports fail, updated' });
    expect(await within(fresh).findByRole('alert')).toHaveTextContent(/rejected this\./);
    expect(within(fresh).queryByRole('button', { name: /^Run/ })).toBeNull();
    // It can no longer be changed: no Save, and Cancel puts focus on Handled by.
    expect(within(fresh).queryByRole('button', { name: 'Save' })).toBeNull();
    await userEvent.click(within(fresh).getByRole('button', { name: 'Cancel' }));
    expect(within(fresh).getByText('Handled by')).toHaveFocus();
  });

  it('after a department Change, still says what the thread said (R5)', async () => {
    const panel = await openEscalation({ heads: { engineering: { id: 12, name: 'Jesh Sanghvi' } } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '');
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Department' }), 'engineering');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByText('Now handled by Jesh Sanghvi.')).toBeInTheDocument();
    expect(within(panel).getByText('The thread said: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(within(panel).getByText('Jesh Sanghvi (Engineering head)')).toBeInTheDocument();
    expect(within(panel).queryByText(/No one was named/)).toBeNull();
  });

  it('a department nobody handles says only "Choose who handles this" (owner decision)', async () => {
    const panel = await openEscalation();
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '');
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Department' }), 'sales');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    // The status line (a live region) says only this; no "Now handled by" anywhere.
    await waitFor(() => expect(within(panel).getAllByText('Choose who handles this')).toHaveLength(2));
    expect(panel.querySelector('[role="status"]')?.textContent).toBe('Choose who handles this');
    expect(within(panel).queryByText(/Now handled by/)).toBeNull();
  });

  it('a Change that goes through takes away an earlier refusal', async () => {
    const panel = await openEscalation({ refuseNextRun: { status: 503, body: { detail: 'Jira is not answering. Try again.' } } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Jira is not answering. Try again.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '13');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByText('Now handled by Erin Engineer.')).toBeInTheDocument();
    expect(within(panel).queryByText('Jira is not answering. Try again.')).toBeNull();
  });

  it('saving the person it already has sends nothing', async () => {
    const panel = await openEscalation();
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await within(panel).findByRole('option', { name: 'Erin Engineer · Engineering' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(within(panel).getByRole('button', { name: 'Change' })).toHaveFocus();
    const patches = vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes('/handler/'));
    expect(patches).toHaveLength(0);
  });
});


describe('The reply step (Decisions 3 and 5)', () => {
  it('posts as you, edits around its chips and runs with the real key and link', async () => {
    const panel = await openEscalation({ outputs: { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } } });
    const reply = within(panel).getByTestId('step-614');
    expect(within(reply).getByText('Posts as you (Faiz Jamal)')).toBeInTheDocument();
    const text = within(reply).getByRole('textbox', { name: 'Message' });
    expect(text).toHaveValue('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success).');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    expect(await within(reply).findByText(/Applied/)).toBeInTheDocument();
  });

  it('in a channel shared since, the reply is retried without the Jira key and link (owner decision 11)', async () => {
    const SHARED = "This channel is now shared outside your company, so the reply can't carry the Jira link. Take it out, then Retry.";
    const panel = await openEscalation({ outputs: { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } }, failSteps: { 614: SHARED } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const reply = within(panel).getByTestId('step-614');
    expect(await within(reply).findByText(SHARED)).toBeInTheDocument();
    await userEvent.click(within(reply).getByRole('button', { name: 'Remove Jira key from step 1' }));
    await userEvent.click(within(reply).getByRole('button', { name: 'Remove Jira link from step 1' }));
    await userEvent.click(within(reply).getByRole('button', { name: 'Retry' }));
    expect(await within(reply).findByText(/Applied/)).toBeInTheDocument();
    const retried = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes('/steps/614/retry/'));
    const body = JSON.parse(String(retried?.[1]?.body)) as { fields: { text: string } };
    expect(body.fields.text).toBe('Thanks Tushar. Logged as with Faiz Jamal (Customer Success).');
    expect(body.fields.text).not.toContain('{{step 1.');
  });
});

describe('The participant view (Decision 7, contract SE4-26)', () => {
  it('says why the reader may run it, and names the record without a link', async () => {
    stubBundles({ bundles: [...BUNDLES, B_PARTICIPANT], members: TEAM_MEMBERS });
    renderWork(`/work?queue=mine&bundle=${B_PARTICIPANT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_PARTICIPANT.title });
    expect(within(panel).getByText('You can run this because you took part in the Slack thread.')).toBeInTheDocument();
    expect(within(panel).getByText('Globex (QA)')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Globex (QA)' })).toBeNull();
    expect(within(panel).getByRole('button', { name: /^Run \d selected$/ })).toBeInTheDocument();
  });

  it('shows the task assignee as text and never asks for assignees of a record it cannot open', async () => {
    stubBundles({ bundles: [...BUNDLES, B_PARTICIPANT], members: TEAM_MEMBERS });
    renderWork(`/work?queue=mine&bundle=${B_PARTICIPANT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_PARTICIPANT.title });
    const step = within(await within(panel).findByTestId('step-623'));
    expect(step.getByText('Faiz Jamal')).toBeInTheDocument();
    expect(step.queryByRole('combobox', { name: /who does it/i })).toBeNull();
    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/work/assignees/'))).toBe(false);
  });

  it('the reader who can open the record still gets the assignee picker', async () => {
    const panel = await openEscalation();
    expect(within(within(panel).getByTestId('step-613')).getByRole('combobox', { name: /who does it/i })).toBeInTheDocument();
  });

  it('any other reader keeps the record link and sees no participant line', async () => {
    const panel = await openEscalation();
    expect(within(panel).getByRole('link', { name: 'Globex (QA)' })).toBeInTheDocument();
    expect(within(panel).queryByText(/took part in the Slack thread/)).toBeNull();
  });
});
