import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requested, stubContactsApi } from '../features/contacts/testContacts';
import { renderContactsPage } from '../pages/contacts/testPage';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the Contacts page on the real store
// and router. Only fetch is stubbed, in the backend's contract shapes.
const where = () => screen.getByTestId('where').textContent;

describe('Contacts, end to end (spec 2026-09-28 §7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters by organisation, opens a person, sees their calls with sentiment, and follows the link to the organisation', { timeout: 30000 }, async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts');

    // 1. Filter by Kraft Heinz: the URL, the request and the list follow.
    await screen.findByRole('list', { name: 'People' });
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Organisation' }), 'Kraft Heinz');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem')).toHaveLength(1));
    expect(where()).toBe('/contacts?customer=6');
    expect(requested(spy)).toContain('/contacts/?customer=6');
    expect(screen.getByRole('status')).toHaveTextContent('1 person');
    expect(screen.getByRole('group', { name: 'People' })).toHaveTextContent('1 active');
    expect(screen.getByRole('group', { name: 'Sentiment' })).toHaveTextContent('0%positive · 0 negative');

    // 2. Open Lukas: his profile beside the list, the filter kept.
    await userEvent.click(screen.getByRole('link', { name: /Lukas Vermeer/ }));
    expect(where()).toBe('/contacts/41?customer=6');
    const profile = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(within(profile).getByRole('region', { name: 'Sentiment' })).toHaveTextContent(
      'Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep',
    );

    // 3. His calls, newest first, each with its reading.
    const calls = within(within(profile).getByRole('region', { name: /^Calls/ })).getAllByRole('listitem');
    expect(within(calls[0]).getByText('Positive')).toBeInTheDocument();
    expect(within(calls[1]).getByText('Not enough to analyse')).toBeInTheDocument();

    // 4. The account link opens the organisation page with that account's
    //    chip chosen; following the organisation link opens its page.
    expect(within(profile).getByRole('link', { name: 'Kraft Heinz EMEA' })).toHaveAttribute('href', '/organizations/6?account=31');
    await userEvent.click(within(profile).getByRole('link', { name: 'Kraft Heinz' }));
    expect(where()).toBe('/organizations/6');
  });
});
