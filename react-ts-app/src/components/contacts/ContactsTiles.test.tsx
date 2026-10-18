import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContactsTiles } from './ContactsTiles';

describe('ContactsTiles', () => {
  it('shows the summary as four standard tiles, figures in tabular body figures', () => {
    render(<ContactsTiles summary={{ total: 16, decision_makers: 7, active: 12, positive: 4, neutral: 10, negative: 2, growth_30d_pct: 0 }} />);
    expect(screen.getByRole('group', { name: 'People' })).toHaveTextContent('16');
    expect(within(screen.getByRole('group', { name: 'People' })).getByText('16')).toHaveClass('text-[22px]', 'tabular-nums');
    expect(screen.getByRole('group', { name: 'Sentiment' })).toHaveTextContent('25%');
    expect(screen.getByRole('group', { name: 'Growth (30d)' })).toHaveTextContent('0%');
    // Every tile carries a meta line, so the four match.
    expect(screen.getByRole('group', { name: 'Decision makers' })).toHaveTextContent('of 16 people');
    expect(screen.getByRole('group', { name: 'Growth (30d)' })).toHaveTextContent('change in people over 30 days');
    expect(screen.getByRole('group', { name: 'People' }).parentElement).toHaveClass('@min-[50rem]:grid-cols-4');
  });
});
