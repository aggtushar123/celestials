import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeadlinesTab } from './HeadlinesTab';
import type { Headline } from '../../../features/customers/customersSlice';

// Unit tier (see the `testing` skill): the tab is fully presentational
// — ActivityFeed owns the fetch and passes the three props down, the
// same shape as NotesTab/TicketsTab.

function headline(overrides: Partial<Headline> = {}): Headline {
  return {
    id: 1,
    kind: 'headline',
    kind_display: 'Headline',
    title: 'Apple EMEA Retail Operations Renewal and Expansion',
    content: 'Comprehensive renewal process showing exceptional account health.',
    status: 'open',
    status_display: 'Open',
    period_start: '2025-11-20',
    period_end: '2026-01-21',
    time_period_label: '',
    data_sources: ['notes', 'emails'],
    data_sources_display: 'Notes and Emails',
    group: 'January 2026',
    generated_at: null,
    created_at: '2026-01-21T00:00:00Z',
    ...overrides,
  };
}

function summary(overrides: Partial<Headline> = {}): Headline {
  return headline({
    id: 2,
    kind: 'summary',
    kind_display: 'Summary',
    title: 'TL;DR (Last 3 months)',
    content: 'Account shows exceptional health with strong renewal momentum.',
    status: '',
    status_display: '',
    period_start: null,
    period_end: null,
    time_period_label: 'Last 3 months',
    data_sources: ['notes', 'emails', 'call_transcripts', 'tickets'],
    data_sources_display: 'Notes, Emails, Call Transcripts and Tickets',
    group: '',
    ...overrides,
  });
}

describe('HeadlinesTab', () => {
  it('marks an open headline with a neutral dot: open is not an alert (spec §7)', () => {
    render(<HeadlinesTab headlines={[headline()]} isLoading={false} error={null} />);
    const dot = screen.getByText('Open').previousElementSibling;
    expect(dot).toHaveClass('bg-line-strong');
    expect(dot).not.toHaveClass('bg-danger');
  });

  it('shows a loading state while fetching', () => {
    render(<HeadlinesTab headlines={[]} isLoading error={null} />);
    expect(screen.getByText('Loading headlines')).toBeInTheDocument();
  });

  it('shows the error instead of an empty tab when the fetch fails', () => {
    render(<HeadlinesTab headlines={[]} isLoading={false} error="Could not load headlines." />);
    expect(screen.getByText('Could not load headlines.')).toBeInTheDocument();
  });

  it('shows an empty state for an account with no headlines yet', () => {
    // The mock fell back to rendering *every* headline when its filter
    // came up empty, which is how one account's cards ended up on all
    // of them. An account with nothing now says so.
    render(<HeadlinesTab headlines={[]} isLoading={false} error={null} />);
    expect(screen.getByText('No headlines yet')).toBeInTheDocument();
  });

  it('renders the TL;DR above the feed, with its sources and time period', () => {
    render(<HeadlinesTab headlines={[summary(), headline()]} isLoading={false} error={null} />);

    expect(screen.getByText('TL;DR (Last 3 months)')).toBeInTheDocument();
    expect(screen.getByText('Notes, Emails, Call Transcripts and Tickets')).toBeInTheDocument();
    expect(screen.getByText('Last 3 months')).toBeInTheDocument();
  });

  it('groups feed cards under the pill the backend derived', () => {
    render(<HeadlinesTab headlines={[headline()]} isLoading={false} error={null} />);
    expect(screen.getByText('January 2026')).toBeInTheDocument();
  });

  it('gives a storyline card its date span, not the summary footer', () => {
    // A generated headline carries data_sources too, so the mock's
    // "has sources? then it's the TL;DR" proxy would have swallowed
    // this card's dates.
    render(<HeadlinesTab headlines={[headline()]} isLoading={false} error={null} />);

    expect(screen.getByText(/20 Nov 2025/)).toBeInTheDocument();
    expect(screen.getByText(/21 Jan 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Data sources:/)).not.toBeInTheDocument();
  });

  it('shows the real status label, not a hardcoded one', () => {
    render(
      <HeadlinesTab
        headlines={[headline({ status: 'closed', status_display: 'Closed' })]}
        isLoading={false}
        error={null}
      />
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('collapses and reopens a card', async () => {
    const user = userEvent.setup();
    render(<HeadlinesTab headlines={[headline()]} isLoading={false} error={null} />);

    await user.click(screen.getByRole('button', { name: /Hide details/ }));
    expect(
      screen.queryByText('Comprehensive renewal process showing exceptional account health.')
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show details/ }));
    expect(
      screen.getByText('Comprehensive renewal process showing exceptional account health.')
    ).toBeInTheDocument();
  });

  it('orders groups newest-first', () => {
    const older = headline({ id: 3, period_end: '2025-06-30', group: 'June 2025' });
    render(<HeadlinesTab headlines={[older, headline()]} isLoading={false} error={null} />);

    const pills = screen.getAllByText(/^(January 2026|June 2025)$/);
    expect(pills.map((el) => el.textContent)).toEqual(['January 2026', 'June 2025']);
  });

  it('still renders a card with no period to group under', () => {
    render(
      <HeadlinesTab
        headlines={[headline({ group: '', period_start: null, period_end: null })]}
        isLoading={false}
        error={null}
      />
    );
    expect(
      screen.getByText('Apple EMEA Retail Operations Renewal and Expansion')
    ).toBeInTheDocument();
  });

  describe('the Regenerate button', () => {
    it('is not offered when there is no entity to generate against', () => {
      // ActivityFeed omits the callback in the same case its fetch
      // falls back to clearing — a direct URL visit with no resolvable
      // parent Customer. Offering a button that can only 404 is worse
      // than not offering one.
      render(<HeadlinesTab headlines={[headline()]} isLoading={false} error={null} />);
      expect(screen.queryByRole('button', { name: /Regenerate/ })).not.toBeInTheDocument();
    });

    it('regenerates without a confirm when there is nothing generated to lose', async () => {
      const onRegenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      // generated_at null throughout — hand-written or seeded cards,
      // which the backend never replaces.
      render(
        <HeadlinesTab
          headlines={[headline()]}
          isLoading={false}
          error={null}
          onRegenerate={onRegenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /Regenerate/ }));

      expect(onRegenerate).toHaveBeenCalled();
      expect(screen.queryByText('Regenerate headlines?')).not.toBeInTheDocument();
    });

    it('confirms first when it would discard cards the model wrote', async () => {
      const onRegenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <HeadlinesTab
          headlines={[headline({ generated_at: '2026-01-21T00:00:00Z' })]}
          isLoading={false}
          error={null}
          onRegenerate={onRegenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /Regenerate/ }));

      expect(screen.getByText('Regenerate headlines?')).toBeInTheDocument();
      expect(onRegenerate).not.toHaveBeenCalled();

      // Scoped to the dialog: the header button carries the same
      // label, so an unscoped query matches both.
      const dialog = screen.getByText('Regenerate headlines?').closest('.max-w-sm') as HTMLElement;
      await user.click(within(dialog).getByRole('button', { name: 'Regenerate' }));
      expect(onRegenerate).toHaveBeenCalled();
    });

    it('shows progress and blocks a second click while running', () => {
      const onRegenerate = vi.fn().mockResolvedValue(undefined);
      render(
        <HeadlinesTab
          headlines={[headline()]}
          isLoading={false}
          error={null}
          onRegenerate={onRegenerate}
          isRegenerating
        />
      );

      expect(screen.getByRole('button', { name: /Regenerating…/ })).toBeDisabled();
    });

    it('shows a failed regenerate above the cards, never instead of them', () => {
      // The backend does the delete and insert in one transaction, so
      // the cards on screen are still correct after a failure — showing
      // the error in their place (the way a failed *list* load does)
      // would throw away something perfectly readable.
      render(
        <HeadlinesTab
          headlines={[headline()]}
          isLoading={false}
          error={null}
          onRegenerate={vi.fn()}
          regenerateError="Apple EMEA has no notes, emails, tickets or activities in the last 90 days — nothing to summarise yet."
        />
      );

      expect(screen.getByText(/nothing to summarise yet/)).toBeInTheDocument();
      expect(
        screen.getByText('Apple EMEA Retail Operations Renewal and Expansion')
      ).toBeInTheDocument();
    });

    it('offers the button from the empty state, where it is most useful', async () => {
      const onRegenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <HeadlinesTab
          headlines={[]}
          isLoading={false}
          error={null}
          onRegenerate={onRegenerate}
        />
      );

      expect(screen.getByText('No headlines yet')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Regenerate/ }));
      expect(onRegenerate).toHaveBeenCalled();
    });

    it('surfaces a failure from the empty state too', () => {
      render(
        <HeadlinesTab
          headlines={[]}
          isLoading={false}
          error={null}
          onRegenerate={vi.fn()}
          regenerateError="Copilot isn't configured yet — set ANTHROPIC_API_KEY in your .env."
        />
      );
      expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
    });
  });
});
