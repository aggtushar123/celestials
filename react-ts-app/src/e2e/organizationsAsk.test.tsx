import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubOrganizationsAsk } from '../pages/organizations/ask/testOrganizationsAsk';
import { renderOrganizations } from '../pages/organizations/testList';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, both Organizations
// pages under OrganizationsAskLayout, the rail and pill, the store and the
// router. Only fetch is stubbed: the portfolio's endpoints and the Copilot's.
// filters below carry only the set keys, and group only when it differs from
// the view's own default (backend ruling).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const views = () => screen.getByRole('navigation', { name: 'Organizations views' });
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');

// lifecycle is the Board's own default group, so it is left out here.
const origin = { surface: 'organizations', view: 'board', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] };
const earlier = { id: 9, title: 'Which renewals slipped?', created_at: '', updated_at: '', origin };

describe('Ask Revenact on Organizations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks on a filtered list, about one opened row, follows the board, and reopens a board conversation from History', { timeout: 30000 }, async () => {
    const { copilot } = stubOrganizationsAsk({
      copilot: {
        conversations: [earlier],
        conversationById: {
          9: {
            ...earlier,
            messages: [
              { id: 1, role: 'user', content: 'Which renewals slipped?', context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
              { id: 2, role: 'assistant', content: 'Pizza Hut slipped 47 days.', sources: [], questions: [], created_at: '' },
            ],
          },
        },
      },
    });
    renderOrganizations('/organizations/list', { nav: true, ask: true });
    await screen.findByRole('link', { name: 'Globex' });

    // 1. Filter the list to Carl CSM's book.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();

    // 2. Ask: the question carries the list and its filter, named in the chip.
    expect(await within(rail()).findByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'organizations', view: 'list', filters: { owner: '2' }, focus: null });

    // 3. Open Pizza Hut's row: the next question is about it alone, once.
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(await within(rail()).findByText('Organizations · Owner: Carl CSM · 1 account')).toBeInTheDocument();
    await userEvent.type(composer(), 'Why is it at risk?{enter}');
    await screen.findByText('Answer to: Why is it at risk?');
    expect(postedBodies(copilot)[1].context).toMatchObject({ view: 'list', focus: { kind: 'companies', ids: [7] } });

    // 4. The Board tab keeps the filter and the conversation; a follow-up carries the board.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where().pathname).toBe('/organizations/board');
    expect(screen.getByText('Answer to: Why is it at risk?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And by stage?{enter}');
    await screen.findByText('Answer to: And by stage?');
    // group is omitted: lifecycle is the Board's own default.
    expect(postedBodies(copilot)[2].context).toEqual({
      surface: 'organizations',
      view: 'board',
      filters: { owner: '2' },
      focus: null,
    });

    // 5. Back on the List, start over, then reopen an earlier board conversation from History.
    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(screen.queryByText('Answer to: Who renews first?')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', { name: /Which renewals slipped\?/ });
    expect(item).toHaveAccessibleName(/Started on Organizations · Owner: Carl CSM/);
    await userEvent.click(item);
    expect(await within(rail()).findByText('Pizza Hut slipped 47 days.')).toBeInTheDocument();
    await waitFor(() => expect(where().pathname).toBe('/organizations/board'));
    expect(where().searchParams.get('owner')).toBe('2');
  });
});
