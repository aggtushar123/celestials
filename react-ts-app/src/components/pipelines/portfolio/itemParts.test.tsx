import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { analyticsAddOn, emeaSeats } from '../../../features/pipelines/testPipelines';
import { DateLine, PartOf, PriorityTag, StageTag } from './itemParts';

describe('the Pipelines item parts', () => {
  it("links Part of to the organisation's or account's page, naming an account's organisation", () => {
    render(
      <MemoryRouter>
        <PartOf row={emeaSeats} />
        <PartOf row={analyticsAddOn} />
      </MemoryRouter>,
    );
    const account = screen.getByRole('link', { name: 'Pizza Hut EMEA' });
    expect(account).toHaveAttribute('href', '/accounts/12');
    expect(account.parentElement).toHaveTextContent('Part of Pizza Hut EMEA · Pizza Hut');
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    // A 44px hit area on phones that adds no height to a wrapped meta line.
    expect(account).toHaveClass('before:h-11', 'sm:before:hidden');
    expect(account).not.toHaveClass('min-h-11');
  });

  it('shows the date with its figure, in danger when overdue', () => {
    render(
      <>
        <DateLine text="Overdue 5d" overdue />
        <DateLine text="Closes in 7d" overdue={false} />
        <PriorityTag priority={{ value: 'low', label: 'Low' }} />
        <StageTag label="Negotiation" />
      </>,
    );
    const dates = document.querySelectorAll('[data-field="date"]');
    expect(dates[0]).toHaveTextContent('Overdue 5d');
    expect(dates[0]).toHaveClass('font-semibold', 'text-danger-ink');
    expect(dates[0].querySelector('.tabular-nums')).toHaveTextContent('5');
    expect(dates[1]).toHaveClass('text-ink-muted');
    expect(screen.getByText('Low')).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(screen.getByText('Negotiation').closest('[data-field]')).toHaveAttribute('data-field', 'stage');
  });
});
