import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NO_FILTERS, type ContactsParams } from '../../features/contacts/contactsParams';
import { setViewport } from '../../test/viewport';
import { CUSTOMERS, stubContactsApi } from '../../features/contacts/testContacts';
import { ContactsToolbar } from './ContactsToolbar';

function renderToolbar(params: ContactsParams = NO_FILTERS, extra: Partial<Parameters<typeof ContactsToolbar>[0]> = {}) {
  const handlers = { onChange: vi.fn(), onAdd: vi.fn() };
  const view = render(
    <ContactsToolbar params={params} count="142 people" organisations={CUSTOMERS} organisationName={null} {...handlers} {...extra} />,
  );
  return { ...handlers, view };
}

describe('ContactsToolbar (spec 2026-09-28 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('an organisation filters and clears the account; the account waits for an organisation', async () => {
    stubContactsApi();
    const { onChange } = renderToolbar({ ...NO_FILTERS, sentiment: 'negative' });
    expect(screen.getByLabelText('Account')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Organisation'), 'Kraft Heinz');
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, sentiment: 'negative', customer: '6' });
  });

  it("offers the chosen organisation's accounts", async () => {
    stubContactsApi();
    const { onChange } = renderToolbar({ ...NO_FILTERS, customer: '6' });
    const account = screen.getByLabelText('Account');
    expect(account).toBeEnabled();
    await within(account).findByRole('option', { name: 'Kraft Heinz EMEA' });
    await userEvent.selectOptions(account, 'Kraft Heinz EMEA');
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, customer: '6', account: '31' });
  });

  it('keeps a chosen organisation that is not on the first page', () => {
    stubContactsApi();
    renderToolbar({ ...NO_FILTERS, customer: '99' }, { organisationName: 'Globex' });
    expect(screen.getByLabelText('Organisation')).toHaveDisplayValue('Globex');
  });

  it('names a deep-linked organisation that is not on the first page by reading it, never "Organisation 99"', async () => {
    const spy = stubContactsApi({ moreCustomers: [{ id: 99, name: 'Globex' }] });
    renderToolbar({ ...NO_FILTERS, customer: '99' });
    await waitFor(() => expect(screen.getByLabelText('Organisation')).toHaveDisplayValue('Globex'));
    expect(spy.mock.calls.map(([input]) => new URL(String(input)).pathname)).toContain('/api/v1/customers/99/');
    expect(screen.queryByText('Organisation 99')).toBeNull();
  });

  it('an organisation or account that cannot be found says so', async () => {
    stubContactsApi();
    renderToolbar({ ...NO_FILTERS, customer: '98', account: '97' });
    await waitFor(() => expect(screen.getByLabelText('Organisation')).toHaveDisplayValue('Organisation not found'));
    await waitFor(() => expect(screen.getByLabelText('Account')).toHaveDisplayValue('Account not found'));
    expect(screen.queryByText(/^(Organisation|Account) 9\d$/)).toBeNull();
  });

  it('a deep-linked account takes its name from the account list', async () => {
    const spy = stubContactsApi();
    renderToolbar({ ...NO_FILTERS, customer: '6', account: '32' });
    await waitFor(() => expect(screen.getByLabelText('Account')).toHaveDisplayValue('Kraft Heinz NA'));
    // The organisation is on the first page: it is not read again.
    expect(spy.mock.calls.map(([input]) => new URL(String(input)).pathname)).not.toContain('/api/v1/customers/6/');
  });

  it('filters by sentiment and role', async () => {
    stubContactsApi();
    const { onChange } = renderToolbar();
    await userEvent.selectOptions(screen.getByLabelText('Sentiment'), 'Negative');
    expect(onChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, sentiment: 'negative' });
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Champion');
    expect(onChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, role: 'champion' });
  });

  it('searches once typing stops, replacing the history entry', async () => {
    stubContactsApi();
    const { onChange } = renderToolbar();
    await userEvent.type(screen.getByLabelText('Search people'), 'luk');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, q: 'luk' }, true));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('the search box follows the URL', () => {
    stubContactsApi();
    const { view, onChange, onAdd } = renderToolbar({ ...NO_FILTERS, q: 'luk' });
    view.rerender(
      <ContactsToolbar params={NO_FILTERS} count="142 people" organisations={CUSTOMERS} organisationName={null} onChange={onChange} onAdd={onAdd} />,
    );
    expect(screen.getByLabelText('Search people')).toHaveValue('');
  });

  it('is the one toolbar: search and count first, the four filters, Save as segment, then Add person', async () => {
    stubContactsApi();
    setViewport(1440);
    const { onAdd } = renderToolbar(NO_FILTERS, { count: '16 people', onSaveAsSegment: vi.fn() });
    expect(screen.getByRole('status')).toHaveTextContent('16 people');
    for (const name of ['Organisation', 'Account', 'Sentiment', 'Role']) expect(screen.getByRole('combobox', { name })).toHaveClass('min-h-11');
    const buttons = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    expect(buttons.slice(-2)).toEqual(['Save as segment', 'Add person']);
    expect(document.querySelector('.uppercase')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
