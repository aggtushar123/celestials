import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleFields } from './RoleFields';

describe('RoleFields (shared by Surveys and rules)', () => {
  it('asks nothing of a contact segment, or before a segment is chosen', () => {
    const { container, rerender } = render(<RoleFields kind="contact" roles={[]} onRoles={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RoleFields kind={null} roles={[]} onRoles={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks who at each account, keeping roles in the order ticked', async () => {
    const onRoles = vi.fn();
    render(<RoleFields kind="account" roles={['decision_maker']} onRoles={onRoles} />);
    expect(screen.getByRole('group', { name: 'Who to ask at each account' })).toBeInTheDocument();
    expect(screen.getByText('Up to 3 people per account, in the order you tick the roles.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Champion' }));
    expect(onRoles).toHaveBeenLastCalledWith(['decision_maker', 'champion']);
  });

  it('shows its error under the boxes', () => {
    render(<RoleFields kind="customer" roles={[]} error="Choose at least one role." onRoles={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Who to ask at each organisation' })).toHaveTextContent('Choose at least one role.');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one role.');
  });

  it('can say "email" for a campaign (campaigns spec §2.2)', () => {
    render(<RoleFields kind="account" roles={['champion']} onRoles={() => {}} verb="email" />);
    expect(screen.getByRole('group', { name: 'Who to email at each account' })).toBeInTheDocument();
  });
});
