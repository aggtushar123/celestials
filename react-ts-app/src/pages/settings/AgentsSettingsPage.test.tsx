import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SETTINGS } from '../../features/agents/testAgentsFixtures';
import { calls, sent, stubAgents } from '../../features/agents/testAgents';
import { renderPage } from '../work/testPages';
import { resetViewport } from '../../test/viewport';
import { AgentsSettingsPage } from './AgentsSettingsPage';
import { recommendationsChanged, taskChanged } from '../../components/work/taskChanges';

// The real signals, wrapped so a test can see which ones a run sent.
vi.mock('../../components/work/taskChanges', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../components/work/taskChanges')>();
  return { ...real, recommendationsChanged: vi.fn(real.recommendationsChanged), taskChanged: vi.fn(real.taskChanged) };
});

// Figured sets each figure in its own span, so a sentence is matched on the whole paragraph.
const sentence = (text: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === text;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(recommendationsChanged).mockClear();
  vi.mocked(taskChanged).mockClear();
  resetViewport();
});

describe('Settings › Agents (spec §1.8; Decisions 7, 8)', () => {
  it('shows a card per agent with its budget bar, last run and Run now', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    expect(within(cs).getByText(sentence('12 of 133 credits this month · resets on 1 Nov 2026'))).toBeInTheDocument();
    expect(within(cs).getByRole('progressbar', { name: 'CS agent credits this month' })).toHaveAttribute('aria-valuenow', '12');
    expect(within(cs).getByText(sentence('Last run 8 Oct 2026: 4 proposed, 1 applied'))).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ops agent' })).getByText('Switched off.')).toBeInTheDocument();
  });

  it('saves the workspace AI switch at once and refreshes the signed-in user', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    await userEvent.click(await screen.findByRole('switch', { name: 'AI for this workspace' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ ai_enabled: false }]));
    await waitFor(() => expect(calls(spy, 'GET', '/auth/me/').length).toBeGreaterThan(0));
  });

  it('saves the tone at once and refreshes the signed-in user', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    await userEvent.selectOptions(await screen.findByLabelText('Tone'), 'friendly');
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ tone: 'friendly' }]));
    await waitFor(() => expect(calls(spy, 'GET', '/auth/me/').length).toBeGreaterThan(0));
  });

  it('saves an agent switch at once and does not re-read the user', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    await userEvent.click(await screen.findByRole('switch', { name: 'CS agent' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { enabled: false } } }]));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'CS agent' })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(calls(spy, 'GET', '/auth/me/')).toEqual([]);
  });

  it('undoes an agent switch with a second PATCH', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    await userEvent.click(await screen.findByRole('switch', { name: 'CS agent' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'CS agent' })).toHaveAttribute('aria-checked', 'false'));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { enabled: false } } }, { agents: { cs: { enabled: true } } }]));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'CS agent' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('collects monthly credits in the save bar', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const budget = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(budget);
    await userEvent.type(budget, '20');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { monthly_credits: 20 } } }]));
  });

  it('saves through the page bar when Enter is pressed in a budget', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(cs);
    await userEvent.type(cs, '20');
    const sales = screen.getByLabelText('Monthly credits for the Sales agent');
    await userEvent.clear(sales);
    await userEvent.type(sales, '30{Enter}');
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { monthly_credits: 20 }, sales: { monthly_credits: 30 } } }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(screen.getByText('Saved.')).toBeInTheDocument();
  });

  it('keeps an edited budget when a switch is flipped, and its Save sends only the budget', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const budget = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(budget);
    await userEvent.type(budget, '20');
    await userEvent.click(screen.getByRole('switch', { name: 'Sales agent' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { sales: { enabled: false } } }]));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Sales agent' })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByLabelText('Monthly credits for the CS agent')).toHaveValue('20');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toHaveLength(2));
    expect(sent(spy, 'PATCH', '/agents/settings/')[1]).toEqual({ agents: { cs: { monthly_credits: 20 } } });
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('checks budgets in the browser, then saves only the budget', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const credits = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(credits);
    await userEvent.type(credits, '2001');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Choose a whole number from 0 to 2000.')).toBeInTheDocument();
    expect(credits).toHaveAttribute('aria-invalid', 'true');
    expect(credits).toHaveAccessibleDescription(/Choose a whole number from 0 to 2000\./);
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([]);
    await userEvent.clear(credits);
    await userEvent.type(credits, '200');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { monthly_credits: 200 } } }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('runs an agent now, and shows a refusal in the server words', async () => {
    stubAgents({ refuseNextRun: { status: 409, body: { code: 'BUDGET_USED', detail: "This agent's budget is used up: it resumes on 1 Nov." } } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
    expect(await within(cs).findByRole('alert')).toHaveTextContent("This agent's budget is used up: it resumes on 1 Nov.");
    await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
    expect(await within(cs).findByText('The CS agent ran: 3 proposed, 1 applied.')).toBeInTheDocument();
  });

  it('gives a member the values as text, without Run now when can_run is false', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false, can_run: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('shows the skeleton again on Try again', async () => {
    stubAgents({ failSettings: 2 });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(retry);
    expect(screen.getByText('Loading the agent settings')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'CS agent' })).toBeInTheDocument();
  });

  describe('server refusals, in place', () => {
    // Wraps the stub's fetch so the next PATCH answers `body` with a 400.
    function refuseSave(body: unknown) {
      const real = fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
          init?.method === 'PATCH' ? { ok: false, status: 400, json: async () => body } : real(input, init),
        ),
      );
    }

    it('shows agents.cs.monthly_credits at the budget', async () => {
      stubAgents();
      refuseSave({ agents: { cs: { monthly_credits: ['Choose a whole number from 0 to 2000.'] } } });
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const credits = await screen.findByLabelText('Monthly credits for the CS agent');
      await userEvent.type(credits, '1');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Choose a whole number from 0 to 2000.')).toBeInTheDocument();
      expect(credits).toHaveAttribute('aria-invalid', 'true');
      expect(credits).toHaveAccessibleDescription('Choose a whole number from 0 to 2000.');
    });

    it('shows agents.cs.enabled at the switch', async () => {
      stubAgents();
      refuseSave({ agents: { cs: { enabled: ['Set a budget before you switch this agent on.'] } } });
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const toggle = await screen.findByRole('switch', { name: 'CS agent' });
      await userEvent.click(toggle);
      expect(await screen.findByText('Set a budget before you switch this agent on.')).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(toggle).toHaveAccessibleDescription('Set a budget before you switch this agent on.');
    });

    it('shows a top-level tone refusal at the tone select', async () => {
      stubAgents();
      refuseSave({ tone: ['Choose professional, friendly or concise.'] });
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const tone = await screen.findByLabelText('Tone');
      await userEvent.selectOptions(tone, 'friendly');
      expect(await screen.findByText('Choose professional, friendly or concise.')).toBeInTheDocument();
      expect(tone).toHaveAttribute('aria-invalid', 'true');
      expect(tone).toHaveAccessibleDescription('Choose professional, friendly or concise.');
    });

    it('links a top-level ai_enabled refusal to the AI switch', async () => {
      stubAgents();
      refuseSave({ ai_enabled: ['Choose on or off.'] });
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const toggle = await screen.findByRole('switch', { name: 'AI for this workspace' });
      await userEvent.click(toggle);
      expect(await screen.findByText('Choose on or off.')).toBeInTheDocument();
      expect(toggle).toHaveAccessibleDescription(/Choose on or off\./);
    });
  });

  describe('Run now', () => {
    it('shows a 200 run that was skipped as failed', async () => {
      stubAgents();
      const real = fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method !== 'POST' || !String(input).includes('/agents/cs/run/')) return real(input, init);
          const card = { ...AGENT_SETTINGS.agents[0], last_run: { at: '2026-10-08T09:20:00Z', proposed: 0, applied: 0, dropped: 0, skipped_reason: 'failed' } };
          return { ok: true, status: 200, json: async () => card };
        }),
      );
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      expect(await within(cs).findByText('The CS agent could not run. Try again.')).toBeInTheDocument();
    });

    it('updates the card after a successful run', async () => {
      stubAgents();
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      expect(await within(cs).findByText(sentence('13 of 133 credits this month · resets on 1 Nov 2026'))).toBeInTheDocument();
      expect(within(cs).getByText(sentence('Last run 8 Oct 2026: 3 proposed, 1 applied'))).toBeInTheDocument();
    });

    it('tells Recommended, the badges and the task lists after a run that applied something', async () => {
      stubAgents();
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      await within(cs).findByText('The CS agent ran: 3 proposed, 1 applied.');
      expect(recommendationsChanged).toHaveBeenCalled();
      expect(taskChanged).toHaveBeenCalled();
    });

    it('leaves the task lists alone after a run that applied nothing', async () => {
      stubAgents({ refuseNextRun: { status: 200, body: { ...AGENT_SETTINGS.agents[0], last_run: { at: '2026-10-08T09:20:00Z', proposed: 2, applied: 0, dropped: 0, skipped_reason: null } } } });
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      await within(cs).findByText('The CS agent ran: 2 proposed, 0 applied.');
      expect(recommendationsChanged).toHaveBeenCalled();
      expect(taskChanged).not.toHaveBeenCalled();
    });

    it('says a success in a status region that was there before the run, and a failure in a focused alert', async () => {
      stubAgents({ refuseNextRun: { status: 409, body: { code: 'AGENT_OFF', detail: 'This agent is switched off.' } } });
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      const status = within(cs).getByRole('status');
      expect(status).toBeEmptyDOMElement();
      await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      const alert = await within(cs).findByRole('alert');
      expect(alert).toHaveTextContent('This agent is switched off.');
      expect(alert).toHaveFocus();
      expect(status).toBeEmptyDOMElement();
      expect(recommendationsChanged).not.toHaveBeenCalled();
      await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      await waitFor(() => expect(status).toHaveTextContent('The CS agent ran: 3 proposed, 1 applied.'));
      expect(within(cs).getByRole('status')).toBe(status);
      expect(within(cs).queryByRole('alert')).toBeNull();
    });

    it('sends one POST for a double click', async () => {
      const { spy } = stubAgents();
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      const run = within(cs).getByRole('button', { name: 'Run now' });
      fireEvent.click(run);
      fireEvent.click(run);
      await within(cs).findByText('The CS agent ran: 3 proposed, 1 applied.');
      expect(calls(spy, 'POST', '/agents/cs/run/')).toHaveLength(1);
    });

    it('keeps focus on Run now while it runs (aria-disabled, not disabled) and after the run', async () => {
      const { spy } = stubAgents();
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      const run = within(cs).getByRole('button', { name: 'Run now' });
      run.focus();
      fireEvent.click(run);
      expect(run).toHaveAttribute('aria-disabled', 'true');
      expect(run).not.toBeDisabled();
      fireEvent.click(run);
      await within(cs).findByText('The CS agent ran: 3 proposed, 1 applied.');
      expect(run).not.toHaveAttribute('aria-disabled');
      expect(run).toHaveFocus();
      expect(calls(spy, 'POST', '/agents/cs/run/')).toHaveLength(1);
    });

    it('keeps both cards when two runs finish together', async () => {
      stubAgents();
      renderPage(<AgentsSettingsPage />, '/settings/agents');
      const cs = await screen.findByRole('region', { name: 'CS agent' });
      const sales = screen.getByRole('region', { name: 'Sales agent' });
      fireEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
      fireEvent.click(within(sales).getByRole('button', { name: 'Run now' }));
      await waitFor(() => {
        expect(within(cs).getByText(sentence('13 of 133 credits this month · resets on 1 Nov 2026'))).toBeInTheDocument();
        expect(within(sales).getByText(sentence('1 of 133 credits this month · resets on 1 Nov 2026'))).toBeInTheDocument();
      });
    });
  });

  it('says AI is off to an admin', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, ai_enabled: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    expect(await screen.findByText("AI is off for this workspace: agents don't run.")).toBeInTheDocument();
  });

  it('says AI is off to a member', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, ai_enabled: false, can_edit: false, can_run: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    expect(await screen.findByText("AI is off for this workspace: agents don't run.")).toBeInTheDocument();
  });

  it('gives an editor without can_run the form and no Run now', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: true, can_run: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    expect(await screen.findByRole('switch', { name: 'AI for this workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });

  it('gives a runner without can_edit Run now and no form', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false, can_run: true } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    expect(await screen.findAllByRole('button', { name: 'Run now' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('sends no PATCH when a budget is retyped to the same number', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const credits = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(credits);
    await userEvent.type(credits, '0133');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([]);
  });

  it('draws a budget of 0 as an empty bar', async () => {
    const cs = { ...AGENT_SETTINGS.agents[0], monthly_credits: 0, spent_this_month: 0 };
    stubAgents({ settings: { ...AGENT_SETTINGS, agents: [cs, ...AGENT_SETTINGS.agents.slice(1)] } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const bar = await within(await screen.findByRole('region', { name: 'CS agent' })).findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(Number(bar.getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(1);
    expect(bar.firstElementChild).not.toHaveClass('bg-danger');
    expect(bar.firstElementChild).toHaveStyle({ width: '0%' });
  });

  it('names each switch by its agent, without the state in the name', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    expect(await screen.findByRole('switch', { name: 'Ops agent' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'CS agent' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows no save bar on load for a saved budget above the plan, and saves another budget past it', async () => {
    const cs = { ...AGENT_SETTINGS.agents[0], monthly_credits: 5000 };
    const { spy } = stubAgents({ settings: { ...AGENT_SETTINGS, agents: [cs, ...AGENT_SETTINGS.agents.slice(1)] } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    expect(await screen.findByLabelText('Monthly credits for the CS agent')).toHaveValue('5000');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const sales = screen.getByLabelText('Monthly credits for the Sales agent');
    await userEvent.clear(sales);
    await userEvent.type(sales, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { sales: { monthly_credits: 20 } } }]));
  });

  it('focuses the first invalid budget', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const sales = await screen.findByLabelText('Monthly credits for the Sales agent');
    const ops = screen.getByLabelText('Monthly credits for the Ops agent');
    await userEvent.type(sales, 'x');
    await userEvent.type(ops, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sales).toHaveFocus());
  });
});

describe('Settings › Agents on the settings frame (UI foundations spec §6.3)', () => {
  it('heads the page from the nav, and makes each agent a section with Run now on its heading row', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    expect(screen.getByRole('heading', { level: 1, name: 'Agents' })).toHaveClass('text-[22px]');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    expect(within(cs).getByRole('heading', { level: 2, name: 'CS agent' })).toHaveClass('text-[15px]');
    const run = within(cs).getByRole('button', { name: 'Run now' });
    expect(run.closest('.rounded-xl')).toBeNull();
    expect(within(cs).getByRole('switch', { name: 'CS agent' })).toHaveAttribute('aria-checked');
    expect(within(cs).getByLabelText('Monthly credits for the CS agent')).toHaveClass('tabular-nums');
    expect(screen.getByRole('region', { name: 'Workspace AI' })).toContainElement(screen.getByRole('switch', { name: 'AI for this workspace' }));
  });

  it('keeps each agent card a section with no card inside a card', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    await screen.findByRole('region', { name: 'CS agent' });
    expect(errors.mock.calls.filter(([message]) => message === 'Card inside Card')).toEqual([]);
    errors.mockRestore();
  });

  it('keeps an agent run answer in a status region that is one node from before the run', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    const region = within(cs).getByRole('status');
    await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(region).not.toBeEmptyDOMElement());
    expect(within(cs).getByRole('status')).toBe(region);
  });

  it('says on the card when conversations wait on credits', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, agents: AGENT_SETTINGS.agents.map((card) => (card.kind === 'cs' ? { ...card, waiting_threads: 3, waiting_reason: 'budget' as const } : card)) } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    const note = within(cs).getByText(sentence("3 conversations are waiting: this agent's credits are used up until 1 Nov 2026."));
    // Danger ink, alone: a muted ink beside it would win by stylesheet order.
    expect(note).toHaveClass('text-danger-ink');
    expect(note).not.toHaveClass('text-ink-muted');
    expect(within(screen.getByRole('region', { name: 'Sales agent' })).queryByText(/conversations? (are|is) waiting/)).not.toBeInTheDocument();
  });

  it.each([
    ['an admin', 'admin', true],
    ['a member', 'csm', false],
  ] as const)('shows %s the fast lane right after Reading messages, with no primary button', async (_who, role, canEdit) => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: canEdit } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role });
    const lane = await screen.findByRole('region', { name: 'Fast lane' });
    const titles = screen.getAllByRole('region').map((region) => within(region).getAllByRole('heading')[0]?.textContent);
    expect(titles.indexOf('Fast lane')).toBe(titles.indexOf('Reading messages') + 1);
    if (canEdit) expect(within(lane).getByRole('switch', { name: 'Fast lane' })).not.toBeChecked();
    else expect(within(lane).getByText('Off')).toBeInTheDocument();
    expect(within(lane).queryAllByRole('button').filter((button) => button.className.includes('bg-accent'))).toEqual([]);
  });
});
