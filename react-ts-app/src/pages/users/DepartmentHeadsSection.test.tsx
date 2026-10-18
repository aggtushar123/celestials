import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { DepartmentHeadsSection } from './DepartmentHeadsSection';
import { ToastProvider } from '../../components/ui';
import { makeDetailStore } from '../organizations/testDetail';
import { HEADS_JESH, headsWith, NO_HEADS, TEAM_MEMBERS, stubAccountTeam } from '../../features/knowledge/testHeads';
import type { Member } from '../../features/userManagement/userManagementSlice';
import type { Capability } from '../../features/auth/authSlice';

afterEach(() => vi.unstubAllGlobals());

// The People & teams list (/auth/users/) carries more fields; the section reads these.
const MEMBERS = TEAM_MEMBERS as unknown as Member[];

function show(permissions?: Capability[]) {
  render(
    <Provider store={makeDetailStore(permissions)}>
      <ToastProvider>
        <DepartmentHeadsSection members={MEMBERS} />
      </ToastProvider>
    </Provider>,
  );
}

const picker = (name: string) => screen.findByRole('combobox', { name });

describe('Department heads (Slack escalations D2, spec §4.4)', () => {
  it('lists each department with its active people', async () => {
    stubAccountTeam({ heads: HEADS_JESH });
    show();
    const section = screen.getByRole('region', { name: 'Department heads' });
    expect(within(section).getByText("When nobody on a customer's account team works in a department, its head takes the customer's escalations.")).toBeInTheDocument();
    const engineering = await picker('Engineering');
    expect(engineering).toHaveValue('12');
    expect(within(engineering).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody', 'Jesh Sanghvi', 'Erin Engineer']);
    expect(screen.getByText('Nobody works in Analytics yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(6);
  });

  it('saves a head at once and undoes it', async () => {
    const { headPatches } = stubAccountTeam({ heads: NO_HEADS });
    show();
    await userEvent.selectOptions(await picker('Engineering'), '12');
    await waitFor(() => expect(headPatches).toEqual([{ function: 'engineering', user_id: 12 }]));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(await picker('Engineering')).toHaveValue('12');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(headPatches).toEqual([{ function: 'engineering', user_id: 12 }, { function: 'engineering', user_id: null }]));
    await waitFor(async () => expect(await picker('Engineering')).toHaveValue(''));
  });

  it('shows the refusal under its row and keeps the old head', async () => {
    const refusal = 'Erin Engineer is deactivated. Pick an active member.';
    stubAccountTeam({ heads: HEADS_JESH, refuseHead: { status: 400, body: { user_id: [refusal] } } });
    show();
    await userEvent.selectOptions(await picker('Engineering'), '13');
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal);
    expect(await picker('Engineering')).toHaveValue('12');
  });

  it('reads only, for someone who cannot manage organisation settings', async () => {
    stubAccountTeam({ heads: HEADS_JESH });
    show(['manage_users']);
    expect(await picker('Engineering')).toBeDisabled();
    expect(screen.getByText(/Only someone who manages organisation settings can change them\./)).toBeInTheDocument();
  });

  it('offers Try again when the heads cannot be read', async () => {
    stubAccountTeam({ failHeads: 1, heads: HEADS_JESH });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the department heads.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await picker('Engineering')).toHaveValue('12');
  });

  it('reads a head who is not in the member list as their name, with no empty-department hint', async () => {
    stubAccountTeam({ heads: headsWith({ sales: { id: 99, name: 'Pat Partner' } }) });
    show();
    const sales = await picker('Sales');
    expect(sales).toHaveValue('99');
    expect(within(sales).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody', 'Pat Partner', 'Sam Seller']);
    const rest = MEMBERS.filter((m) => m.function !== 'sales');
    cleanup();
    render(
      <Provider store={makeDetailStore()}>
        <ToastProvider>
          <DepartmentHeadsSection members={rest} />
        </ToastProvider>
      </Provider>,
    );
    expect(await picker('Sales')).toHaveValue('99');
    expect(screen.queryByText('Nobody works in Sales yet.')).not.toBeInTheDocument();
  });

  it('keeps the focused picker enabled while its own save runs', async () => {
    stubAccountTeam({ heads: NO_HEADS });
    show();
    const engineering = await picker('Engineering');
    // Checked in the same tick as the change, while the save is still pending.
    fireEvent.change(engineering, { target: { value: '12' } });
    expect(engineering).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Analytics' })).toBeDisabled();
    await screen.findByText('Saved');
  });

  it('waits for the member list before showing the rows', async () => {
    stubAccountTeam({ heads: HEADS_JESH });
    render(
      <Provider store={makeDetailStore()}>
        <ToastProvider>
          <DepartmentHeadsSection members={[]} membersLoading />
        </ToastProvider>
      </Provider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });
});
