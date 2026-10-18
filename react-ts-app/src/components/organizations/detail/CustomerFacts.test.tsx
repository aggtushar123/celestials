import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer } from '../../../features/customers/customersSlice';
import { pizzaHutCustomer } from '../../../features/organizations/testStory';
import { CustomerFacts } from './CustomerFacts';

const band = (key: string, label: string, count: number, share: number) => ({ key, label, count, share });

const FULL = {
  ...pizzaHutCustomer,
  email: 'ap@northwind.example',
  phone: '+1 972 555 0100',
  industry: 'Restaurants',
  csat_breakdown: {
    responses: 8,
    bands: [
      band('very_satisfied', 'Very Satisfied', 3, 37.5),
      band('satisfied', 'Satisfied', 3, 37.5),
      band('neutral', 'Neutral', 2, 25),
      band('dissatisfied', 'Dissatisfied', 0, 0),
      band('very_dissatisfied', 'Very Dissatisfied', 0, 0),
    ],
  },
} as Customer;

function renderFacts(props: Partial<ComponentProps<typeof CustomerFacts>> = {}) {
  const onRetry = vi.fn();
  render(<CustomerFacts customer={FULL} error={null} stacked={false} onRetry={onRetry} {...props} />);
  return onRetry;
}

const value = (term: string) => screen.getByText(term).nextElementSibling as HTMLElement;

describe('CustomerFacts (spec §2: what GET /customers/{id}/ adds)', () => {
  it('shows the email and phone as links, and the industry', () => {
    renderFacts();
    const section = screen.getByRole('region', { name: 'Contact and CSAT' });
    expect(within(section).getByRole('link', { name: 'ap@northwind.example' })).toHaveAttribute('href', 'mailto:ap@northwind.example');
    expect(within(section).getByRole('link', { name: '+1 972 555 0100' })).toHaveAttribute('href', 'tel:+19725550100');
    expect(value('Industry')).toHaveTextContent('Restaurants');
  });

  // A "?", "&" or "#" would start the mailto URL's own query or fragment
  // (bcc=, body=): such a value is shown as text, never linked.
  it.each(['a?bcc=x@y.example', 'ap@y.example&cc=x@z.example', 'ap@y.example#x'])('shows %s as text with no mailto link', (email) => {
    renderFacts({ customer: { ...FULL, email } });
    const section = screen.getByRole('region', { name: 'Contact and CSAT' });
    expect(within(section).queryByRole('link', { name: email })).not.toBeInTheDocument();
    expect(value('Email')).toHaveTextContent(email);
  });

  it("still encodes the local part of a plain address's mailto link", () => {
    renderFacts({ customer: { ...FULL, email: 'a b+ap@y.example' } });
    const link = within(screen.getByRole('region', { name: 'Contact and CSAT' })).getByRole('link', { name: 'a b+ap@y.example' });
    expect(link).toHaveAttribute('href', 'mailto:a%20b%2Bap@y.example');
  });

  it('shows a blank field as "—" with no link', () => {
    renderFacts({ customer: pizzaHutCustomer });
    for (const term of ['Email', 'Phone', 'Industry']) expect(value(term)).toHaveTextContent('—');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('spreads the CSAT responses across their bands at their true share', () => {
    renderFacts();
    expect(screen.getByText('CSAT responses').closest('p')).toHaveTextContent('8 CSAT responses');
    const rows = within(screen.getByRole('list', { name: 'CSAT responses by band' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Very Satisfied3 · 37.5%',
      'Satisfied3 · 37.5%',
      'Neutral2 · 25%',
      'Dissatisfied0 · 0%',
      'Very Dissatisfied0 · 0%',
    ]);
    expect(rows[2].querySelector('[data-share]')).toHaveStyle({ width: '25%' });
  });

  it('says when no CSAT survey has been answered', () => {
    renderFacts({ customer: pizzaHutCustomer });
    expect(screen.getByText('No CSAT survey has been answered yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'CSAT responses by band' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while the record loads', () => {
    renderFacts({ customer: null });
    expect(screen.getByRole('status')).toHaveTextContent('Loading contact details and CSAT');
  });

  it('shows the read error with Try again', async () => {
    const onRetry = renderFacts({ customer: null, error: 'Try later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('puts the two halves side by side from md unless stacked', () => {
    renderFacts({ stacked: true });
    expect(screen.getByText('Email').closest('[data-facts]')).not.toHaveClass('md:grid-cols-2');
  });

  it('titles its section in sentence case and sets the CSAT figures in the body font', () => {
    renderFacts();
    expect(screen.getByRole('heading', { level: 3 }).className).not.toMatch(/uppercase/);
    expect(document.querySelector('[data-count]')).toHaveClass('tabular-nums');
    expect(document.querySelector('.font-mono-brand')).toBeNull();
  });
});
