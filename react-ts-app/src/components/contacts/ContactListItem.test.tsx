import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Contact } from '../../features/customers/customersSlice';
import { LUKAS, MIRA, OWEN } from '../../features/contacts/testContacts';
import { ContactListItem } from './ContactListItem';

function renderItem(contact: Contact, selected = false) {
  render(
    <MemoryRouter>
      <ul>
        <ContactListItem contact={contact} to={`/contacts/${contact.id}?role=champion`} selected={selected} />
      </ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

describe('ContactListItem (spec 2026-09-28 §3)', () => {
  it('shows initials, name, then one meta line of role, place, calls and last contact', () => {
    const item = renderItem(LUKAS);
    expect(within(item).getByText('LV')).not.toHaveClass('font-mono-brand');
    expect(within(item).getByRole('link', { name: 'Lukas Vermeer' })).toBeInTheDocument();
    const meta = item.querySelector('p')!;
    expect(meta).toHaveTextContent(/^Champion · Kraft Heinz › Kraft Heinz EMEA · 6 calls · Contacted .+ ago$/);
    expect(within(item).getByText('Neutral')).toBeInTheDocument();
  });

  it('says when someone is inactive, and says nothing for an active person', () => {
    expect(renderItem(OWEN).querySelector('p')).toHaveTextContent('Inactive');
    document.body.innerHTML = '';
    expect(renderItem(LUKAS).querySelector('p')).not.toHaveTextContent(/Active|Inactive/);
  });

  it('names the organisation alone when they are on it, says where a hand-set sentiment came from, and when nobody has been in touch', () => {
    const mira = renderItem(MIRA);
    const meta = mira.querySelector('p')!;
    expect(meta).toHaveTextContent('Pizza Hut');
    expect(meta).toHaveTextContent('set by hand');
    expect(meta).toHaveTextContent('Not contacted yet');
    expect(within(mira).getByText('Positive')).toBeInTheDocument();
    document.body.innerHTML = '';
    expect(within(renderItem(OWEN)).getByText('Negative')).toBeInTheDocument();
  });

  it('falls back to the old sentiment_evidence shape for the calls count, and never throws with neither', () => {
    const old = { ...LUKAS, calls: undefined, sentiment_evidence: { score: 0.1, calls: 4, emails: 2, tickets: 0, positive: 2, neutral: 1, negative: 1, latest_at: null } };
    expect(renderItem(old).querySelector('p')).toHaveTextContent('4 calls');
    document.body.innerHTML = '';
    const bare = { ...LUKAS, calls: undefined, sentiment_evidence: undefined };
    expect(() => renderItem(bare)).not.toThrow();
    expect(screen.getByRole('listitem').querySelector('p')).toHaveTextContent('no calls');
  });

  it('opens their profile, keeping the filters, and marks the one open', () => {
    const item = renderItem(LUKAS, true);
    const link = within(item).getByRole('link');
    expect(link).toHaveAttribute('href', '/contacts/41?role=champion');
    expect(link).toHaveAttribute('aria-current', 'true');
    expect(item).toHaveClass('bg-subtle');
    document.body.innerHTML = '';
    expect(within(renderItem(LUKAS)).getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('puts actions beside the link without making them part of it', () => {
    render(
      <MemoryRouter>
        <ul>
          <ContactListItem contact={LUKAS} to="/contacts/41" selected={false} actions={<button type="button">Actions for Lukas Vermeer</button>} />
        </ul>
      </MemoryRouter>,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByRole('button', { name: 'Actions for Lukas Vermeer' }).closest('a')).toBeNull();
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/contacts/41');
  });

  it('is a list row: the name opens the profile, one meta line in the body font, sentiment the one badge', () => {
    const row = renderItem({ ...LUKAS, calls: 0 });
    expect(row).toHaveAttribute('data-contact', String(LUKAS.id));
    expect(row.querySelector('.font-mono-brand')).toBeNull();
    expect(row.querySelectorAll('.rounded-full.px-2')).toHaveLength(1); // the sentiment badge only
  });
});
