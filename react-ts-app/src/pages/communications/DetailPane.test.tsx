import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CommunicationRow } from '../../features/communications/communicationsSlice';
import { DetailPane } from './DetailPane';

// UI broken-things fix 9: the API sends tickets with preview "" and action
// "none", and the pane rendered that empty preview as a blank body.

function ticket(over: Partial<CommunicationRow> = {}): CommunicationRow {
  return {
    id: 'ticket:257',
    kind: 'ticket',
    who: 'TKT-9221',
    detail: 'Medium',
    subject: 'Webhook deliveries arriving out of order',
    snippet: 'Open since 2026-01-09.',
    preview: '',
    sentiment: 'neutral',
    waiting_since: '2026-01-09',
    waiting_days: 273,
    account: null,
    context: null,
    action: 'none',
    external_url: '',
    draft: null,
    ...over,
  };
}

function renderPane(row: CommunicationRow) {
  render(
    <MemoryRouter>
      <DetailPane row={row} />
    </MemoryRouter>,
  );
  return screen.getByRole('region', { name: 'Selected item' });
}

describe('DetailPane with no body', () => {
  it('says so in a sentence under the subject, with what the row does know', () => {
    const pane = renderPane(ticket());
    expect(within(pane).getByRole('heading', { name: 'Webhook deliveries arriving out of order' })).toBeInTheDocument();
    const body = within(pane).getByTestId('no-body');
    expect(body).toHaveTextContent('No description was synced for this ticket, only its subject.');
    expect(body).toHaveTextContent('Open since 2026-01-09.');
    expect(within(pane).queryByRole('link', { name: /open in/i })).toBeNull();
  });

  it('links to the record in its source system, named by host, when the payload carries a URL', () => {
    const pane = renderPane(ticket({ external_url: 'https://www.acme.zendesk.com/agent/tickets/9221' }));
    const link = within(pane).getByRole('link', { name: 'Open in acme.zendesk.com' });
    expect(link).toHaveAttribute('href', 'https://www.acme.zendesk.com/agent/tickets/9221');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveClass('min-h-11', 'sm:min-h-9');
  });

  it('leaves the link to the footer when the row already offers it there', () => {
    const pane = renderPane(ticket({ action: 'open_external', external_url: 'https://acme.zendesk.com/t/1' }));
    expect(within(pane).getAllByRole('link', { name: /open in/i }).map((a) => a.textContent)).toEqual(['Open in the source system']);
  });

  it('treats a whitespace-only preview as no body, and words other kinds for what they are', () => {
    const pane = renderPane(ticket({ kind: 'call', id: 'call:3', who: 'Ann Lee', detail: '12 min', preview: '   ', snippet: '' }));
    expect(within(pane).getByTestId('no-body')).toHaveTextContent('No transcript or notes were synced for this call.');
  });

  it('renders a real body as before, without the fallback', () => {
    const pane = renderPane(ticket({ kind: 'question', id: 'question:1', preview: 'Can we move the QBR?' }));
    expect(within(pane).getByText('Can we move the QBR?')).toBeInTheDocument();
    expect(within(pane).queryByTestId('no-body')).toBeNull();
  });

describe('DetailPane flat', () => {
  it('is flat inside the shell at every width, the waiting time a neutral badge, health in its band colour', () => {
    const base = ticket({ kind: 'email', id: 'email:1', action: 'reply', preview: 'Hello', account: { id: 3, name: 'Pizza Hut', type: 'customer' } as CommunicationRow['account'] });
    const row = { ...base, waiting_days: 12, context: { health_category: 'poor', health_score: 3.1, days_to_renewal: null, arr: 1000, owner: 'Sam' } } as unknown as CommunicationRow;
    const pane = renderPane(row);
    expect(pane.className).not.toMatch(/rv-glass-inner|rounded-xl|(^|\s)hidden(\s|$)/);
    expect(screen.getByText(/^Waiting/).closest('span.rounded-full')).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(screen.getByText('3.1')).toHaveClass('text-danger-ink', 'tabular-nums');
    expect(screen.getByText('Renews in').nextElementSibling).toHaveTextContent('\u2014');
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('text-[15px]');
  });
});
});
