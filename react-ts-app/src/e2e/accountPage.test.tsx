import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCOUNT_LISTS, stubAccountPage } from '../features/accounts/testAccountPage';
import { stubAccountsPortfolio } from '../features/accounts/testPortfolio';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { postBodies } from '../features/organizations/testStory';
import { renderAccounts } from '../pages/accounts/testList';
import { resetViewport } from '../test/viewport';

// Delivery 2's journey in jsdom (spec 2026-09-29 §5): from the Accounts list
// to an account's story by its id alone, a note added to it, its Details,
// and on to one of its organisations with this account chosen. Only fetch is
// stubbed: the list's endpoints (stubAccountsPortfolio) behind the account
// page's (stubAccountPage).

const where = () => screen.getByTestId('where').textContent;
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));

describe('the account page, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('goes from the list to the story, adds a note, reads Details and opens an organisation', async () => {
    const list = stubAccountsPortfolio();
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS, fallback: list });
    renderAccounts('/accounts/list', { nav: true, realPage: true });

    // 1. The list's name opens the account's story by its id alone.
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(where()).toBe('/accounts/12');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Accounts' })).toHaveAttribute(
      'href',
      '/accounts/list',
    );
    await waitFor(() => expect(itemKeys()).toHaveLength(5));

    // 2. + Add a note: saved on the account, and the story shows it.
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(itemKeys()).toContain('note:901'));
    expect(postBodies(spy, '/accounts/12/notes/')).toEqual([{ title: 'Kickoff', body: 'Met the new admin.' }]);

    // 3. Details: the panels, the CSAT bands and where knowledge lives.
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(where()).toBe('/accounts/12?tab=details');
    expect(screen.getByRole('region', { name: 'Account details' })).toBeInTheDocument();
    expect(await screen.findByText('CSAT responses', { selector: 'span' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Knowledge' })).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute(
      'href',
      '/organizations/7?tab=knowledge',
    );

    // 4. "Part of" opens the organisation with this account's chip chosen.
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    await userEvent.click(within(header).getByRole('link', { name: 'Pizza Hut' }));
    expect(await screen.findByText('Organization page')).toBeInTheDocument();
    expect(where()).toBe('/organizations/7?account=12');
  });
});
