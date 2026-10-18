import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LUKAS_HISTORY } from '../../features/contacts/testContacts';
import { HistoryCallItem, HistoryEmailItem, HistoryTicketItem } from './HistoryItems';

const [ANALYSED, EMPTY, PENDING] = LUKAS_HISTORY.calls;

function inList(node: ReactNode) {
  render(<ul>{node}</ul>);
  return screen.getByRole('listitem');
}

describe('HistoryCallItem (spec 2026-09-28 §3)', () => {
  it('shows date, title, sentiment, summary, classification, host and length, place and recording', () => {
    const item = inList(<HistoryCallItem call={ANALYSED} />);
    expect(within(item).getByRole('heading', { name: 'Renewal readiness' })).toBeInTheDocument();
    expect(within(item).getByText('12 Sep 2026')).toHaveClass('tabular-nums');
    expect(within(item).getByText('Positive')).toHaveClass('bg-success-dim', 'text-success-ink');
    expect(within(item).getByText('They want the enterprise tier. Budget is agreed for Q4.')).toHaveClass('truncate');
    for (const text of ['Customer Success › Account Management', 'Carl CSM · 45 min', 'Kraft Heinz › Kraft Heinz EMEA']) {
      expect(within(item).getByText(text)).toBeInTheDocument();
    }
    const recording = within(item).getByRole('link', { name: 'Recording' });
    expect(recording).toHaveAttribute('href', 'https://zoom.us/rec/71');
    expect(recording).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('opens the whole summary in place from its title', async () => {
    const item = inList(<HistoryCallItem call={ANALYSED} />);
    const title = within(item).getByRole('button', { name: 'Renewal readiness' });
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(within(item).getByText('They want the enterprise tier. Budget is agreed for Q4.')).toHaveClass('whitespace-pre-line');
  });

  it('says "Not enough to analyse" for a call with nothing to read', () => {
    const item = inList(<HistoryCallItem call={EMPTY} />);
    expect(within(item).getByText('Not enough to analyse')).toBeInTheDocument();
    expect(within(item).getByText('No summary.')).toBeInTheDocument();
    expect(within(item).getByText('Kraft Heinz')).toBeInTheDocument();
    expect(within(item).queryByRole('link')).toBeNull();
  });

  it('shows no reading while a call waits, and never links a non-http recording', () => {
    const item = inList(<HistoryCallItem call={PENDING} />);
    for (const text of ['Positive', 'Neutral', 'Negative', 'Not enough to analyse']) expect(within(item).queryByText(text)).toBeNull();
    expect(within(item).queryByRole('link')).toBeNull();
  });
});

describe('HistoryEmailItem and HistoryTicketItem', () => {
  it('an email: subject, date, sentiment, snippet, place and sender', () => {
    const item = inList(<HistoryEmailItem email={LUKAS_HISTORY.emails[0]} />);
    for (const text of ['Thanks for the call', '11 Sep 2026', 'Positive', 'Thanks for walking us through the plan.', 'Kraft Heinz', 'from Lukas Vermeer']) {
      expect(within(item).getByText(text)).toBeInTheDocument();
    }
  });

  it('an email with no thread still renders, with nothing to click (review: link.thread_id is nullable)', () => {
    const noThread = LUKAS_HISTORY.emails.find((e) => e.link.thread_id === null);
    expect(noThread).toBeDefined();
    const item = inList(<HistoryEmailItem email={noThread!} />);
    expect(within(item).getByRole('heading', { name: 'Kick-off agenda' })).toBeInTheDocument();
    expect(within(item).queryByRole('link')).toBeNull();
  });

  it('a ticket: number in tabular figures, title, status, date and the ticket link', () => {
    const item = inList(<HistoryTicketItem ticket={LUKAS_HISTORY.tickets[0]} />);
    expect(within(item).getByText('ZD-1042')).toHaveClass('tabular-nums');
    expect(within(item).getByText('ZD-1042')).not.toHaveClass('font-mono-brand');
    for (const text of ['Open', '10 Sep 2026', 'Kraft Heinz']) expect(within(item).getByText(text)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Open ticket' })).toHaveAttribute('href', 'https://kraft.zendesk.example/t/1042');
  });

  it("a ticket with a department: shows \"Department · Status\" (fix round 1)", () => {
    const withDept = LUKAS_HISTORY.tickets.find((t) => t.department_display);
    expect(withDept).toBeDefined();
    const item = inList(<HistoryTicketItem ticket={withDept!} />);
    expect(within(item).getByText('Billing · Open')).toBeInTheDocument();
    expect(within(item).queryByText('Open', { exact: true })).toBeNull();
  });
});
