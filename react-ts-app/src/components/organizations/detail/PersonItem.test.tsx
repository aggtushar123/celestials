import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CONTACTS } from '../../../features/organizations/testStory';
import { PersonItem } from './PersonItem';

function renderItem(index: number, extra = {}) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <MemoryRouter>
      <ul>
        <PersonItem contact={{ ...CONTACTS[index], ...extra }} {...handlers} />
      </ul>
    </MemoryRouter>,
  );
  return handlers;
}

describe('PersonItem (spec 2026-09-27 §2)', () => {
  it('shows initials, name, one meta line of role, status and last contact, the account and sentiment', () => {
    renderItem(0);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('DB')).not.toHaveClass('font-mono-brand');
    expect(within(item).getByRole('link', { name: 'Dana Buyer' })).toBeInTheDocument();
    expect(within(item).getByText(/^Decision Maker · Active · Contacted .+ ago$/)).toBeInTheDocument();
    for (const text of ['EMEA', 'Positive sentiment']) expect(within(item).getByText(text)).toBeInTheDocument();
  });

  it('reaches them from the row actions: the address and number are in the title, not the text', () => {
    renderItem(0);
    const email = screen.getByRole('link', { name: 'Email Dana Buyer' });
    expect(email).toHaveAttribute('href', 'mailto:dana@emea.northwind.example');
    expect(email).toHaveAttribute('title', 'dana@emea.northwind.example');
    expect(screen.getByRole('link', { name: 'Call Dana Buyer' })).toHaveAttribute('href', 'tel:+442079460000');
    expect(email.parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
  });

  it('keeps the account on a phone row by moving it into the meta line', () => {
    renderItem(0);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('· EMEA')).toHaveClass('sm:hidden');
    // Role first, the account after it.
    expect(within(row).getByText('· EMEA').parentElement!.textContent).toMatch(/^Decision Maker · Active · Contacted .+ ago · EMEA$/);
    expect(within(row).getByText('EMEA').parentElement!.parentElement).toHaveClass('max-sm:hidden');
  });

  it('the name opens their profile on the Contacts page (spec 2026-09-28 §5)', () => {
    renderItem(0);
    expect(screen.getByRole('link', { name: 'Dana Buyer' })).toHaveAttribute('href', '/contacts/51');
  });

  it('is a list row: sentiment the one semantic badge, no mono on words', () => {
    renderItem(0);
    const name = screen.getByRole('link', { name: 'Dana Buyer' });
    const row = name.closest('li')!;
    expect(row).toHaveAttribute('data-person', String(CONTACTS[0].id));
    expect(within(row).getByText(/sentiment$/)).toHaveClass('rounded-full');
    expect(within(row).getByRole('button', { name: 'Actions for Dana Buyer' })).toBeInTheDocument();
    expect(row.querySelector('.font-mono-brand')).toBeNull();
  });

  it('gives a person on the organization itself no account tag (spec §7), and says when nobody has been in touch', () => {
    renderItem(2);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Negative sentiment')).toBeInTheDocument();
    expect(within(item).queryByText(/Organization/)).toBeNull();
    expect(within(item).getByText(/Inactive · Not contacted yet$/)).toBeInTheDocument();
    // No email or phone to link: the only link is their name.
    expect(within(item).getAllByRole('link').map((link) => link.textContent)).toEqual(['Pat Finance']);
  });

  it('gives an address that could carry its own mailto query no link', () => {
    renderItem(0, { email: 'dana?cc=x@emea.northwind.example' });
    expect(screen.queryByRole('link', { name: 'Email Dana Buyer' })).not.toBeInTheDocument();
  });

  it('edits and deletes through ⋯', async () => {
    const { onEdit, onDelete } = renderItem(0);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Dana Buyer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Dana Buyer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
