import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionKind } from '../../features/agents/agentTypes';
import { AGENT_SETTINGS } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import { renderPage } from '../work/testPages';
import { resetViewport } from '../../test/viewport';
import { AgentActionsPage } from './AgentActionsPage';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

describe('Settings › Actions & approvals (spec §1.6, §1.8; Decision 6)', () => {
  it('lays out kinds by agents, all Ask, with Not used where an agent does not use a kind', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const table = await screen.findByRole('table', { name: 'Actions & approvals' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Action', 'CS agent', 'Sales agent', 'Ops agent']);
    expect(screen.getByLabelText('Change lifecycle stage for the CS agent')).toHaveValue('ask');
    const initiative = within(table).getByText('Start an initiative').closest('tr')!;
    expect(within(initiative).getAllByText('Not used')).toHaveLength(2);
  });

  it('keeps every select readable and every row centred (UI broken-things fix 6)', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const table = await screen.findByRole('table', { name: 'Actions & approvals' });
    const select = screen.getByLabelText('Change lifecycle stage for the CS agent');
    // A floor, not a sliver: the table cannot squeeze it below 7rem.
    expect(select.closest('.w-28')).toHaveClass('min-w-28');
    expect(select).toHaveClass('min-h-11', 'sm:min-h-9', 'rounded-lg', 'border-line', 'bg-surface');
    expect(select.closest('.w-28')).not.toHaveClass('min-w-0');
    // The grid scrolls sideways inside its card on a phone.
    expect(table.parentElement).toHaveClass('overflow-x-auto');
    // Names line up with their selects.
    for (const cell of table.querySelectorAll('tbody th, tbody td')) {
      expect(cell).toHaveClass('align-middle');
      expect(cell).not.toHaveClass('align-top');
    }
    expect(within(table).getByRole('rowheader', { name: 'Change lifecycle stage' })).toHaveClass('min-w-32', 'sticky');
  });

  it('caps a cell at its max_level', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const owner = await screen.findByLabelText('Change owner for the CS agent');
    expect(within(owner).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
  });

  it('saves only the changed cells', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    await userEvent.selectOptions(await screen.findByLabelText('Change lifecycle stage for the CS agent'), 'auto');
    await userEvent.selectOptions(screen.getByLabelText('Start an initiative for the Ops agent'), 'never');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ levels: { cs: { 'record.lifecycle': 'auto' }, ops: { 'initiative.create': 'never' } } }]);
  });

  it('says near the grid that Never expires pending actions of that kind', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    expect(await screen.findByText(/Setting an action to Never also expires that agent's waiting actions of that kind/)).toBeInTheDocument();
  });

  it('sends nothing when no cell changed', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    await screen.findByRole('table', { name: 'Actions & approvals' });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([]);
  });

  it('shows a refusal under its cell, linked, and focuses it', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const cell = await screen.findByLabelText('Change lifecycle stage for the CS agent');
    spy.mockImplementationOnce(async () => ({ ok: false, status: 400, json: async () => ({ levels: { cs: { 'record.lifecycle': ['Not allowed here.'] } } }) }));
    await userEvent.selectOptions(cell, 'auto');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const message = await screen.findByText('Not allowed here.');
    expect(cell).toHaveAttribute('aria-invalid', 'true');
    expect(cell.getAttribute('aria-describedby')).toBe(message.id);
    expect(cell).toHaveFocus();
  });

  it('gives a member the levels as words', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false } });
    renderPage(<AgentActionsPage />, '/settings/agents/actions', { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    const table = screen.getByRole('table', { name: 'Actions & approvals' });
    const owner = within(table).getByText('Change owner').closest('tr')!;
    expect(within(owner).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Ask', 'Ask', 'Not used']);
    const initiative = within(table).getByText('Start an initiative').closest('tr')!;
    expect(within(initiative).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Not used', 'Not used', 'Ask']);
  });

  it('lists what each action does', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const list = await screen.findByRole('list', { name: 'What each action does' });
    expect(within(list).getByText('Move Dough Co from Live to Renewal')).toBeInTheDocument();
  });

  it('clears Saved. on the next edit', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const cell = await screen.findByLabelText('Change lifecycle stage for the CS agent');
    await userEvent.selectOptions(cell, 'auto');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    await userEvent.selectOptions(cell, 'never');
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('shows the AI-off notice once, for an admin and for a member', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, ai_enabled: false } });
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    expect(await screen.findAllByText("AI is off for this workspace: agents don't run.")).toHaveLength(1);
    cleanup();
    stubAgents({ settings: { ...AGENT_SETTINGS, ai_enabled: false, can_edit: false } });
    renderPage(<AgentActionsPage />, '/settings/agents/actions', { role: 'csm' });
    expect(await screen.findAllByText("AI is off for this workspace: agents don't run.")).toHaveLength(1);
  });

  it('focuses the first refused cell in row order', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const lifecycle = await screen.findByLabelText('Change lifecycle stage for the CS agent');
    const initiative = screen.getByLabelText('Start an initiative for the Ops agent');
    spy.mockImplementationOnce(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ levels: { ops: { 'initiative.create': ['No.'] }, cs: { 'record.lifecycle': ['Nope.'] } } }),
    }));
    await userEvent.selectOptions(lifecycle, 'auto');
    await userEvent.selectOptions(initiative, 'never');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Nope.');
    expect(lifecycle).toHaveFocus();
  });

  // jsdom lays nothing out, so this checks what makes the browser keep the
  // page from scrolling sideways: the table scrolls inside its own
  // overflow-x-auto wrapper, its first column sticks, and nothing between
  // the wrapper and the page forces a width (a flex row ancestor needs min-w-0).
  describe.each([
    ['an admin', 'admin'],
    ['a member', 'csm'],
  ] as const)('at phone width, for %s', (_who, role) => {
    it('scrolls the table inside its own wrapper and forces no page width', async () => {
      stubAgents();
      renderPage(<AgentActionsPage />, '/settings/agents/actions', { role, width: 375 });
      const table = await screen.findByRole('table', { name: 'Actions & approvals' });
      const wrapper = table.parentElement!;
      expect(wrapper).toHaveClass('overflow-x-auto');
      expect(within(table).getByRole('columnheader', { name: 'Action' })).toHaveClass('sticky', 'left-0');
      for (let el = wrapper.parentElement; el && el !== document.body; el = el.parentElement) {
        const cls = el.className;
        expect(cls, `${el.tagName}.${cls}`).not.toMatch(/\bw-max\b|\bw-screen\b|\bmin-w-\[|\bmin-w-(?!0\b)\w|whitespace-nowrap/);
        const flexRow = /(^|\s)flex(\s|$)/.test(cls) && !/\bflex-col\b/.test(cls);
        if (flexRow) expect(cls, `${el.tagName}.${cls}`).toMatch(/\bmin-w-0\b|\boverflow-/);
      }
    });
  });

  it('caps Start a plan at Ask, lets Draft a reply reach Auto, and leaves both unused by the Ops agent', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const plan = await screen.findByLabelText('Start a plan for the CS agent');
    expect(within(plan).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
    const draft = screen.getByLabelText('Draft a reply for the Sales agent');
    expect(within(draft).getAllByRole('option').map((o) => o.textContent)).toEqual(['Auto', 'Ask', 'Never']);
    const table = screen.getByRole('table', { name: 'Actions & approvals' });
    expect(within(within(table).getByText('Draft a reply').closest('tr')!).getAllByText('Not used')).toHaveLength(1);
    expect(within(within(table).getByText('Start a plan').closest('tr')!).getAllByText('Not used')).toHaveLength(1);
  });

  it("caps the five builder kinds at Ask; only Map a record's people is for every agent (Agents delivery 3)", async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const segment = await screen.findByLabelText('Build a segment for the Ops agent');
    expect(within(segment).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
    const map = screen.getByLabelText("Map a record's people for the CS agent");
    expect(within(map).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
    const table = screen.getByRole('table', { name: 'Actions & approvals' });
    for (const label of ['Build a segment', 'Build a scenario', 'Draft a campaign', 'Write a plan template']) {
      expect(within(within(table).getByText(label).closest('tr')!).getAllByText('Not used'), label).toHaveLength(2);
    }
    expect(within(within(table).getByText("Map a record's people").closest('tr')!).queryAllByText('Not used')).toHaveLength(0);
  });
});

describe('Actions & approvals on the settings frame (UI foundations spec §4.2, §6.3)', () => {
  it('sits the matrix flush in its section card, with sentence-case headers and Save in the footer', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const table = await screen.findByRole('table', { name: 'Actions & approvals' });
    const section = screen.getByRole('region', { name: 'What each agent may do' });
    expect(section).toContainElement(table);
    expect(within(table).getByRole('columnheader', { name: 'Action' })).toHaveClass('text-[11px]', 'font-semibold', 'text-ink-muted');
    expect(within(table).getByRole('columnheader', { name: 'Action' }).className).not.toMatch(/uppercase/);
    const save = within(section).getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('border-t', 'justify-end');
    expect(screen.getByRole('region', { name: 'What each action does' })).toContainElement(screen.getByRole('list', { name: 'What each action does' }));
  });
});

describe('Actions & approvals: the header row', () => {
  it.each([
    ['an admin (the form)', 'admin'],
    ['a member (the summary)', 'csm'],
  ] as const)('rules the header row off from the body for %s', async (_who, role) => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agents/actions', { role });
    const table = await screen.findByRole('table', { name: 'Actions & approvals' });
    expect(within(table).getByRole('columnheader', { name: 'Action' }).closest('tr')).toHaveClass('border-b', 'border-line-subtle');
  });

  it('shows an outside kind as Always asks with no select, names irreversible kinds, and never sends a locked kind', async () => {
    const outside = { kind: 'mail.send_reply' as ActionKind, label: 'Send an email reply', example: 'Reply to the customer', max_level: 'ask' as const, agents: ['cs' as const], irreversible: true, outside: true, locked: true };
    const settings = { ...AGENT_SETTINGS, kinds: [...AGENT_SETTINGS.kinds, outside], levels: { ...AGENT_SETTINGS.levels, cs: { ...AGENT_SETTINGS.levels.cs, [outside.kind]: 'ask' as const } } };
    const { spy } = stubAgents({ settings });
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const row = (await screen.findByRole('rowheader', { name: /Send an email reply/ })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Always asks')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: "Send a campaign · Can't be undone" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Draft a campaign for the Ops agent'), 'never');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toHaveLength(1));
    expect(JSON.stringify(sent(spy, 'PATCH', '/agents/settings/')[0])).not.toContain('mail.send_reply');
  });
});
