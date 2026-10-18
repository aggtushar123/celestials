import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CopilotRail, type CopilotRailProps } from './CopilotRail';
import { postedBodies, stubCopilot } from './testCopilot';
import { useCopilotThread } from './useCopilotThread';
import type { Conversation, DashboardContext, OrganizationsContext, SurfaceContext } from '../../pages/copilot/types';
import { surfaceLabel } from './surfaceLabels';

const DASH: DashboardContext = {
  surface: 'dashboard',
  area: 'revenue',
  view: 'forecast',
  filters: { owner: '2', lifecycle: '', customer: '' },
  focus: null,
};

type Given = Omit<CopilotRailProps, 'conversation' | 'onConversation' | 'onClearContext'> & { onClearContext?: () => void };

function Harness(props: Given) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  return <CopilotRail onClearContext={() => {}} {...props} conversation={conversation} onConversation={setConversation} />;
}

function renderRail(props: Partial<Given> = {}) {
  const tree = (next: Partial<Given>) => (
    <MemoryRouter>
      <Harness context={null} {...next} />
    </MemoryRouter>
  );
  const view = render(tree(props));
  return { ...view, rerenderRail: (next: Partial<Given>) => view.rerender(tree(next)) };
}

describe('CopilotRail', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sends a label context as the Communications text prefix and no context field', async () => {
    const { spy } = stubCopilot();
    renderRail({ context: { kind: 'label', label: 'Support desk' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await screen.findByText('Answer to: [About: Support desk] What is waiting?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([{ content: '[About: Support desk] What is waiting?' }]);
  });

  it('sends a dashboard context as the structured field, with no text prefix', async () => {
    const { spy } = stubCopilot();
    renderRail({ label: 'Ask Revenact', variant: 'plain', context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast · Owner: Priya' } });
    expect(screen.getByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(screen.getByText('Revenue › Forecast · Owner: Priya')).toBeInTheDocument();
    // The screen itself cannot be removed from a question, only a focus can.
    expect(screen.queryByRole('button', { name: 'Remove focus' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    expect(await screen.findByText('Answer to: Why is at-risk ARR up?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([{ content: 'Why is at-risk ARR up?', context: DASH }]);
  });

  it('sends an organizations context as the structured field, and chips each question with the label given', async () => {
    const { spy } = stubCopilot();
    const ORG: OrganizationsContext = {
      surface: 'organizations',
      view: 'board',
      filters: { owner: '2' },
      focus: null,
    };
    renderRail({
      chipLabel: (asked) => (asked.surface === 'organizations' ? 'Organizations · Owner: Carl CSM' : 'elsewhere'),
      context: { kind: 'surface', context: ORG, label: 'Organizations · Owner: Carl CSM' },
    });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    expect(postedBodies(spy)).toEqual([{ content: 'Who renews first?', context: ORG }]);
    expect(within(screen.getByRole('log', { name: 'Copilot messages' })).getByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
  });

  it('offers to remove a focus, and only a focus', async () => {
    const onClearContext = vi.fn();
    const focused = { ...DASH, focus: { kind: 'companies' as const, ids: [3, 7] } };
    renderRail({ onClearContext, context: { kind: 'surface', context: focused, label: 'Revenue › Forecast · 2 accounts' } });
    await userEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
    expect(onClearContext).toHaveBeenCalledOnce();
  });

  it('renders what it is given above the conversation', () => {
    renderRail({ top: <p>Top slot</p> });
    expect(screen.getByText('Top slot')).toBeInTheDocument();
  });

  it('shows a thinking skeleton while the answer is on its way', async () => {
    const { release } = stubCopilot({ hold: true });
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Thinking…');
    release();
    expect(await screen.findByText('Answer to: What is waiting?')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says the budget is used up on a 429, keeps the question, and offers no retry', async () => {
    stubCopilot({ statuses: [429] });
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("This month's AI budget is used up.");
    expect(screen.getByText('What is waiting?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps the question after any other failure and sends the same body again on Retry', async () => {
    const { spy } = stubCopilot({ statuses: [500] });
    renderRail({ context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Answer to: Why is at-risk ARR up?')).toBeInTheDocument();
    const bodies = postedBodies(spy);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it('disables Retry while nothing can be asked (the scope still settling), rather than resending blind', async () => {
    stubCopilot({ statuses: [500] });
    const { rerenderRail } = renderRail({ context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    await screen.findByRole('button', { name: 'Retry' });
    rerenderRail({
      context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' },
      unavailable: 'Ask opens once this view loads.',
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  });

  it('puts focus back in the input after sending with the Send button', async () => {
    stubCopilot();
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Answer to: What is waiting?');
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus();
  });

  it('lists the records an answer cites, as the Copilot page does', async () => {
    stubCopilot();
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Please cite it{enter}');
    expect(await screen.findByText('Based on 1 record')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /SSO login fails/ })).toBeInTheDocument();
  });

  it('runs on a thread it is handed, so a caller can send without the composer', async () => {
    stubCopilot();
    function Outside() {
      const [conversation, setConversation] = useState<Conversation | null>(null);
      const thread = useCopilotThread(conversation, setConversation);
      return (
        <>
          <button type="button" onClick={() => void thread.send({ text: 'From outside', content: 'From outside' })}>Send from outside</button>
          <CopilotRail context={null} onClearContext={() => {}} conversation={conversation} onConversation={setConversation} thread={thread} />
        </>
      );
    }
    render(<MemoryRouter><Outside /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Send from outside' }));
    expect(await screen.findByText('Answer to: From outside')).toBeInTheDocument();
  });

  it('each question shows the screen it was asked on, and a follow-up carries the new screen', async () => {
    const { spy } = stubCopilot();
    const names = { owner: { '2': 'Priya', '5': 'Omar' } };
    const chipLabel = (asked: SurfaceContext) => surfaceLabel(asked, { dashboard: names });
    const { rerenderRail } = renderRail({ chipLabel, context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast · Owner: Priya' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    await screen.findByText('Answer to: Why is at-risk ARR up?');

    const moved = { ...DASH, filters: { ...DASH.filters, owner: '5' } };
    rerenderRail({ chipLabel, context: { kind: 'surface', context: moved, label: 'Revenue › Forecast · Owner: Omar' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And now?{enter}');
    await screen.findByText('Answer to: And now?');

    expect((postedBodies(spy)[1].context as typeof DASH).filters.owner).toBe('5');
    const log = screen.getByRole('log', { name: 'Copilot messages' });
    expect(within(log).getByText('Revenue › Forecast · Owner: Priya')).toBeInTheDocument();
    expect(within(log).getByText('Revenue › Forecast · Owner: Omar')).toBeInTheDocument();
  });

  it('shows no per-message chip where no chip label is given (a dashboard thread reopened elsewhere is plain text)', async () => {
    stubCopilot();
    renderRail({ context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why?{enter}');
    await screen.findByText('Answer to: Why?');
    expect(within(screen.getByRole('log', { name: 'Copilot messages' })).queryByText('Revenue › Forecast')).not.toBeInTheDocument();
  });

  it('shows Communications\' empty line on a dashboard rail too, and no suggestions', async () => {
    stubCopilot();
    renderRail({ context: { kind: 'surface', context: { ...DASH, area: 'overview', view: null }, label: 'Overview' } });
    const log = screen.getByRole('log', { name: 'Copilot messages' });
    expect(within(log).getByText('Ask about what is in front of you. Answers use your accounts, mail and tickets.')).toHaveClass('m-auto', 'text-center');
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What should I act on first?{enter}');
    expect(await screen.findByText('Answer to: What should I act on first?')).toBeInTheDocument();
    expect(within(log).queryByText('Ask about what is in front of you. Answers use your accounts, mail and tickets.')).not.toBeInTheDocument();
  });

  it('prefills a draft, focused and editable, and sends nothing until asked', async () => {
    const { spy } = stubCopilot();
    const onSent = vi.fn();
    const { rerenderRail } = renderRail({ onSent });
    rerenderRail({ onSent, draft: { text: 'Why are these in At risk?', nonce: 1 } });
    const input = screen.getByPlaceholderText('Ask Revenact');
    expect(input).toHaveValue('Why are these in At risk?');
    expect(input).toHaveFocus();
    expect(postedBodies(spy)).toHaveLength(0);
    await userEvent.type(input, '{enter}');
    await screen.findByText('Answer to: Why are these in At risk?');
    expect(onSent).toHaveBeenCalledOnce();
  });

  it('shows a 400 as the generic error with Retry, not the budget message', async () => {
    stubCopilot({ statuses: [400] });
    renderRail({ context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent("This month's AI budget is used up.");
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it("says an organisation or account that is no longer the asker's was refused, and offers no retry", async () => {
    const page: SurfaceContext = { surface: 'organizations', view: 'detail', organization: 7, account: 31, focus: null };
    const cases: [Record<string, string[]>, string][] = [
      [{ account: ['Not an account of this organisation you can open.'] }, 'You can no longer ask about this account. Choose All and ask again.'],
      [{ organization: ['Not an organisation you can open.'] }, 'You can no longer ask about this organization.'],
    ];
    for (const [refuse, message] of cases) {
      const { spy } = stubCopilot({ refuse });
      const { unmount } = renderRail({ context: { kind: 'surface', context: page, label: 'Pizza Hut · EMEA' } });
      await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What changed?{enter}');
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      // The question stays, with its chip.
      expect(screen.getByText('What changed?')).toBeInTheDocument();
      expect(postedBodies(spy)).toHaveLength(1);
      unmount();
    }
  });

  it('leaves focus where the person moved it while the answer was on its way', async () => {
    const { release } = stubCopilot({ hold: true });
    render(
      <MemoryRouter>
        <button type="button">Elsewhere</button>
        <Harness context={null} />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    release();
    await screen.findByText('Answer to: What is waiting?');
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });

  it("draws no chip on a turn whose context the server withheld, whichever surface the others came from", () => {
    const seen: SurfaceContext[] = [
      DASH,
      { surface: 'accounts', view: 'list', filters: {}, label: 'Accounts' },
      { surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, label: 'Pipelines · Risks' },
    ];
    const conversation: Conversation = {
      id: 9,
      title: 'Shared',
      created_at: '',
      updated_at: '',
      origin: null,
      visibility: 'partial',
      messages: [
        ...seen.map((context, i) => ({ id: i + 1, role: 'user' as const, content: `Seen ${i}`, context, sources: [], questions: [], created_at: '' })),
        { id: 10, role: 'user', content: 'Withheld (null)', context: null, sources: [], questions: [], created_at: '' },
        { id: 11, role: 'user', content: 'Withheld (absent)', sources: [], questions: [], created_at: '' },
      ],
    };
    render(
      <MemoryRouter>
        <CopilotRail context={null} onClearContext={() => {}} conversation={conversation} onConversation={() => {}} chipLabel={(c) => surfaceLabel(c)} />
      </MemoryRouter>,
    );
    const log = screen.getByRole('log', { name: 'Copilot messages' });
    // A turn is its text, with the chip above it when there is one.
    const turn = (text: string) => within(log).getByText(text).parentElement!;
    for (const text of ['Seen 0', 'Seen 1', 'Seen 2']) expect(turn(text).children).toHaveLength(2);
    expect(within(log).getByText('Pipelines · Risks')).toBeInTheDocument();
    expect(turn('Withheld (null)').children).toHaveLength(1);
    expect(turn('Withheld (absent)').children).toHaveLength(1);
  });

  it('says why nothing can be asked yet, and sends nothing', async () => {
    const { spy } = stubCopilot();
    renderRail({ context: null, unavailable: 'Ask opens once this view loads.' });
    const line = screen.getByText('Ask opens once this view loads.');
    expect(line).toHaveClass('text-[13px]', 'text-ink-muted');
    // The centred empty line would contradict this one, so it is suppressed.
    expect(screen.queryByText('Ask about what is in front of you. Answers use your accounts, mail and tickets.')).not.toBeInTheDocument();
    // A screen-reader user typing anyway is told why nothing happens.
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveAttribute('aria-describedby', line.id);
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Hello?{enter}');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(postedBodies(spy)).toEqual([]);
  });

  it('shows no such line when every question can be asked', () => {
    renderRail({ context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    expect(screen.queryByText('Ask opens once this view loads.')).not.toBeInTheDocument();
  });

  it('offers the starters it is given on an empty thread, 44px each, sends the one pressed, then hides them', async () => {
    const { spy } = stubCopilot();
    renderRail({ starters: ['First?', 'Second?'], context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    const list = screen.getByRole('list', { name: 'Suggested questions' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['First?', 'Second?']);
    for (const button of buttons) expect(button).toHaveClass('min-h-11', 'text-[13px]');
    await userEvent.click(buttons[1]);
    expect(await screen.findByText('Answer to: Second?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([{ content: 'Second?', context: DASH }]);
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
  });

  it('offers no starters without a surface context, or while nothing can be asked', () => {
    const { rerenderRail } = renderRail({ starters: ['First?'], context: null });
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    rerenderRail({ starters: ['First?'], context: { kind: 'label', label: 'Support desk' } });
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    rerenderRail({ starters: ['First?'], context: { kind: 'surface', context: DASH, label: 'x' }, unavailable: 'Wait.' });
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
  });
});
