import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderContactsPage } from '../testPage';
import { stubContactsAsk } from './testContactsAsk';

const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

const ON_LUKAS = {
  id: 9,
  title: 'How is Lukas?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' },
  messages: [
    { id: 1, role: 'user', content: 'How is Lukas?', context: { surface: 'contacts', view: 'person', contact: 41, focus: null, label: 'Lukas Vermeer · Kraft Heinz' }, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: 'Lukas is steady.', sources: [], questions: [], created_at: '' },
  ],
};

describe('History on Contacts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("tags a Contacts conversation with the server's label and reopens it on its person", async () => {
    stubContactsAsk({ copilot: { conversations: [ON_LUKAS], conversationById: { 9: ON_LUKAS } } });
    renderContactsPage('/contacts?sentiment=negative', { ask: true });
    await screen.findByText('Owen Price');
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /How is Lukas\?/ });
    expect(within(item).getByText('Lukas Vermeer · Kraft Heinz')).toBeInTheDocument();
    await userEvent.click(item);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/contacts/41'));
    expect(await within(log()).findByText('Lukas is steady.')).toBeInTheDocument();
  });

  it('reopens a list conversation with its filters', async () => {
    const onList = { ...ON_LUKAS, id: 10, title: 'Who is unhappy?', origin: { surface: 'contacts', view: 'list', filters: { sentiment: 'negative' }, label: 'Contacts · Negative' } };
    stubContactsAsk({ copilot: { conversations: [onList], conversationById: { 10: onList } } });
    renderContactsPage('/contacts/41', { ask: true });
    await screen.findByRole('heading', { name: 'Lukas Vermeer' });
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: /Who is unhappy\?/ }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/contacts?sentiment=negative'));
    expect(await within(log()).findByText('Lukas is steady.')).toBeInTheDocument();
  });
});
