import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import customersReducer from '../../features/customers/customersSlice';
import { CUSTOMERS, stubContactsApi } from '../../features/contacts/testContacts';
import { ContactFormModal } from './ContactFormModal';

describe('ContactFormModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a create sends the chosen sentiment (a new person has no evidence to keep)', async () => {
    const spy = stubContactsApi();
    const store = configureStore({ reducer: { customers: customersReducer } });
    render(
      <Provider store={store}>
        <ContactFormModal companies={CUSTOMERS} onClose={vi.fn()} onSaved={vi.fn()} />
      </Provider>,
    );
    await userEvent.selectOptions(screen.getByLabelText(/^Company/), 'Pizza Hut');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Ana Ruiz');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ana@pizzahut.example');
    await userEvent.selectOptions(screen.getByLabelText(/^Sentiment \(/), 'Positive');
    await userEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    await waitFor(() => expect(spy.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const [input, init] = spy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')!;
    expect(new URL(String(input)).pathname).toBe('/api/v1/customers/7/contacts/');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ name: 'Ana Ruiz', sentiment: 'positive' });
  });
});
