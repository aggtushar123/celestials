import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SAY, CHECK } from '../../features/canvas/canvasOptions';
import type { PersonFacts } from '../../features/canvas/canvasTypes';
import { daysAgo } from '../../features/canvas/testCanvasFixtures';
import { PersonCard } from './PersonCard';

const ROSA: PersonFacts = {
  name: 'Rosa Diaz', role: 'decision_maker', role_display: 'Decision Maker', sentiment: 'positive', sentiment_label: 'Positive',
  last_contacted_at: daysAgo(12), latest_survey: { type: 'nps', score: 9, answered_at: '2026-10-03T12:00:00Z' }, campaigns_unsubscribed: false,
};

describe('PersonCard (spec §2.2)', () => {
  it('shows name, role, sentiment as a dot and a word, the last contact and the latest survey in mono', () => {
    render(<PersonCard kind="person" person={ROSA} menu={null} />);
    expect(screen.getByText('Rosa Diaz')).toBeInTheDocument();
    expect(screen.getByText('Decision Maker')).toBeInTheDocument();
    const facts = screen.getByRole('list', { name: 'Facts' });
    expect(within(facts).getByText('Positive').closest('[data-sentiment]')).toHaveAttribute('data-sentiment', 'positive');
    expect(facts).toHaveTextContent('Contacted 12 days ago');
    expect(facts).toHaveTextContent('NPS 9 · 3 Oct');
    expect(within(facts).getByText('12')).toHaveClass('tabular-nums');
    expect(within(facts).getByText('9')).toHaveClass('tabular-nums');
    expect(screen.queryByText(SAY.UNSUBSCRIBED)).toBeNull();
  });

  it('warns in words with an icon when nobody has been in touch for 60+ days, and shows Unsubscribed', () => {
    render(<PersonCard kind="person" person={{ ...ROSA, last_contacted_at: daysAgo(70), campaigns_unsubscribed: true }} menu={null} />);
    const stale = screen.getByText(/Not contacted in/).closest('[data-stale]');
    expect(stale).toHaveTextContent('Not contacted in 60+ days');
    expect(stale?.querySelector('svg')).not.toBeNull();
    expect(stale).toHaveClass('text-warning-ink');
    expect(screen.getByText(SAY.UNSUBSCRIBED)).toBeInTheDocument();
  });

  it('says "Not contacted yet" plainly: never contacted is not overdue, so no icon and no amber', () => {
    render(<PersonCard kind="person" person={{ ...ROSA, last_contacted_at: null }} menu={null} />);
    const line = screen.getByText('Not contacted yet').closest('[data-stale]') as HTMLElement;
    expect(line.querySelector('svg')).toBeNull();
    expect(line).not.toHaveClass('text-warning-ink');
    expect(line.querySelector('.text-warning-ink')).toBeNull();
  });

  it('says a newly added person has facts after saving (Contract note 14)', () => {
    render(<PersonCard kind="person" person={{ ...ROSA, pending: true }} menu={null} />);
    expect(screen.getByText(CHECK.PENDING)).toBeInTheDocument();
    expect(screen.queryByText('Positive')).toBeNull();
  });

  it('names nobody on a hidden node, and offers its menu on a removed one', () => {
    const { rerender } = render(<PersonCard kind="hidden" person={null} menu={null} />);
    expect(screen.getByText(SAY.HIDDEN)).toBeInTheDocument();
    rerender(<PersonCard kind="removed" person={null} menu={<button type="button">menu</button>} />);
    expect(screen.getByText(SAY.REMOVED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'menu' })).toBeInTheDocument();
  });
});
