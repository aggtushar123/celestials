import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { TEAM_MEMBERS } from '../../features/knowledge/testHeads';
import type { Escalation } from '../../features/agents/bundleTypes';
import { EscalationHandler } from './EscalationHandler';

const ESC: Escalation = {
  function: 'engineering',
  function_label: 'Engineering',
  handler: { id: 11, name: 'Faiz Jamal', function_label: 'Customer Success' },
  via: 'thread',
  decision: { by: 'Jesh Sanghvi', quote: '@Faiz Jamal can you take this?', named: 'Faiz Jamal' },
  can_change: true,
};

function members() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => TEAM_MEMBERS })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetMembersCache();
});

describe('EscalationHandler (frontend Decision 2)', () => {
  it('says where the work came from and who has it, with Change only when allowed', () => {
    members();
    const { rerender } = render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.getByText('Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(screen.getByText('Faiz Jamal (Customer Success)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    rerender(<EscalationHandler escalation={{ ...ESC, can_change: false }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('asks to choose when the thread named someone no member matches', () => {
    members();
    render(<EscalationHandler escalation={{ ...ESC, handler: null, via: 'unresolved', decision: { ...ESC.decision!, named: 'Faiz Khan' } }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.getByText('The thread named Faiz Khan, but no member matches. Choose who handles this.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose' })).toBeInTheDocument();
  });

  it('changes to any active member, whatever their department', async () => {
    members();
    const onChange = vi.fn(async () => null);
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const person = await screen.findByRole('combobox', { name: 'Person' });
    expect([...(person as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Whoever handles a department',
      'Carl CSM · Customer Success',
      'Faiz Jamal · Customer Success',
      'Jesh Sanghvi · Engineering',
      'Erin Engineer · Engineering',
      'Sam Seller · Sales',
    ]);
    expect(person).toHaveValue('11');
    expect(screen.queryByRole('combobox', { name: 'Department' })).toBeNull();
    await userEvent.selectOptions(person, '13');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ user_id: 13 });
    expect(screen.queryByRole('combobox', { name: 'Person' })).toBeNull();
  });

  it('whoever handles a department asks for the department', async () => {
    members();
    const onChange = vi.fn(async () => null);
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Person' }), '');
    const department = screen.getByRole('combobox', { name: 'Department' });
    expect(department).toHaveValue('engineering');
    await userEvent.selectOptions(department, 'sales');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ user_id: null, function: 'sales' });
  });

  it('shows a refusal under its field and keeps the form open', async () => {
    members();
    const onChange = vi.fn(async () => ({ field: 'user_id' as const, message: 'Sam Seller is deactivated. Pick an active member.', lost: false }));
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Person' }), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sam Seller is deactivated. Pick an active member.');
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('Cancel closes the form and focus goes back to Change', async () => {
    members();
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
  });

  it('stays open with the choice kept, and shows nothing, when the panel answers an empty refusal', async () => {
    members();
    const onChange = vi.fn(async () => ({ field: null, message: '', lost: false }));
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const person = await screen.findByRole('combobox', { name: 'Person' });
    await userEvent.selectOptions(person, '13');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ user_id: 13 });
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('13');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('changing the department clears its refusal', async () => {
    members();
    const onChange = vi.fn(async () => ({ field: 'function' as const, message: 'Choose a department.', lost: false }));
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Person' }), '');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Department' }), 'sales');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps asking to choose when a department Change found nobody (R5)', () => {
    members();
    render(<EscalationHandler escalation={{ ...ESC, handler: null, via: 'nobody' }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.getByText('The thread said: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(screen.getByText('Choose who handles this')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose' })).toBeInTheDocument();
  });

  it('says "Choose who handles this" once when the thread named no one', () => {
    members();
    render(<EscalationHandler escalation={{ ...ESC, handler: null, via: 'nobody', decision: null }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.getAllByText(/Choose who handles this/)).toHaveLength(1);
  });

  it('saving the current person or department just closes, with no change sent', async () => {
    members();
    const onChange = vi.fn(async () => null);
    const { rerender } = render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await screen.findByRole('option', { name: 'Carl CSM · Customer Success' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('combobox', { name: 'Person' })).toBeNull();
    const head = { ...ESC, via: 'head' as const, handler: { id: 12, name: 'Jesh Sanghvi', function_label: 'Engineering' } };
    rerender(<EscalationHandler escalation={head} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Person' }), '');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('combobox', { name: 'Department' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a member with no department reads as the name alone', async () => {
    const rows = [...TEAM_MEMBERS, { id: 16, name: 'Nadia New', function: '', is_active: true }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => rows })));
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByRole('option', { name: 'Nadia New' })).toHaveTextContent(/^Nadia New$/);
  });

  it.each([
    ['never answers', () => new Promise(() => {})],
    ['fails', async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Down.' }) })],
  ])('shows the current person while the members list %s', async (_name, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer));
    const onChange = vi.fn(async () => null);
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const person = screen.getByRole('combobox', { name: 'Person' });
    expect(person).toHaveValue('11');
    expect([...(person as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Whoever handles a department', 'Faiz Jamal · Customer Success']);
    expect(screen.queryByRole('combobox', { name: 'Department' })).toBeNull();
  });

  it('lists the current person once when the members arrive', async () => {
    members();
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await screen.findByRole('option', { name: 'Carl CSM · Customer Success' });
    expect(screen.getAllByRole('option', { name: 'Faiz Jamal · Customer Success' })).toHaveLength(1);
  });

  it('when it can no longer change, hides Save, and Cancel puts focus on Handled by', async () => {
    members();
    const { rerender } = render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    rerender(<EscalationHandler escalation={{ ...ESC, can_change: false }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Handled by')).toHaveFocus();
  });
});
