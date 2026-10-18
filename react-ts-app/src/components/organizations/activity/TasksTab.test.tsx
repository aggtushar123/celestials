import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render as renderBare, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import userEvent from '@testing-library/user-event';
import { TaskForm, TasksTab } from './TasksTab';
import type { Task } from '../../../features/customers/customersSlice';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { stubWork } from '../../../features/work/testWork';
import { makeRulesStore } from '../../../pages/rules/testPages';

/** Signed in as Alice (id 1), as the app always is around this form. */
const render = (ui: ReactElement) => renderBare(<Provider store={makeRulesStore()}>{ui}</Provider>);
const optionNames = () => Array.from((screen.getByLabelText('Assignee') as HTMLSelectElement).options).map((option) => option.textContent);

const assigned: Task = {
  id: 9, title: 'Ship the SSO fix', assignee_name: 'Priya Nair', due_date: '2026-09-30', priority: 'high', status: 'pending',
};

describe('TasksTab', () => {
  beforeEach(() => {
    resetMembersCache();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 5, name: 'Priya Nair', function: 'engineering' }] })));
  });

  it('lets the viewer create a task for a teammate and says who will see it', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<TasksTab tasks={[]} isLoading={false} error={null} onCreate={onCreate} />);

    expect(screen.getByText(/seen by its creator, its assignee and their management chains/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(screen.getByLabelText('Task title'), 'Ship the SSO fix');
    await user.type(screen.getByLabelText('Due date'), '2026-09-30');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.selectOptions(await screen.findByLabelText('Assignee'), '5');
    await user.click(screen.getByRole('button', { name: 'Save task' }));

    expect(onCreate).toHaveBeenCalledWith({ title: 'Ship the SSO fix', due_date: '2026-09-30', priority: 'high', assignee_id: 5 });
    await waitFor(() => expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument());
  });

  it('has no form for a record that cannot take a task', () => {
    render(<TasksTab tasks={[]} isLoading={false} error={null} />);
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
  });

  // Review round 1, Important: the assignee row used to load a pravatar.cc
  // placeholder image; it now shares UserAvatar, so the assignee shows as
  // an initial with no third-party image request.
  it('shows the assignee as an initial, with no third-party avatar request', () => {
    render(<TasksTab tasks={[assigned]} isLoading={false} error={null} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('with a record, lists who can open it and disables the rest (Work spec §1.5)', async () => {
    stubWork();
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<TaskForm onCreate={onCreate} parent={{ kind: 'customer', id: 7 }} />);
    const dana = await screen.findByRole('option', { name: "Dana CSM · Can't open this organisation" });
    expect(dana).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Task title'), 'Prep the QBR');
    await userEvent.type(screen.getByLabelText('Due date'), '2026-10-14');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    expect(onCreate).toHaveBeenCalledWith({ title: 'Prep the QBR', due_date: '2026-10-14', priority: 'medium', assignee_id: 3 });
  });

  it('shows the server’s sentence under the Assignee field, not as a form alert', async () => {
    stubWork();
    const { ApiError } = await import('../../../lib/apiClient');
    const sentence = "That person can't open this organisation.";
    const onCreate = vi.fn().mockRejectedValue(new ApiError(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: sentence }, sentence));
    render(<TaskForm onCreate={onCreate} parent={{ kind: 'customer', id: 7 }} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Prep the QBR');
    await userEvent.type(screen.getByLabelText('Due date'), '2026-10-14');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(sentence);
    expect(alert.closest('div')).toContainElement(screen.getByLabelText('Assignee'));
  });

  it('offers only Assign to me while the people load, saying so', async () => {
    const { spy } = stubWork();
    const held = new Promise(() => {});
    spy.mockImplementation(async (input: RequestInfo | URL) => (String(input).includes('/work/assignees/') ? held : { ok: true, status: 200, json: async () => [] }) as never);
    render(<TaskForm onCreate={vi.fn()} parent={{ kind: 'customer', id: 7 }} />);
    expect(await screen.findByText('Loading teammates…')).toBeInTheDocument();
    expect(optionNames()).toEqual(['Assign to me']);
  });

  it('offers only Assign to me when the people fail to load, with Try again', async () => {
    stubWork({ failAssignees: 1 });
    render(<TaskForm onCreate={vi.fn()} parent={{ kind: 'customer', id: 7 }} />);
    expect(await screen.findByText('Could not load teammates.')).toBeInTheDocument();
    expect(optionNames()).toEqual(['Assign to me']);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: 'Carl CSM' })).toBeInTheDocument();
    expect(screen.queryByText('Could not load teammates.')).toBeNull();
  });

  it('lists the reader once, as Assign to me', async () => {
    stubWork();
    render(<TaskForm onCreate={vi.fn()} parent={{ kind: 'customer', id: 7 }} />);
    await screen.findByRole('option', { name: 'Carl CSM' });
    expect(optionNames()).toEqual(['Assign to me', 'Carl CSM', "Dana CSM · Can't open this organisation", 'Mona Manager']);
  });
});
