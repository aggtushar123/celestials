import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChatView } from './ChatView';
import type { CopilotSession } from '../../features/copilotSessions/types';
import type { Proposal } from '../../features/proposals/proposalsSlice';

const session: CopilotSession = {
  id: 1,
  conversation_id: 9,
  owner: { id: 1, name: 'Alice' },
  customer_id: 3,
  customer_name: 'Fine',
  account_id: null,
  account_name: null,
  status: 'live',
  participants: [{ user: { id: 1, name: 'Alice' }, joined_at: '2026-09-12T10:00:00Z', left_at: null }],
  events: [],
  created_at: '2026-09-12T10:00:00Z',
  closed_at: null,
};

const decision: Proposal = {
  id: 41,
  batch: 'b',
  kind: 'task',
  kind_display: 'Task on an account',
  title: 'Book the exec sponsor call with Fine',
  rationale: 'Carl agreed to book it.',
  evidence: [],
  action: { customer_id: 3, customer_name: 'Fine', title: 'Exec sponsor call: Fine', assignee_name: 'Carl', due_date: '2026-09-19', priority: 'high' },
  initiative: null,
  status: 'proposed',
  status_display: 'Proposed',
  decided_by: null,
  decided_at: null,
  decision_note: '',
  result: {},
  generated_by: 'Carl',
  source: { session_id: 1, conversation_id: 9, title: 'What do we do about Fine?' },
  created_at: '2026-09-12T10:05:00Z',
};

const message = { id: 1, role: 'user' as const, content: 'What do we do about Fine?', sources: [], questions: [], created_at: '2026-09-12T10:00:00Z' };

function renderView(props: Partial<React.ComponentProps<typeof ChatView>> = {}) {
  return render(
    <MemoryRouter>
      <ChatView messages={[message]} onSendPrompt={() => {}} session={session} currentUserId={1} {...props} />
    </MemoryRouter>
  );
}

describe('ChatView decisions', () => {
  it('offers Capture decisions on a live session and lists what the facilitator wrote', async () => {
    const onCapture = vi.fn();
    renderView({ onCaptureDecisions: onCapture, decisions: [decision] });

    await userEvent.click(screen.getByRole('button', { name: 'Capture decisions' }));
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Decisions from this session')).toBeInTheDocument();
    expect(screen.getByText('Book the exec sponsor call with Fine')).toBeInTheDocument();
    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Work' })).toHaveAttribute('href', '/work?queue=mine&kind=bundle');
  });

  it('lets the owner close the session, capturing decisions first by default', async () => {
    const onClose = vi.fn();
    renderView({ onCloseSession: onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Close session' }));
    const choice = screen.getByRole('group', { name: 'Close this session' });
    await userEvent.click(within(choice).getByRole('button', { name: 'Close and capture decisions' }));
    expect(onClose).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: 'Close session' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close without capturing' }));
    expect(onClose).toHaveBeenLastCalledWith(false);
  });

  it('shows whom a turn asked, and whether they have answered', () => {
    const asked = { ...message, id: 2, content: '@Mei Tanaka why is usage down?', questions: [{ id: 9, assignee: { id: 5, name: 'Mei Tanaka' }, status: 'open' as const }] };
    renderView({ messages: [message, asked] });
    expect(screen.getByText('Mei Tanaka')).toBeInTheDocument();
    expect(screen.getByText('· open')).toBeInTheDocument();
  });

  it('offers the responsible people under an answer, skipping anyone already asked', async () => {
    const onAsk = vi.fn();
    const reply = {
      ...message, id: 3, role: 'assistant' as const, content: 'Here is what I know.',
      ask_suggestions: [
        { user_id: 5, name: 'Mei Tanaka', function: 'analytics', function_display: 'Analytics', reports_to: null, customer_id: 7, customer_name: 'Pizza Hut' },
        { user_id: 6, name: 'Priya Nair', function: 'engineering', function_display: 'Engineering', reports_to: null, customer_id: 7, customer_name: 'Pizza Hut' },
      ],
    };
    const asked = { ...message, id: 2, questions: [{ id: 9, assignee: { id: 6, name: 'Priya Nair' }, status: 'open' as const }] };
    renderView({ messages: [asked, reply], onAskSuggested: onAsk });

    expect(screen.getByText('Not answered? Ask')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Priya Nair/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Mei Tanaka/ }));
    expect(onAsk).toHaveBeenCalledWith(2, expect.objectContaining({ user_id: 5, customer_id: 7 }));
  });

  it('tells a sliced viewer what they see, and labels who replied to whom', () => {
    const ask = { ...message, id: 4, content: '@Dana CSM when is the QBR?', author: { id: 1, name: 'Alice Admin', function: 'leadership' }, questions: [{ id: 9, assignee: { id: 3, name: 'Dana CSM' }, status: 'open' as const }] };
    const reply = { ...message, id: 5, content: 'QBR is on the 20th.', author: { id: 3, name: 'Dana CSM', function: 'cs' } };
    renderView({ messages: [ask, reply], visibility: 'partial', currentUserId: 2 });
    expect(screen.getByRole('note')).toHaveTextContent('questions routed to you or to people who report to you');
    const labels = screen.getAllByText('Dana CSM').map((el) => el.parentElement?.textContent);
    expect(labels).toContain('Dana CSM · Customer Success, replying to Alice Admin');
    expect(screen.getByText('Alice Admin').parentElement).toHaveTextContent('Alice Admin · Leadership');
  });

  it('offers no close to a participant who is not the owner', () => {
    renderView({ onCloseSession: () => {}, currentUserId: 2 });
    expect(screen.queryByRole('button', { name: 'Close session' })).not.toBeInTheDocument();
  });

  it('shows the facilitator busy and its error, and hides the control on a private session', () => {
    renderView({ onCaptureDecisions: () => {}, isCapturing: true, captureError: 'Monthly token budget spent.' });
    expect(screen.getByRole('button', { name: 'Reading the session…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Monthly token budget spent.');

    renderView({ onCaptureDecisions: () => {}, session: { ...session, status: 'private' } });
    expect(screen.queryByRole('button', { name: 'Capture decisions' })).not.toBeInTheDocument();
  });

  // Privacy fix (SOC2:AUTH-02): a reader without view_all_accounts gets
  // evidence: [] and rationale: null on every proposal (never rendered —
  // this chat never showed either before this fix, and still doesn't),
  // and some task proposals left out entirely, counted in `hidden`.
  it('shows the hidden count in the singular, with no decisions header, when every decision is hidden', () => {
    renderView({ decisions: [], decisionsHidden: 1 });
    expect(screen.getByText("1 more decision about a record you can't open")).toBeInTheDocument();
    expect(screen.queryByText('Decisions from this session')).not.toBeInTheDocument();
  });

  it('shows the hidden count in the plural alongside the decisions that are visible', () => {
    renderView({ decisions: [decision], decisionsHidden: 3 });
    expect(screen.getByText('Decisions from this session')).toBeInTheDocument();
    expect(screen.getByText("3 more decisions about records you can't open")).toBeInTheDocument();
  });

  it('shows no hidden line when nothing is hidden', () => {
    renderView({ decisions: [decision], decisionsHidden: 0 });
    expect(screen.queryByText(/more decisions? about/)).not.toBeInTheDocument();
  });
});
