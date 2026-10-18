import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageSources } from './MessageSources';
import type { MessageSource } from './types';

function source(overrides: Partial<MessageSource> = {}): MessageSource {
  return {
    type: 'note',
    id: 4,
    label: 'Commercial Negotiation Summary',
    date: '2026-03-15',
    company: 'Apple EMEA',
    company_type: 'account',
    company_id: 2,
    ...overrides,
  };
}

function renderSources(sources: MessageSource[]) {
  render(
    <MemoryRouter>
      <MessageSources sources={sources} />
    </MemoryRouter>
  );
}

describe('MessageSources', () => {
  it('renders nothing when an answer had nothing specific to quote', () => {
    // A question about the whole book isn't grounded in any one record,
    // and an empty "Based on 0 records" heading would be noise.
    const { container } = render(
      <MemoryRouter>
        <MessageSources sources={[]} />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('names the record, its company and its date', () => {
    renderSources([source()]);

    expect(screen.getByText('Commercial Negotiation Summary')).toBeInTheDocument();
    expect(screen.getByText(/Apple EMEA · 15 Mar/)).toBeInTheDocument();
  });

  it('counts what the answer was based on', () => {
    renderSources([source(), source({ id: 5, type: 'email', label: 'Renewal Prep' })]);

    expect(screen.getByText('Based on 2 records')).toBeInTheDocument();
  });

  it('says "record" rather than "records" for a single citation', () => {
    renderSources([source()]);
    expect(screen.getByText('Based on 1 record')).toBeInTheDocument();
  });

  it('links an account-level record to the account page', () => {
    renderSources([source({ company_type: 'account', company_id: 2 })]);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/accounts/2');
  });

  it('links a customer-level record to the organization page', () => {
    renderSources([source({ company_type: 'customer', company_id: 7, company: 'Pizza Hut' })]);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/organizations/7');
  });

  it('keeps every citation distinct when two types share an id', () => {
    // Ids are only unique within a type — a note 4 and a ticket 4 are
    // different records and must not collide as React keys.
    renderSources([
      source({ type: 'note', id: 4, label: 'A note' }),
      source({ type: 'ticket', id: 4, label: 'A ticket' }),
    ]);

    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.getByText('A ticket')).toBeInTheDocument();
  });

  it('still renders a citation whose date is unparseable', () => {
    // Sources are snapshots written by the backend; a malformed one
    // shouldn't take the whole answer's citation list down.
    renderSources([source({ date: 'unknown' })]);

    expect(screen.getByText(/unknown/)).toBeInTheDocument();
  });
});
