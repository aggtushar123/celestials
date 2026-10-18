import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import mailReducer from '../../features/mail/mailSlice';
import { GOOGLE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { MailboxSignature } from './MailboxSignature';

// Integration tier: the real mail slice; only fetch is stubbed (stubMail),
// shaped like the round 2 D1 contract §4.3.

afterEach(() => vi.unstubAllGlobals());

function renderSignature(connection = OUTLOOK) {
  stubMail({ connection });
  const store = configureStore({ reducer: { mail: mailReducer } });
  render(
    <Provider store={store}>
      <MailboxSignature connection={connection} />
    </Provider>,
  );
  return store;
}

describe('MailboxSignature (round 2 D1 Decisions 4, 5)', () => {
  it('lets an Outlook owner write and save their signature', async () => {
    const store = renderSignature();
    const box = screen.getByRole('textbox', { name: 'Signature' });
    expect(screen.getByText('Added under every email you send from Revenact. Up to 10 lines.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(box, 'Carl CSM{Enter}Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Signature saved.');
    expect(store.getState().mail.connection?.signature?.text).toBe('Carl CSM\nAcme');
  });

  it('shows the server sentence on a refusal', async () => {
    renderSignature();
    await userEvent.type(screen.getByRole('textbox', { name: 'Signature' }), Array.from({ length: 11 }, () => 'x').join('{Enter}'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep the signature to 10 lines.');
  });

  it('clears the refusal when the person edits the box', async () => {
    renderSignature();
    const box = screen.getByRole('textbox', { name: 'Signature' });
    await userEvent.type(box, Array.from({ length: 11 }, () => 'x').join('{Enter}'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.type(box, 'y');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('saves a cleared signature as empty', async () => {
    const store = renderSignature({ ...OUTLOOK, signature: { text: 'Carl CSM', editable: true, source: 'revenact' } });
    await userEvent.clear(screen.getByRole('textbox', { name: 'Signature' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Signature saved.');
    expect(store.getState().mail.connection?.signature?.text).toBe('');
  });

  it("shows Gmail's signature read only", () => {
    renderSignature(GOOGLE);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/Dana Ruiz/)).toBeInTheDocument();
    expect(screen.getByText('Change it in Gmail.')).toBeInTheDocument();
  });

  it('shows nothing for IMAP', () => {
    const { container } = render(
      <Provider store={configureStore({ reducer: { mail: mailReducer } })}>
        <MailboxSignature connection={{ ...OUTLOOK, provider: 'imap', signature: null }} />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
