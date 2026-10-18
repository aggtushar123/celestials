import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubFeed } from '../../features/work/testFeed';
import { TODO_ROOM } from '../../features/work/testFeedFixtures';
import { calls, sent, stubWork } from '../../features/work/testWork';
import { WORK } from '../../features/work/workText';
import { renderPage } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { useTaskChanges } from './taskChanges';
import { TYPE } from '../ui';

function Probe({ onChange }: { onChange: () => void }) {
  useTaskChanges(onChange);
  return null;
}

async function openTask(id: number, stub: Parameters<typeof stubWork>[0] = {}) {
  const fetch = stubWork(stub);
  const changed = vi.fn();
  renderPage(<Probe onChange={changed} />, `/work/today?task=${id}`);
  const panel = await screen.findByRole('dialog');
  // Every loaded panel has the Activity heading, with or without events.
  await within(panel).findByRole('heading', { name: 'Activity' });
  return { ...fetch, changed };
}

const trail = () => within(screen.getByRole('list', { name: 'Activity' }));

describe('editing a task in the panel (spec §1.5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('renames on Enter, writes the event, retitles the panel and tells the lists', async () => {
    const { spy, changed } = await openTask(41);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Call Pizza Hut again{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut again' })).toBeInTheDocument();
    expect(trail().getByText('You renamed it from “Call Pizza Hut” to “Call Pizza Hut again”.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ title: 'Call Pizza Hut again' }]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('refuses a blank title in place, sending nothing', async () => {
    const { spy } = await openTask(41);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.tab();
    expect(await screen.findByText('Give the task a title.')).toBeInTheDocument();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('moves the status, and Blocked asks for its reason before it sends', async () => {
    const { spy } = await openTask(41);
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'in-progress');
    expect(await trail().findByText('You moved it from pending to in progress.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'blocked');
    expect(sent(spy, 'PATCH', '/tasks/41/')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
    expect(await screen.findByText("Say what it's blocked on.")).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toHaveLength(1);

    await userEvent.type(screen.getByLabelText('Blocked on'), 'Waiting on legal');
    await userEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
    expect(await trail().findByText('You marked it blocked: Waiting on legal')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')[1]).toEqual({ status: 'blocked', blocked_reason: 'Waiting on legal' });
    expect(screen.getByLabelText('Status')).toHaveValue('blocked');
    expect(screen.queryByRole('button', { name: 'Mark blocked' })).toBeNull();
  });

  it('Cancel on Blocked goes back without sending', async () => {
    const { spy } = await openTask(41);
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'blocked');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
    expect(screen.queryByLabelText('Blocked on')).toBeNull();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('changes a Blocked task’s reason on its own', async () => {
    const { spy } = await openTask(45);
    const reason = await screen.findByLabelText('Blocked on');
    expect(reason).toHaveValue('Waiting on legal');
    await userEvent.clear(reason);
    await userEvent.type(reason, 'Legal signs Friday');
    await userEvent.click(screen.getByRole('button', { name: 'Save reason' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/tasks/45/')).toEqual([{ blocked_reason: 'Legal signs Friday' }]));
  });

  it('reassigns among people who can open the record; the others are disabled', async () => {
    const { spy } = await openTask(41);
    expect(await screen.findByRole('option', { name: "Dana CSM · Can't open this organisation" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');
    expect(await trail().findByText('You assigned it to Carl CSM (was Alice).')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ assignee_id: 3 }]);
  });

  it('shows ASSIGNEE_CANNOT_OPEN under the Assignee field', async () => {
    const sentence = "That person can't open this organisation.";
    await openTask(41, { refuseNextPatch: { status: 400, body: { code: 'ASSIGNEE_CANNOT_OPEN', detail: sentence } } });
    await screen.findByRole('option', { name: 'Carl CSM' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');
    expect(await screen.findByText(sentence)).toHaveAttribute('id', expect.stringContaining('-error'));
  });

  it('moves the due date and the priority, and saves the description', async () => {
    const { spy } = await openTask(41);
    const due = await screen.findByLabelText('Due');
    fireEvent.change(due, { target: { value: '2026-10-10' } });
    fireEvent.blur(due);
    expect(await trail().findByText('You moved the due date from 5 Oct 2026 to 10 Oct 2026.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'low');
    expect(await trail().findByText('You changed the priority from high to low.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Description'), 'Ask about the renewal.');
    await userEvent.click(screen.getByRole('button', { name: 'Save description' }));
    expect(await trail().findByText('You edited the description.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ due_date: '2026-10-10' }, { priority: 'low' }, { description: 'Ask about the renewal.' }]);
  });

  it('refuses a cleared due date in place', async () => {
    const { spy } = await openTask(41);
    const due = await screen.findByLabelText('Due');
    fireEvent.change(due, { target: { value: '' } });
    fireEvent.blur(due);
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('keeps a due date while it is typed, and sends it once, on blur', async () => {
    const { spy } = await openTask(41);
    const due = await screen.findByLabelText('Due');
    due.focus();
    // A date input reports every typed segment of the year.
    for (const value of ['0002-10-05', '0020-10-05', '0202-10-05', '2027-10-05']) fireEvent.change(due, { target: { value } });
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
    await userEvent.tab();
    expect(await trail().findByText('You moved the due date from 5 Oct 2026 to 5 Oct 2027.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ due_date: '2027-10-05' }]);
  });

  it('sends a typed due date on Enter', async () => {
    const { spy } = await openTask(41);
    const due = await screen.findByLabelText('Due');
    fireEvent.change(due, { target: { value: '2026-10-12' } });
    fireEvent.keyDown(due, { key: 'Enter' });
    await waitFor(() => expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ due_date: '2026-10-12' }]));
  });

  it('refuses a half-typed year in place, sending nothing', async () => {
    const { spy } = await openTask(41);
    const due = await screen.findByLabelText('Due');
    fireEvent.change(due, { target: { value: '0202-10-05' } });
    fireEvent.blur(due);
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('keeps focus on the control while it saves, and says Saved.', async () => {
    await openTask(41);
    const priority = await screen.findByLabelText('Priority');
    priority.focus();
    fireEvent.change(priority, { target: { value: 'low' } });
    // Mid-write: marked busy, never disabled, so focus does not drop to <body>.
    expect(priority).toHaveAttribute('aria-disabled', 'true');
    expect(priority).not.toBeDisabled();
    expect(priority).toHaveFocus();
    expect(await trail().findByText('You changed the priority from high to low.')).toBeInTheDocument();
    const status = within(screen.getByRole('dialog')).getByRole('status');
    expect(status).toHaveTextContent('Saved.');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('Priority')).toHaveFocus();
    expect(screen.getByLabelText('Priority')).toHaveAttribute('aria-disabled', 'false');
  });

  it('Cancel on the description drops its refusal too', async () => {
    const sentence = 'Ensure this field has no more than 10000 characters.';
    await openTask(41, { refuseNextPatch: { status: 400, body: { description: [sentence] } } });
    await userEvent.type(await screen.findByLabelText('Description'), 'Too long');
    await userEvent.click(screen.getByRole('button', { name: 'Save description' }));
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(sentence)).toBeNull();
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('shows the missing state when a change answers 404', async () => {
    await openTask(41, { refuseNextPatch: { status: 404, body: { detail: 'No such task.' } } });
    await userEvent.selectOptions(await screen.findByLabelText('Priority'), 'low');
    const panel = await screen.findByRole('dialog', { name: 'Task not found' });
    expect(within(panel).getByText("This task isn't there, or you can't open it.")).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).toBeNull();
  });

  it('after a hand-off out of the reader\'s chain, a comment shows the missing state', async () => {
    await openTask(41);
    await screen.findByRole('option', { name: 'Mona Manager' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '2');
    await trail().findByText('You assigned it to Mona Manager (was Alice).');
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Over to you');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    const panel = await screen.findByRole('dialog', { name: 'Task not found' });
    expect(within(panel).getByText("This task isn't there, or you can't open it.")).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).toBeNull();
  });

  it('shows only Status as a control on a plan task the reader does not edit', async () => {
    await openTask(47);
    expect(await screen.findByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByLabelText('Assignee')).toBeNull();
    expect(screen.queryByLabelText('Priority')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText('Alice')).toBeInTheDocument();
  });

  it('puts a refusal with no field on the form', async () => {
    const detail = "Only the plan's owner or their managers can change it.";
    await openTask(41, { refuseNextPatch: { status: 403, body: { detail } } });
    await userEvent.selectOptions(await screen.findByLabelText('Priority'), 'low');
    expect(await screen.findByRole('alert')).toHaveTextContent(detail);
  });

  it('hands the task out of the reader\'s chain: the answer shows every field as text, with no error', async () => {
    const { spy, changed } = await openTask(41);
    await screen.findByRole('option', { name: 'Mona Manager' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '2');
    expect(await trail().findByText('You assigned it to Mona Manager (was Alice).')).toBeInTheDocument();
    const panel = screen.getByRole('dialog', { name: 'Call Pizza Hut' });
    for (const label of ['Title', 'Status', 'Assignee', 'Due', 'Priority', 'Description']) expect(within(panel).queryByLabelText(label)).toBeNull();
    expect(within(panel).getByText('Assignee').nextElementSibling).toHaveTextContent('Mona Manager');
    expect(within(panel).getByText('Priority')).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).toBeNull();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ assignee_id: 2 }]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('puts a plan task\'s NOT_CHECKER refusal of a status change on the form', async () => {
    const detail = "Only the task's assignee, its creator or the plan's editors can tick it.";
    await openTask(47, { refuseNextPatch: { status: 403, body: { code: 'NOT_CHECKER', detail } } });
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'completed');
    expect(await screen.findByRole('alert')).toHaveTextContent(detail);
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
  });
});

describe('the panel on a to-do (contract §1.2, Decision 10)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('labels the read-only Assignee like the fields beside it, not in uppercase', async () => {
    stubFeed({ todos: [TODO_ROOM] });
    renderPage(<p>My work</p>, '/work/mine?task=60');
    const panel = await screen.findByRole('dialog', { name: 'Book the QBR room' });
    const label = within(panel).getByText('Assignee');
    expect(label).toHaveClass(...TYPE.label.split(' '));
    expect(label).not.toHaveClass('uppercase');
  });

  it('says Only you, shows the assignee as You, and clears the date', async () => {
    const { spy } = stubFeed({ todos: [{ ...TODO_ROOM, due_date: '2026-10-09' }] });
    renderPage(<p>My work</p>, '/work/mine?task=60');
    const panel = await screen.findByRole('dialog', { name: 'Book the QBR room' });
    expect(panel.querySelector('[data-part="private"]')).toHaveTextContent('Only you');
    expect(within(panel).queryByLabelText('Assignee')).toBeNull();
    expect(within(panel).getByText('You')).toBeInTheDocument();
    const due = within(panel).getByLabelText('Due');
    await userEvent.clear(due);
    fireEvent.blur(due);
    await vi.waitFor(() => expect(sent(spy, 'PATCH', '/tasks/60/')).toEqual([{ due_date: null }]));
  });

  it('attaches a record, asking for a date when the to-do has none', async () => {
    const { spy } = stubFeed();
    renderPage(<p>My work</p>, '/work/mine?task=60');
    const panel = await screen.findByRole('dialog', { name: 'Book the QBR room' });
    await userEvent.type(within(panel).getByLabelText('Organisation or account'), 'Pizza');
    // One visibility warning, before a record is picked and after (Chrome test 10).
    expect(panel.querySelectorAll('[data-part="attach-history"]')).toHaveLength(1);
    await userEvent.click(await within(panel).findByRole('button', { name: 'Pizza Hut' }));
    // Contract §1.2: the history becomes visible on the record; said before Attach.
    expect(within(panel).getByText("Attaching a record makes this to-do and its history visible to people who can see that record. This can't be undone.")).toBeInTheDocument();
    expect(within(panel).queryByText(/It becomes a normal task on that record/)).toBeNull();
    expect(panel.querySelectorAll('[data-part="attach-history"]')).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: 'Attach' })).toHaveAccessibleDescription(WORK.ATTACH_HISTORY);
    await userEvent.click(within(panel).getByRole('button', { name: 'Attach' }));
    expect(await within(panel).findByText('Choose a date.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Due date for the record task'), { target: { value: '2026-10-09' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Attach' }));
    expect(await within(panel).findByText('You attached it to Pizza Hut.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/60/')).toEqual([{ customer_id: 7, due_date: '2026-10-09' }]);
    expect(within(panel).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
  });

  it('sends one attach on a double click, and needs no date field when the to-do has one (R10)', async () => {
    const { spy } = stubFeed({ todos: [{ ...TODO_ROOM, due_date: '2026-10-09' }] });
    renderPage(<p>My work</p>, '/work/mine?task=60');
    const panel = await screen.findByRole('dialog', { name: 'Book the QBR room' });
    await userEvent.type(within(panel).getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await within(panel).findByRole('button', { name: 'Pizza Hut' }));
    expect(within(panel).queryByLabelText('Due date for the record task')).toBeNull();
    await userEvent.dblClick(within(panel).getByRole('button', { name: 'Attach' }));
    expect(await within(panel).findByText('You attached it to Pizza Hut.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/60/')).toEqual([{ customer_id: 7 }]);
    expect(within(panel).queryByRole('button', { name: 'Attach' })).toBeNull();
  });

  it('offers no Attach on a task that already has a record', async () => {
    stubFeed();
    renderPage(<p>My work</p>, '/work/mine?task=41');
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    await within(panel).findByRole('heading', { name: 'Activity' });
    expect(within(panel).queryByRole('heading', { name: 'Attach to a record' })).toBeNull();
  });
});
