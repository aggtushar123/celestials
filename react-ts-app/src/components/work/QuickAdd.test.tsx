import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { renderPage } from '../../pages/work/testPages';
import { QuickAdd } from './QuickAdd';
import { useFeedChanges, useTaskChanges } from './taskChanges';

describe('QuickAdd (spec §5, §6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetMembersCache();
  });

  it('adds a plain to-do on Enter, clears the box and keeps focus there', async () => {
    const { spy } = stubFeed();
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    const box = screen.getByLabelText('Add a to-do');
    await userEvent.type(box, 'Call the florist{Enter}');
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0][0]).toMatchObject({ group: 'no_date', item: { kind: 'todo', title: 'Call the florist' } });
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call the florist', priority: 'medium', due_date: null }]);
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
  });

  it('signals the badge only after an add: feedChanged, never taskChanged (Decision 15)', async () => {
    stubFeed();
    const feed = vi.fn();
    const tasks = vi.fn();
    renderHook(() => {
      useFeedChanges(feed);
      useTaskChanges(tasks);
    });
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call the florist{Enter}');
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(feed).toHaveBeenCalledTimes(1);
    expect(tasks).not.toHaveBeenCalled();
  });

  it('keeps Add focusable and aria-disabled while it sends, and sends once however often Enter is pressed', async () => {
    const { spy } = stubFeed();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input).includes('/work/todos/')) {
        posts += 1;
        await gate;
      }
      return spy(input, init);
    });
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call the florist');
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();
    await userEvent.keyboard('{Enter}');
    const busy = await screen.findByRole('button', { name: 'Adding…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    release();
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(posts).toBe(1);
    expect(calls(spy, 'POST', '/work/todos/')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add' })).not.toHaveAttribute('aria-disabled');
  });

  it('offers who does it only once a record is picked, and sends the record task', async () => {
    const { spy } = stubFeed();
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByLabelText('Who does it')).toBeNull();
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-09' } });
    await screen.findByRole('option', { name: 'Carl CSM' });
    await userEvent.selectOptions(screen.getByLabelText('Who does it'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call Ann', priority: 'medium', due_date: '2026-10-09', customer_id: 7, assignee_id: 3 }]);
    expect(onAdded.mock.calls[0][0]).toMatchObject({ item: null, group: null });
  });

  it('refuses a record without a date here, and a blank title, before sending', async () => {
    const { spy } = stubFeed();
    renderPage(<QuickAdd onAdded={vi.fn()} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), '   {Enter}');
    expect(await screen.findByText('Give the task a title.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/work/todos/')).toEqual([]);
  });

  it('clears a title error and aria-invalid as soon as the reader types (Chrome test 64)', async () => {
    stubFeed();
    renderPage(<QuickAdd onAdded={vi.fn()} />, '/work/mine');
    const box = screen.getByLabelText('Add a to-do');
    await userEvent.type(box, '{Enter}');
    expect(await screen.findByText('Give the task a title.')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(box, 'C');
    expect(screen.queryByText('Give the task a title.')).toBeNull();
    expect(box).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('clears a server title refusal once the title is edited, and a date error once a date is picked', async () => {
    stubFeed({ refuseNextTodo: { status: 400, body: { title: ['Keep the title under 255 characters.'] } } });
    renderPage(<QuickAdd onAdded={vi.fn()} />, '/work/mine');
    const box = screen.getByLabelText('Add a to-do');
    await userEvent.type(box, 'Too long{Enter}');
    expect(await screen.findByText('Keep the title under 255 characters.')).toBeInTheDocument();
    await userEvent.type(box, '!');
    expect(screen.queryByText('Keep the title under 255 characters.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-20' } });
    expect(screen.queryByText('Choose a date.')).toBeNull();
  });

  it('clears a date error when the record that needed the date is cleared', async () => {
    stubFeed();
    renderPage(<QuickAdd onAdded={vi.fn()} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Clear|Change/ }));
    expect(screen.queryByText('Choose a date.')).toBeNull();
  });

  it('keeps the text and shows the server refusal under its field, focus kept', async () => {
    stubFeed({ refuseNextTodo: { status: 400, body: { title: ['Keep the title under 255 characters.'] } } });
    const onAdded = vi.fn();
    const feed = vi.fn();
    renderHook(() => useFeedChanges(feed));
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    const box = screen.getByLabelText('Add a to-do');
    await userEvent.type(box, 'Too long{Enter}');
    expect(await screen.findByText('Keep the title under 255 characters.')).toBeInTheDocument();
    expect(box).toHaveValue('Too long');
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(onAdded).not.toHaveBeenCalled();
    expect(feed).not.toHaveBeenCalled();
  });

  it('shows a refused assignee under Who does it and keeps the form', async () => {
    stubFeed({ refuseNextTodo: { status: 400, body: { code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." } } });
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-09' } });
    await screen.findByRole('option', { name: 'Carl CSM' });
    await userEvent.selectOptions(screen.getByLabelText('Who does it'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText("That person can't open this organisation.")).toBeInTheDocument();
    expect(screen.getByLabelText('Who does it')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Who does it')).toHaveAccessibleDescription("That person can't open this organisation.");
    expect(screen.getByLabelText('Add a to-do')).toHaveValue('Call Ann');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-10-09');
    expect(onAdded).not.toHaveBeenCalled();
  });
  it('keeps a chosen record, date and priority in view after More closes, and Clear drops them (no hidden record is sent)', async () => {
    const { spy } = stubFeed();
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-09' } });
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'high');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByLabelText('Due date')).toBeNull();
    expect(screen.getByText('With: Pizza Hut · due 9 Oct 2026 · High priority')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear record, date and priority' }));
    expect(screen.queryByText(/^With:/)).toBeNull();
    expect(screen.getByLabelText('Add a to-do')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call Ann', priority: 'medium', due_date: null }]);
  });

  it('still sends a record chosen before More closed, shown in the summary line', async () => {
    const { spy } = stubFeed();
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-09' } });
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('With: Pizza Hut · due 9 Oct 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/work/todos/')[0]).toMatchObject({ customer_id: 7, due_date: '2026-10-09' });
    expect(screen.queryByText(/^With:/)).toBeNull();
  });
});
