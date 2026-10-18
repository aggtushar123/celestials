import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { ChannelCustomerForm } from './ChannelCustomerForm';

function stubSearch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (String(url).includes('/customers/') ? { results: [{ id: 29, name: 'Globex (QA)' }] } : { results: [] }) })));
}

function renderForm(props: Partial<Parameters<typeof ChannelCustomerForm>[0]> = {}) {
  const onSave = props.onSave ?? vi.fn(async () => null);
  const onDone = props.onDone ?? vi.fn();
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <ChannelCustomerForm subject="#globex-escalations" current={props.current ?? null} onSave={onSave} onDone={onDone} />
    </Provider>,
  );
  return { onSave, onDone };
}

describe('ChannelCustomerForm (Slack escalations D1 Decision 5, D3 per channel)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sets one customer', async () => {
    stubSearch();
    const user = userEvent.setup();
    const { onSave, onDone } = renderForm();
    expect(screen.getByRole('form', { name: 'Choose the customer of #globex-escalations' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Any customer the message names' })).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await user.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await user.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ kind: 'organization', id: 29, name: 'Globex (QA)' });
    expect(onDone).toHaveBeenCalled();
  });

  it('goes back to any customer the message names', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm({ current: { kind: 'organization', id: 29, name: 'Globex (QA)' } });
    expect(screen.getByRole('radio', { name: 'Always this customer:' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Any customer the message names' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('asks for a record before saving one, and shows a refusal', async () => {
    stubSearch();
    const user = userEvent.setup();
    const onSave = vi.fn(async () => "Globex (QA) isn't covered by this Slack connection.");
    const { onDone } = renderForm({ onSave });
    await user.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a customer or account first.');
    await user.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await user.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Globex (QA) isn't covered by this Slack connection.");
    expect(onDone).not.toHaveBeenCalled();
  });
});
