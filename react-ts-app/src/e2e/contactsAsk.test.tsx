import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubContactsAsk } from '../pages/contacts/ask/testContactsAsk';
import { renderContactsPage } from '../pages/contacts/testPage';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Contacts page under
// ContactsAskLayout, the real rail and pill, store and router. Only fetch is
// stubbed: the Contacts endpoints and the Copilot's (stubContactsAsk).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const pill = () => within(screen.getByTestId('nav-actions'));
const where = () => screen.getByTestId('where').textContent;

// A conversation already on Lukas's sentiment, as the server would return it
// for the question this journey asks in step 5 (backend #72: origin is the
// context without its focus, labelled by the server).
const ON_LUKAS_SENTIMENT = {
  id: 12,
  title: "Why is Lukas's sentiment neutral?",
  created_at: '',
  updated_at: '',
  origin: { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' },
};

describe('Ask Revenact on Contacts, end to end (spec 2026-09-28)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks about the negative list, opens Lukas, asks why his sentiment reads that way, and finds it in History', { timeout: 30000 }, async () => {
    const { copilot } = stubContactsAsk({ copilot: { conversations: [ON_LUKAS_SENTIMENT] } });
    renderContactsPage('/contacts', { width: 1440, ask: true });
    await screen.findByText('Lukas Vermeer');

    // 1-2. Choose Sentiment "Negative": the URL and the chip follow.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sentiment' }), 'negative');
    await waitFor(() => expect(screen.queryByText('Lukas Vermeer')).not.toBeInTheDocument());
    expect(screen.getByText('Owen Price')).toBeInTheDocument();
    expect(where()).toBe('/contacts?sentiment=negative');
    expect(await within(rail()).findByText('Contacts · Negative')).toBeInTheDocument();

    // 3. Ask about the filtered list: the posted context carries the filter alone.
    await userEvent.type(composer(), 'Who is unhappy?{Enter}');
    await screen.findByText('Answer to: Who is unhappy?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'contacts', view: 'list', filters: { sentiment: 'negative' } });

    // 4. Clear the filter and open Lukas: the chip moves to him.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sentiment' }), '');
    await userEvent.click(await screen.findByRole('link', { name: /Lukas Vermeer/ }));
    expect(where()).toBe('/contacts/41');
    await screen.findByRole('heading', { name: 'Lukas Vermeer' });
    expect(await within(rail()).findByText('Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA')).toBeInTheDocument();

    // 5. "Why this sentiment?" types the question in and names the focus,
    //    sending nothing until asked; sending it posts the person context
    //    with focus "sentiment".
    await userEvent.click(screen.getByRole('button', { name: 'Why this sentiment?' }));
    expect(composer()).toHaveValue("Why is Lukas's sentiment neutral?");
    expect(within(rail()).getByText('Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA · Sentiment')).toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
    await userEvent.type(composer(), '{Enter}');
    await waitFor(() => expect(postedBodies(copilot)).toHaveLength(2));
    expect(postedBodies(copilot)[1]).toMatchObject({
      content: "Why is Lukas's sentiment neutral?",
      context: { surface: 'contacts', view: 'person', contact: 41, focus: 'sentiment' },
    });
    await screen.findByText("Answer to: Why is Lukas's sentiment neutral?");

    // 6. History lists the conversation, tagged with the server's label.
    await userEvent.click(pill().getByRole('button', { name: 'History' }));
    const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', {
      name: /Why is Lukas's sentiment neutral\?/,
    });
    expect(within(item).getByText('Lukas Vermeer · Kraft Heinz')).toBeInTheDocument();
    expect(item).toHaveAccessibleName(/Why is Lukas's sentiment neutral\?\s*Started on Lukas Vermeer · Kraft Heinz/);
  });
});
