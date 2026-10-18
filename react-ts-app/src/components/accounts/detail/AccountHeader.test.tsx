import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountHeader } from './AccountHeader';

function renderHeader({ row = pizzaEmea as AccountPortfolioRow, canEdit = true, editError = null as string | null } = {}) {
  const handlers = { onEdit: vi.fn(), onAddContact: vi.fn(), onLogCall: vi.fn(), onNewTask: vi.fn(), onRetryEdit: vi.fn() };
  render(
    <MemoryRouter>
      <AccountHeader row={row} canEdit={canEdit} editError={editError} {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

describe('AccountHeader (spec 2026-09-29 §2.2)', () => {
  it('shows initials, the name, owner · lifecycle · last touch and the signal', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(screen.getByText('PE')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Carl CSM').closest('p')).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
  });

  it('links each organisation the viewer may open, with this account chosen', () => {
    renderHeader();
    const partOf = document.querySelector('[data-part="part-of"]') as HTMLElement;
    expect(within(partOf).getByText('Part of')).toBeInTheDocument();
    expect(within(partOf).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Pizza Hut', '/organizations/7?account=12'],
      ['Yum Brands', '/organizations/9?account=12'],
    ]);
  });

  it('names no organisation when the viewer may open none, and says Unassigned, the stage and Never contacted', () => {
    renderHeader({ row: initechApac });
    expect(document.querySelector('[data-part="part-of"]')).toBeNull();
    expect(screen.getByText('Unassigned').closest('p')).toHaveTextContent('Unassigned · Churn · Never contacted');
  });

  it('holds Edit while the record failed, says why, and Try again retries', async () => {
    const { onEdit, onRetryEdit } = renderHeader({ canEdit: false, editError: 'Try later.' });
    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription('Edit is unavailable: Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryEdit).toHaveBeenCalledOnce();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('Edit opens the form, and ⋯ holds Add contact, Log a call and New task', async () => {
    const { onAddContact, onLogCall, onNewTask, onEdit } = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    const more = screen.getByRole('button', { name: 'More actions for Pizza EMEA' });
    await userEvent.click(more);
    const menu = screen.getByRole('menu', { name: 'More actions for Pizza EMEA' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Add contact', 'Log a call', 'New task']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Add contact' }));
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log a call' }));
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    expect([onAddContact, onLogCall, onNewTask].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });
});
