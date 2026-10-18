import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ACT_INITIATIVE, ACT_LIFECYCLE, ACT_TASK_CREATE, ACT_TASK_HIDDEN, ACT_TASK_REMOVED, ACT_UNDONE } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import { AgentActionBody } from './AgentActionBody';
import { AgentActionDecision } from './AgentActionDecision';
import { recommendationsChanged, taskChanged } from '../work/taskChanges';
import { previewText } from '../../features/agents/agentsText';
import { ACTIONS } from '../../features/agents/testAgentsFixtures';

vi.mock('../work/taskChanges', () => ({ recommendationsChanged: vi.fn(), taskChanged: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(recommendationsChanged).mockClear();
  vi.mocked(taskChanged).mockClear();
});

const mount = (props: Partial<Parameters<typeof AgentActionDecision>[0]> = {}) => {
  const onSettled = vi.fn();
  const onGone = vi.fn();
  const onRefused = vi.fn();
  render(
    <MemoryRouter>
      <AgentActionBody action={ACT_LIFECYCLE} />
      <AgentActionDecision action={ACT_LIFECYCLE} onSettled={onSettled} onGone={onGone} onRefused={onRefused} {...props} />
    </MemoryRouter>,
  );
  return { onSettled, onGone, onRefused };
};

describe('AgentActionBody', () => {
  it('shows the preview, the why and the evidence; a task kind links its task', () => {
    mount();
    expect(screen.getByText('Lifecycle stage: Live → Renewal')).toBeInTheDocument();
    const why = screen.getByText('Why:');
    expect(why).toHaveClass('sr-only');
    expect(why.parentElement).toHaveTextContent('Why: Renewal is in 21 days and the renewal task is open.');
    expect(why.parentElement).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('link', { name: 'Renews 29 Oct' })).toHaveAttribute('href', '/organizations/7');
  });

  it('leaves out the evidence the server did not send', () => {
    render(
      <MemoryRouter>
        <AgentActionBody action={{ ...ACT_TASK_CREATE, evidence: [] }} />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Evidence')).toBeNull();
  });
});

describe('AgentActionBody task titles', () => {
  const body = (action: typeof ACT_UNDONE) =>
    render(
      <MemoryRouter>
        <AgentActionBody action={action} />
      </MemoryRouter>,
    );

  const preview = (container: HTMLElement) => container.querySelector('[data-part="preview"]') as HTMLElement;

  it('links a task the reader can open, then the change', () => {
    const { container } = body(ACT_UNDONE);
    expect(within(preview(container)).getByRole('link', { name: 'Send the QBR deck' })).toHaveAttribute('href', expect.stringContaining('task=42'));
    expect(preview(container)).toHaveTextContent(previewText(ACT_UNDONE));
  });

  it("shows a task the reader can't see as plain text: the server sends no id", () => {
    const { container } = body(ACT_TASK_HIDDEN);
    expect(within(preview(container)).queryByRole('link')).toBeNull();
    expect(preview(container)).toHaveTextContent("A task you can't see: Assignee Dana CSM → Carl CSM");
  });

  it('shows a removed task as plain text: the server sends no id', () => {
    const { container } = body(ACT_TASK_REMOVED);
    expect(within(preview(container)).queryByRole('link')).toBeNull();
    expect(preview(container)).toHaveTextContent('A removed task: Due date');
  });

  it('links a task by its id alone, whatever its title says', () => {
    const { container } = body({ ...ACT_UNDONE, preview: { ...ACT_UNDONE.preview, task: { id: 42, title: 'A removed task' } } });
    expect(within(preview(container)).getByRole('link', { name: 'A removed task' })).toHaveAttribute('href', expect.stringContaining('task=42'));
  });
});

describe('AgentActionBody evidence', () => {
  it('renders a workspace-level item with no link as plain text', () => {
    render(
      <MemoryRouter>
        <AgentActionBody action={{ ...ACT_INITIATIVE, evidence: [{ label: 'Workspace trend', link: null }] }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Workspace trend')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Workspace trend' })).toBeNull();
  });
});

describe('AgentActionDecision', () => {
  it('applies once and hands up the answer', async () => {
    const { spy } = stubAgents();
    const { onSettled } = mount();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onSettled.mock.calls[0][1]).toBe('Applied: Move Pizza Hut to Renewal.');
    expect(sent(spy, 'POST', '/approve/')).toHaveLength(1);
  });

  it("adds no full stop after a title's own question mark (Chrome test)", async () => {
    stubAgents();
    const { onSettled } = mount({ action: { ...ACT_LIFECYCLE, title: 'Offer Pizza Hut a discount?' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onSettled.mock.calls[0][1]).toBe('Applied: Offer Pizza Hut a discount?');
  });

  it('rejects with an optional note, refusing one over 255 characters in the browser', async () => {
    const { spy } = stubAgents();
    const { onSettled } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const note = screen.getByLabelText('Why not? (optional)');
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(256));
    await userEvent.click(screen.getByRole('button', { name: 'Reject it' }));
    expect(await screen.findByText('Keep the note under 255 characters.')).toBeInTheDocument();
    expect(note).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(note);
    await userEvent.type(note, 'Not yet');
    await userEvent.click(screen.getByRole('button', { name: 'Reject it' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(sent(spy, 'POST', '/reject/')).toEqual([{ note: 'Not yet' }]);
  });

  it('asks for the reason in the shared input, labelled above it', async () => {
    stubAgents();
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const note = screen.getByLabelText('Why not? (optional)');
    expect(note).toHaveClass('bg-surface', 'border-line', 'min-h-11');
    expect(screen.getByText('Why not? (optional)')).toHaveClass('text-[13px]', 'font-semibold');
  });

  it('leaves on 409 ALREADY_DECIDED with the server detail', async () => {
    stubAgents({ refuseNextDecision: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already applied this.', action: { ...ACT_LIFECYCLE, status: 'applied' } } } });
    const first = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(first.onGone).toHaveBeenCalledWith('Mona Manager already applied this.'));
  });

  it('shows a 403 at the buttons and asks the page to re-read', async () => {
    stubAgents({ mayDecide: false });
    const { onRefused, onGone } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't decide this action.");
    expect(onRefused).toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
  });
});

describe('AgentActionBody preview prefix', () => {
  it('starts every task.* preview except task.create with "<title>: "', () => {
    let checked = 0;
    for (const a of ACTIONS) {
      if (a.kind.startsWith('task.') && a.kind !== 'task.create' && a.preview.task) {
        checked += 1;
        expect(previewText(a).startsWith(`${a.preview.task.title}: `)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('AgentActionDecision refusals', () => {
  it('leaves on a 404 in the contract sentence', async () => {
    stubAgents({ refuseNextDecision: { status: 404, body: { code: 'NO_SUCH_ACTION', detail: 'No such action.' } } });
    const { onGone } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith("That action isn't there any more."));
    expect(taskChanged).toHaveBeenCalled();
    expect(recommendationsChanged).toHaveBeenCalled();
  });

  it("leaves on 409 EXPIRED in the server's words", async () => {
    const expired = { ...ACT_LIFECYCLE, status: 'expired' as const };
    stubAgents({ refuseNextDecision: { status: 409, body: { code: 'EXPIRED', detail: 'This action expired.', action: expired } } });
    const { onGone } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith('This action expired.'));
    expect(taskChanged).toHaveBeenCalled();
  });

  it('falls back to a generic sentence, moves focus to it and links it from Apply', async () => {
    stubAgents();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    mount();
    const apply = screen.getByRole('button', { name: 'Apply' });
    await userEvent.click(apply);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not record that decision. Try again.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(apply).toHaveAttribute('aria-describedby', alert.id);
  });

  it('shows a Reject refusal at the form, in the server words', async () => {
    stubAgents({ refuseNextDecision: { status: 403, body: { code: 'CANT_DECIDE', detail: "You can't decide this action." } } });
    const { onRefused, onGone } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't decide this action.");
    expect(onRefused).toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reject it' })).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  });

  it('sends one request on a double click of Reject it', async () => {
    const { spy } = stubAgents();
    const { onSettled } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.dblClick(screen.getByRole('button', { name: 'Reject it' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/reject/')).toHaveLength(1);
  });

  it('states the 255 limit in a hint the note points at', async () => {
    stubAgents();
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const hint = screen.getByText('Up to 255 characters.');
    expect(screen.getByLabelText('Why not? (optional)').getAttribute('aria-describedby')).toContain(hint.id);
  });
});
