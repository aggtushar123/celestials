import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type InitialEntry } from 'react-router-dom';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { toContextFilters } from '../../../features/organizations/askContext';
import { parseParams, BOARD_GROUP } from '../../../features/organizations/portfolioParams';
import { resetViewport, setViewport } from '../../../test/viewport';
import type { Conversation, SurfaceContext, SurfaceName } from '../../copilot/types';
import { ASK_PREFERENCE_KEY, ORGANIZATIONS_ASK_KEY } from './askPreference';
import { AskProvider } from './AskProvider';
import { AskRail } from './AskRail';
import type { AskSurface } from './context';
import { useAsk } from './useAsk';

const orgConversation: Conversation = {
  id: 9,
  title: 'Who renews first?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] },
  messages: [],
};
const dashConversation: Conversation = {
  id: 4,
  title: 'Why is at-risk ARR up?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } },
  messages: [],
};

function Probe() {
  const ask = useAsk()!;
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="where">{pathname + search}</p>
      <p data-testid="state">{JSON.stringify(state ?? null)}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="title">{ask.conversation?.title ?? 'none'}</p>
      <p data-testid="open">{String(ask.open)}</p>
      <p data-testid="focus">{JSON.stringify(ask.focus)}</p>
      <button type="button" onClick={() => ask.openFromHistory(orgConversation)}>Open organizations chat</button>
      <button type="button" onClick={() => ask.openFromHistory(dashConversation)}>Open dashboard chat</button>
      <button type="button" onClick={() => ask.focusOn({ kind: 'companies', ids: [7] })}>Focus Pizza Hut</button>
      <button type="button" onClick={() => ask.setOpen(true)}>Show rail</button>
      <button type="button" onClick={() => ask.ask('Who renews first?', ask.focus)}>Ask now</button>
      <button type="button" onClick={() => ask.newChat()}>New chat</button>
      <button type="button" onClick={() => navigate('/organizations/board?owner=3')}>Change filter</button>
    </div>
  );
}

// The Board, owner 2: the page's own params, through the real context builder.
const boardContext: SurfaceContext = {
  surface: 'organizations',
  view: 'board',
  filters: toContextFilters(parseParams(new URLSearchParams('owner=2'), BOARD_GROUP), 'board'),
  focus: null,
};

let orgContext: SurfaceContext | null = null;
let withRail = false;

const surfaceOf = (name: SurfaceName, context: SurfaceContext | null = null): AskSurface => ({
  name,
  context,
  chipLabel: () => 'Organizations',
});

// Two component types, so moving between the routes mounts a fresh provider,
// as moving between DashboardFrame and OrganizationsAskLayout does.
function DashboardSide() {
  return (
    <AskProvider surface={surfaceOf('dashboard')}>
      <Probe />
    </AskProvider>
  );
}
function OrganizationsSide() {
  return (
    <AskProvider surface={surfaceOf('organizations', orgContext)} preferenceKey={ORGANIZATIONS_ASK_KEY}>
      <Probe />
      {withRail ? <AskRail /> : null}
    </AskProvider>
  );
}

function renderAt(url: InitialEntry, width: number) {
  setViewport(width);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dashboard/*" element={<DashboardSide />} />
        <Route path="/organizations/*" element={<OrganizationsSide />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AskProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    orgContext = null;
    withRail = false;
  });
  afterEach(() => resetViewport());

  it('narrows the next question with focusOn, without opening the rail', async () => {
    renderAt('/organizations/list', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Focus Pizza Hut' }));
    expect(screen.getByTestId('focus')).toHaveTextContent('{"kind":"companies","ids":[7]}');
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });

  it("keeps each surface's open choice under its own key", async () => {
    renderAt('/organizations/list', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Show rail' }));
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBe('open');
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBeNull();
  });

  it("reopens its own surface's conversation where it started, and shows it", async () => {
    renderAt('/organizations/board', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Open organizations chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/list?owner=2');
    expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?');
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBeNull();
  });

  it("sends another surface's conversation to its own page, whose rail shows it for that visit", async () => {
    stubCopilot({ conversationById: { 9: orgConversation } });
    renderAt('/dashboard/overview', 1100);
    expect(screen.getByTestId('surface')).toHaveTextContent('dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'Open organizations chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('organizations');
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBeNull();
  });

  it('hands a dashboard conversation picked on Organizations to the dashboard, as a sheet on a phone', async () => {
    stubCopilot({ conversationById: { 4: dashConversation } });
    renderAt('/organizations/list', 375);
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Why is at-risk ARR up?'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
  });
  // A GET for conversation 9 that waits until the test lets it answer.
  function slowHandover() {
    const stub = stubCopilot({ conversationById: { 9: orgConversation }, hold: true });
    let answer = () => {};
    const gate = new Promise<void>((resolve) => { answer = resolve; });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (/\/copilot\/conversations\/9\/$/.test(url)) await gate;
      return stub.spy(url, init);
    });
    return { ...stub, answer };
  }
  const handedOver = { pathname: '/organizations/list', search: '?owner=2', state: { askConversationId: 9 } };

  it('fetches a handed-over conversation it was not given, e.g. after a reload', async () => {
    const { spy } = stubCopilot({ conversationById: { 9: orgConversation } });
    renderAt(handedOver, 1100);
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(spy.mock.calls.filter(([url]) => String(url).includes('/copilot/conversations/9/'))).toHaveLength(1);
  });

  it('reuses the conversation History already loaded, without fetching it again', async () => {
    const { spy } = stubCopilot({ conversationById: { 9: orgConversation } });
    renderAt('/dashboard/overview', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Open organizations chat' }));
    expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?');
    expect(spy.mock.calls.filter(([url]) => String(url).includes('/copilot/conversations/9/'))).toHaveLength(0);
  });

  it('clears the handover from the navigation state once read, so a reload or Back does not replay it', async () => {
    stubCopilot({ conversationById: { 9: orgConversation } });
    renderAt('/dashboard/overview', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Open organizations chat' }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('null'));
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/list?owner=2');
    expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?');
  });

  it("leaves navigation state alone when it isn't an Ask handover: only a real handover (an id or a conversation) is cleared", async () => {
    renderAt({ pathname: '/organizations/list', state: { somethingElse: true } }, 1100);
    expect(screen.getByTestId('state')).toHaveTextContent('{"somethingElse":true}');
    // Give the clearing effect a turn to (not) run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('state')).toHaveTextContent('{"somethingElse":true}');
  });

  it('never lets a late handover overwrite a question sent meanwhile', async () => {
    orgContext = boardContext;
    const { release, answer } = slowHandover();
    renderAt(handedOver, 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Ask now' }));
    answer(); // the handover lands while the question is on its way
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Chat'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('title')).toHaveTextContent('Chat');
  });

  it('never lets a late handover undo New chat', async () => {
    const { answer } = slowHandover();
    renderAt(handedOver, 1100);
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    answer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('title')).toHaveTextContent('none');
  });

  it("sends an Organizations question with the page's sparse filters, view and focus", async () => {
    orgContext = boardContext;
    const { spy } = stubCopilot();
    renderAt('/organizations/board?owner=2', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Focus Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask now' }));
    await waitFor(() => expect(postedBodies(spy)).toHaveLength(1));
    expect(postedBodies(spy)[0].context).toEqual({
      surface: 'organizations',
      view: 'board',
      filters: { owner: '2' },
      focus: { kind: 'companies', ids: [7] },
    });
    // The send spends the focus.
    expect(screen.getByTestId('focus')).toHaveTextContent('null');
  });

  it("never sends another surface's context: a mismatched ask is a no-op", async () => {
    orgContext = { surface: 'dashboard', area: 'overview', view: null, filters: { owner: '', lifecycle: '', customer: '' }, focus: null };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spy } = stubCopilot();
    renderAt('/organizations/list', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Ask now' }));
    expect(postedBodies(spy)).toHaveLength(0);
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("drops the focus on the chip's ×", async () => {
    orgContext = boardContext;
    withRail = true;
    stubCopilot();
    renderAt('/organizations/board?owner=2', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Show rail' }));
    await userEvent.click(screen.getByRole('button', { name: 'Focus Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
    expect(screen.getByTestId('focus')).toHaveTextContent('null');
  });

  it('drops the focus when the filters change', async () => {
    renderAt('/organizations/board?owner=2', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Focus Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Change filter' }));
    expect(screen.getByTestId('focus')).toHaveTextContent('null');
  });
});
