import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { AccountTeamCard } from './AccountTeamCard';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { HEADS_JESH, stubAccountTeam } from '../../../features/knowledge/testHeads';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import type { Capability } from '../../../features/auth/authSlice';

afterEach(() => {
  vi.unstubAllGlobals();
  resetMembersCache();
});

const FAIZ = { id: 11, name: 'Faiz Jamal', function: 'cs' as const };

function show(permissions?: Capability[]) {
  render(
    <Provider store={makeDetailStore(permissions)}>
      <AccountTeamCard customerId={7} customerName="Globex (QA)" />
    </Provider>,
  );
}

const row = async (label: string) => {
  const list = await screen.findByRole('list', { name: 'Account team' });
  return within(list).getAllByRole('listitem').find((item) => item.getAttribute('data-team-row') === label) as HTMLElement;
};

describe('AccountTeamCard (Slack escalations D2, spec §4.4)', () => {
  it('shows the six departments, the owner, and who takes an empty row', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH });
    show();
    expect(screen.getByRole('region', { name: 'Account team' })).toBeInTheDocument();
    expect(screen.getByText('Who handles Globex (QA) in each department')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Account team' });
    expect(within(list).getAllByRole('listitem').map((item) => item.getAttribute('data-team-row'))).toEqual(['cs', 'engineering', 'sales', 'analytics', 'leadership', 'other']);
    expect(within(await row('cs')).getByText('Account owner')).toBeInTheDocument();
    expect(await within(await row('engineering')).findByText('Nobody yet · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    expect(within(await row('sales')).getByText('Nobody yet · No Sales head is set')).toBeInTheDocument();
  });

  it('offers only active people of the department and saves the choice', async () => {
    const { teamPatches } = stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH });
    show();
    const picker = await screen.findByRole('combobox', { name: 'Engineering on the account team' });
    await waitFor(() => expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody yet', 'Jesh Sanghvi', 'Erin Engineer']));
    await userEvent.selectOptions(picker, '13');
    await waitFor(() => expect(teamPatches).toEqual([{ function: 'engineering', user_id: 13 }]));
    await waitFor(() => expect(picker).toHaveValue('13'));
    expect(within(await row('engineering')).queryByText(/takes it/)).toBeNull();
  });

  it('says who takes it when the person on the team has left', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, team: { engineering: { id: 14, name: 'Ann Former' } } });
    show();
    expect(await within(await row('engineering')).findByText('Ann Former is deactivated · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    // The picker still shows who it is.
    expect(screen.getByRole('combobox', { name: 'Engineering on the account team' })).toHaveValue('14');
  });

  it('shows a refusal under its row', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, refuseTeam: { status: 403, body: { detail: 'Setting who is responsible needs view-all-accounts.' } } });
    show();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Engineering on the account team' }), '12');
    expect(await within(await row('engineering')).findByRole('alert')).toHaveTextContent('Setting who is responsible needs view-all-accounts.');
  });

  it('reads without pickers for someone who cannot change it', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, team: { engineering: { id: 13, name: 'Erin Engineer' } } });
    show([]);
    expect(within(await row('cs')).getByText('Faiz Jamal')).toBeInTheDocument();
    expect(within(await row('engineering')).getByText('Erin Engineer')).toBeInTheDocument();
    expect(await within(await row('sales')).findByText('Nobody yet · No Sales head is set')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('reads "Nobody yet" alone when the heads cannot be read', async () => {
    stubAccountTeam({ owner: FAIZ, failHeads: 1 });
    show();
    // The span, not the picker's "Nobody yet" option.
    expect(await within(await row('engineering')).findByText('Nobody yet', { selector: 'span' })).toBeInTheDocument();
  });

  it('offers Try again when the team cannot be read', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, failTeam: 1 });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the account team.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Account team' })).toBeInTheDocument();
  });

  it('says who takes it when the person on the team now works in another department', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, team: { engineering: { id: 15, name: 'Sam Seller' } } });
    show();
    expect(await within(await row('engineering')).findByText('Sam Seller is no longer in Engineering · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Engineering on the account team' })).toHaveValue('15');
  });
});
