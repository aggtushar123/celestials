import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ACCOUNT_FILTER_OPTIONS } from '../../../features/accounts/testPortfolio';
import { useAsk } from '../../dashboard/ask/useAsk';
import { AccountsAskLayout } from './AccountsAskLayout';
import { useReportAccountName, useReportAccountsOptions } from './accountsNames';

function Page({ name }: { name: string }) {
  const ask = useAsk()!;
  useReportAccountsOptions(ACCOUNT_FILTER_OPTIONS);
  const { context, chipLabel } = ask.surface;
  return (
    <div>
      <p data-testid="page">{name}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="context">{JSON.stringify(context)}</p>
      <p data-testid="chip">{context ? chipLabel(context) : 'none'}</p>
      <p data-testid="conversation">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.setConversation({ id: 3, title: 'Kept', created_at: '', updated_at: '', messages: [] })}>
        Start
      </button>
      <Link to="/accounts/board?owner=2">Board</Link>
      <Link to="/accounts/12?tab=details">Account</Link>
    </div>
  );
}

function AccountPage() {
  useReportAccountName(12, 'Pizza EMEA');
  return <Page name="Account" />;
}

function renderLayout(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/accounts" element={<AccountsAskLayout />}>
          <Route path="list" element={<Page name="List" />} />
          <Route path="board" element={<Page name="Board" />} />
          <Route path=":id" element={<AccountPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const context = () => JSON.parse(screen.getByTestId('context').textContent!);

describe('AccountsAskLayout', () => {
  it('asks from the accounts surface, naming filters from the options a page reports', async () => {
    renderLayout('/accounts/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('accounts');
    expect(context()).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2' } });
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Accounts · Owner: Carl CSM'));
  });

  it("names an account's page from the name it reports, carrying only its id", async () => {
    renderLayout('/accounts/12?tab=details');
    expect(context()).toEqual({ surface: 'accounts', view: 'detail', account: 12, focus: null });
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Pizza EMEA'));
  });

  it('keeps one conversation across the List, the Board and an account', async () => {
    renderLayout('/accounts/list');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('link', { name: 'Board' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Board');
    expect(context()).toEqual({ surface: 'accounts', view: 'board', filters: { owner: '2' } });
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
    await userEvent.click(screen.getByRole('link', { name: 'Account' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Account');
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
  });

  it('has no context on an id that is not an account', () => {
    renderLayout('/accounts/abc');
    expect(screen.getByTestId('chip')).toHaveTextContent('none');
  });
});
