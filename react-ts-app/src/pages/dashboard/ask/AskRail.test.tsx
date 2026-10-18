import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Link, MemoryRouter, Routes } from 'react-router-dom';
import { dashboardRoutes } from '../routes';
import userEvent from '@testing-library/user-event';
import { useDrill } from '../drill/useDrill';
import { useAsk } from './useAsk';
import { resetViewport, setViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { authStore, renderDashboard, Where } from './testAsk';
import { ASK_PREFERENCE_KEY } from './askPreference';

function Probe() {
  const { open } = useDrill();
  return (
    <div>
      <Link to="/dashboard/revenue/forecast?owner=2">Go to forecast for owner 2</Link>
      <button
        type="button"
        onClick={(event) => open({ title: 'At risk', figure: '$1', source: { kind: 'rows', rows: [{ id: '3', name: 'Uber' }] } }, event.currentTarget)}
      >
        Open drill
      </button>
      <Where />
    </div>
  );
}

function EntryProbe() {
  const ask = useAsk();
  return (
    <div>
      <button type="button" onClick={() => ask?.draft('Why these?', { kind: 'companies', ids: [3] })}>
        Draft A
      </button>
      <button type="button" onClick={() => ask?.ask('What about this?', { kind: 'attention', key: 'renewal:9' })}>
        Ask B
      </button>
    </div>
  );
}

const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });

describe('the Ask rail on the dashboard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    resetViewport();
    vi.restoreAllMocks();
  });

  it('is open by default at xl, beside the scroll area, shaped like Communications\' rail', () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    expect(rail()).toBeInTheDocument();
    expect(within(rail()!).getByText('Overview')).toBeInTheDocument();
    // The empty state is Communications': the same line, no suggestions.
    expect(within(rail()!).getByText('Ask about what is in front of you. Answers use your accounts, mail and tickets.')).toBeInTheDocument();
    expect(within(rail()!).queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    // No header row of its own: the controls live in the top bar.
    expect(within(rail()!).queryByRole('heading', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(within(rail()!).queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
  });

  it('has its controls in the top bar pill, as Communications does', () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    const bar = within(screen.getByTestId('nav-actions'));
    expect(bar.getByRole('button', { name: 'New chat' })).toHaveAttribute('title', 'New chat');
    expect(bar.getByRole('button', { name: 'History' })).toHaveAttribute('aria-expanded', 'false');
    const toggle = bar.getByRole('button', { name: 'Hide Copilot' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('title', 'Hide Copilot');
    expect(toggle).toHaveClass('bg-accent', 'text-on-accent');
  });

  it('opens History anchored inside the pill', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    const history = screen.getByRole('button', { name: 'History' });
    await userEvent.click(history);
    const panel = await screen.findByRole('dialog', { name: 'History' });
    expect(screen.getByTestId('nav-actions')).toContainElement(panel);
    expect(history).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders no controls, and does not crash, without a top bar slot', () => {
    stubCopilot();
    setViewport(1440);
    render(
      <Provider store={authStore()}>
        <MemoryRouter initialEntries={['/dashboard/overview']}>
          <Routes>{dashboardRoutes(() => <Probe />)}</Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(rail()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide Copilot' })).not.toBeInTheDocument();
  });

  it('is hidden below xl, and the Copilot switch remembers the choice either way', async () => {
    stubCopilot();
    const first = renderDashboard('/dashboard/overview', () => <Probe />, 1100);
    expect(rail()).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show Copilot' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus());
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('open');
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('closed');
    expect(screen.getByRole('button', { name: 'Show Copilot' })).toHaveFocus();
    first.unmount();

    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    expect(rail()).not.toBeInTheDocument();
  });

  it('falls back to the default when storage fails', async () => {
    stubCopilot();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    expect(rail()).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
  });

  it('New chat clears the conversation and opens the rail without saving the choice', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What needs me?{enter}');
    await screen.findByText('Answer to: What needs me?');
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(screen.queryByText('Answer to: What needs me?')).not.toBeInTheDocument());
    expect(within(rail()!).getByText('Ask about what is in front of you. Answers use your accounts, mail and tickets.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('closed');
  });

  it('keeps the conversation across areas, and a follow-up carries the new screen', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What needs me?{enter}');
    await screen.findByText('Answer to: What needs me?');
    await userEvent.click(screen.getByRole('link', { name: 'Go to forecast for owner 2' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    expect(screen.getByText('Answer to: What needs me?')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And here?{enter}');
    await screen.findByText('Answer to: And here?');
    const [first, second] = postedBodies(spy);
    expect(first.context).toEqual({ surface: 'dashboard', area: 'overview', view: null, filters: { owner: '', lifecycle: '', customer: '' }, focus: null });
    expect(second.context).toEqual({ surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' }, focus: null });
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Overview')).toBeInTheDocument();
    expect(within(log).getByText('Revenue › Forecast · Owner: 2')).toBeInTheDocument();
  });

  it('keeps a failed question and its Retry when the filters change', async () => {
    const { spy } = stubCopilot({ statuses: [502] });
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What needs me?{enter}');
    expect(await within(rail()!).findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go to forecast for owner 2' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    expect(within(rail()!).getByRole('alert')).toBeInTheDocument();
    expect(within(rail()!).getByText('What needs me?')).toBeInTheDocument();
    await userEvent.click(within(rail()!).getByRole('button', { name: 'Retry' }));
    await screen.findByText('Answer to: What needs me?');
    // Retry asks as it was asked: the Overview, not the screen moved to.
    const [, again] = postedBodies(spy);
    expect(again.context).toMatchObject({ area: 'overview' });
  });

  it('opens the drill panel over the rail, not beside it', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'Open drill' }));
    const drill = screen.getByRole('dialog', { name: /At risk/ });
    expect(drill).toHaveClass('lg:absolute');
    expect(drill).not.toHaveClass('lg:static');
    expect(rail()).toBeInTheDocument();
  });

  it('an entry point opens the rail without changing the remembered choice', async () => {
    stubCopilot();
    localStorage.setItem(ASK_PREFERENCE_KEY, 'closed');
    renderDashboard('/dashboard/overview', () => <EntryProbe />, 1440);
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Draft A' }));
    expect(rail()).toBeInTheDocument();
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('closed');
  });

  it('an ask replaces an earlier draft focus, and leaves no focus behind', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/overview', () => <EntryProbe />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'Draft A' }));
    expect(within(rail()!).getByRole('button', { name: 'Remove focus' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask B' }));
    await screen.findByText('Answer to: What about this?');
    const [sent] = postedBodies(spy);
    expect((sent.context as { focus: unknown }).focus).toEqual({ kind: 'attention', key: 'renewal:9' });
    expect(within(rail()!).queryByRole('button', { name: 'Remove focus' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveValue('');
  });
});
