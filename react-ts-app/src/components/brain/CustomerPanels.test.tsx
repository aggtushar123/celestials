import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CS } from '../../features/brain/customersText';
import { CARL_CUSTOMERS, COMPANY_CUSTOMERS, ME_CUSTOMERS, TEAM_CUSTOMERS } from '../../features/brain/testCustomersFixtures';
import { ScoresPanel } from './ScoresPanel';
import { SentimentPanel } from './SentimentPanel';

const renderIn = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const part = (kind: string, name: string) => document.querySelector(`[data-score="${kind}"] [data-part="${name}"]`);
const TODAY = new Date('2026-10-05T12:00:00Z');

describe('Scores (customers spec §2.1, Decision 3)', () => {
  it('shows NPS, CSAT and CES against the 90 days before, the change in words beside its colour', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    expect(part('nps', 'figure')).toHaveTextContent('+18');
    expect(part('nps', 'figure')).toHaveClass('tabular-nums');
    expect(part('nps', 'change')).toHaveTextContent('down 7 pts from +25');
    expect(part('nps', 'change')).toHaveClass('text-danger-ink');
    expect(part('nps', 'responses')).toHaveTextContent('22 answers · 19 before');
    expect(part('csat', 'figure')).toHaveTextContent('82.5%');
    expect(part('csat', 'change')).toHaveTextContent('up 2.5 pts from 80%');
    expect(part('csat', 'change')).toHaveClass('text-success-ink');
  });

  it('says Not enough answers under 5 in the window and shows no change (Contract note 5)', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    expect(part('ces', 'figure')).toHaveTextContent(CS.NOT_ENOUGH);
    expect(part('ces', 'change')).toBeNull();
    expect(part('ces', 'responses')).toHaveTextContent('3 answers · 0 before');
  });

  it('says it can’t compare when only the earlier window is under 5', () => {
    renderIn(<ScoresPanel scores={CARL_CUSTOMERS.scores} />);
    expect(part('nps', 'figure')).toHaveTextContent('+10');
    expect(part('nps', 'change')).toHaveTextContent(CS.NOT_COMPARED);
    expect(part('nps', 'change')).toHaveClass('text-ink-muted');
  });

  it('lists the latest comments with score, record (linked) and date, and counts the hidden ones', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    const row = within(screen.getByRole('list', { name: CS.COMMENTS })).getByRole('listitem');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('NPS 4 · Uber · 3 Oct');
    expect(within(row).getByRole('link', { name: 'Uber' })).toHaveAttribute('href', '/organizations/3');
    expect(row).toHaveTextContent('Support is slow lately.');
    expect(screen.getByText("1 more comment on a record you can't open")).toBeInTheDocument();
  });

  it('links an account’s comment to the account, and shows a comment with no record unlinked', () => {
    const scores = { ...COMPANY_CUSTOMERS.scores, comments: [...COMPANY_CUSTOMERS.scores.comments, { ...COMPANY_CUSTOMERS.scores.comments[0], record: null, comment: 'No record here.' }] };
    renderIn(<ScoresPanel scores={scores} />);
    const rows = within(screen.getByRole('list', { name: CS.COMMENTS })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Globex EMEA' })).toHaveAttribute('href', '/accounts/9');
    expect(within(rows[2]).queryByRole('link')).toBeNull();
    expect(rows[2]).toHaveTextContent('No record here.');
  });

  it('draws Scores as one card: the figures, then the comments in the same card', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    const heading = screen.getByRole('heading', { level: 3, name: CS.COMMENTS });
    expect(heading).toHaveClass('text-[13px]', 'font-semibold');
    const card = heading.closest('section')!;
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    const nps = card.querySelector('[data-score="nps"] [data-part="figure"]')!;
    expect(nps).toHaveClass('text-[22px]', 'tabular-nums');
  });

  it('says there are no comments, and no hidden line, when there are none', () => {
    renderIn(<ScoresPanel scores={ME_CUSTOMERS.scores} />);
    expect(screen.getByText(CS.NO_COMMENTS)).toBeInTheDocument();
    expect(document.querySelector('[data-part="hidden"]')).toBeNull();
  });

  it('says the comments are hidden, not absent, when every comment in the window is closed to the reader (final review #12)', () => {
    renderIn(<ScoresPanel scores={{ ...ME_CUSTOMERS.scores, hidden: 2 }} />);
    expect(screen.getByText('No comments you can open in the last 90 days.')).toBeInTheDocument();
    expect(screen.queryByText(CS.NO_COMMENTS)).toBeNull();
    expect(screen.getByText("2 more comments on records you can't open")).toBeInTheDocument();
  });
});

describe('Sentiment (customers spec §2.1, Decision 4)', () => {
  it('counts the negative contacts and lists who turned negative, newest first, in words', () => {
    renderIn(<SentimentPanel sentiment={COMPANY_CUSTOMERS.sentiment} today={TODAY} />);
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('9 contacts negative');
    expect(screen.getByRole('heading', { name: CS.TURNED })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: CS.TURNED_LIST })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Olivia Park' })).toHaveAttribute('href', '/contacts/41');
    expect(within(rows[0]).getByRole('link', { name: 'Apple Inc' })).toHaveAttribute('href', '/organizations/6');
    expect(rows[0].querySelector('[data-part="meta"]')).toHaveTextContent('was neutral · 2 Oct');
    expect(within(rows[1]).getByRole('link', { name: 'Globex EMEA' })).toHaveAttribute('href', '/accounts/9');
    expect(rows[1].querySelector('[data-part="meta"]')).toHaveTextContent('was positive · 28 Sep');
  });

  it('says since when while tracking is under 30 days old', () => {
    renderIn(<SentimentPanel sentiment={{ ...TEAM_CUSTOMERS.sentiment, tracking_since: '2026-09-20' }} today={TODAY} />);
    expect(screen.getByRole('heading', { name: 'Turned negative since 20 Sep, when we started tracking changes' })).toBeInTheDocument();
  });

  it('says nobody has turned negative since tracking started, before any change is recorded', () => {
    renderIn(<SentimentPanel sentiment={{ negative: 4, tracking_since: null, turned_negative: [] }} today={TODAY} />);
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('4 contacts negative');
    expect(screen.getByText(CS.NOT_TRACKING)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('says nobody turned negative in the last 30 days once tracking has started', () => {
    renderIn(<SentimentPanel sentiment={ME_CUSTOMERS.sentiment} today={TODAY} />);
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('0 contacts negative');
    expect(screen.getByText(CS.NOBODY_TURNED)).toBeInTheDocument();
  });

  it('shows a turned-negative row with no record as the contact alone, no "on" and no second link (final review #13)', () => {
    const sentiment = {
      negative: 1,
      tracking_since: '2026-01-01',
      turned_negative: [{ contact: { id: 99, name: 'Nina Park' }, record: null, previous: 'neutral' as const, changed_at: '2026-10-01T09:00:00Z' }],
    };
    renderIn(<SentimentPanel sentiment={sentiment} today={TODAY} />);
    const row = within(screen.getByRole('list', { name: CS.TURNED_LIST })).getByRole('listitem');
    expect(within(row).getByRole('link', { name: 'Nina Park' })).toBeInTheDocument();
    expect(within(row).getAllByRole('link')).toHaveLength(1);
    expect(row).not.toHaveTextContent(/\bon\b/);
  });

  it('keys each row by the contact and when they changed, so the same contact turning negative twice causes no key warning (final review #13)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sentiment = {
      negative: 1,
      tracking_since: '2026-01-01',
      turned_negative: [
        { contact: { id: 41, name: 'Olivia Park' }, record: null, previous: 'neutral' as const, changed_at: '2026-10-02T07:00:00Z' },
        { contact: { id: 41, name: 'Olivia Park' }, record: null, previous: 'positive' as const, changed_at: '2026-09-20T07:00:00Z' },
      ],
    };
    renderIn(<SentimentPanel sentiment={sentiment} today={TODAY} />);
    expect(within(screen.getByRole('list', { name: CS.TURNED_LIST })).getAllByRole('listitem')).toHaveLength(2);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/same key|unique.*key/i);
    errorSpy.mockRestore();
  });
});
