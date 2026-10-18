import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RecipientField } from './RecipientField';
import type { Recipient } from '../../features/mail/mailDrafts';

// Unit tier: To, Cc and Bcc as chips.

function Harness({ initial = [] as Recipient[], spy = vi.fn() }) {
  const [value, setValue] = useState<Recipient[]>(initial);
  return (
    <RecipientField
      label="To"
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
    />
  );
}

describe('RecipientField', () => {
  it('makes a chip from an address typed before a comma or Enter, never twice', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const field = screen.getByLabelText('To');
    await userEvent.type(field, 'ann@pizzahut.com,');
    await userEvent.type(field, 'Sam <SAM@pizzahut.com>{Enter}');
    await userEvent.type(field, 'ann@pizzahut.com{Enter}');
    expect(spy).toHaveBeenLastCalledWith([
      ['', 'ann@pizzahut.com'],
      ['Sam', 'sam@pizzahut.com'],
    ]);
    expect(screen.getByRole('list', { name: 'To addresses' })).toHaveTextContent('ann@pizzahut.comSam');
    expect(field).toHaveValue('');
  });

  it('keeps what is not an address in the field and says which', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('To');
    await userEvent.type(field, 'ann at pizzahut{Enter}');
    expect(field).toHaveValue('ann at pizzahut');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Check this address: ann at pizzahut')).toBeInTheDocument();
  });

  it('takes a pasted list, and commits what is left on blur', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('To');
    fireEvent.paste(field, { clipboardData: { getData: () => 'a@x.com; b@x.com' } });
    await userEvent.type(field, 'c@x.com');
    fireEvent.blur(field);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('removes a chip by its button, and Backspace in an empty field takes the last one back', async () => {
    render(<Harness initial={[['Ann Lee', 'ann@pizzahut.com'], ['', 'sam@pizzahut.com']]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove ann@pizzahut.com' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const field = screen.getByLabelText('To');
    await userEvent.click(field);
    await userEvent.keyboard('{Backspace}');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(field).toHaveValue('sam@pizzahut.com');
  });

  it('shows the server field error under the field', () => {
    render(<RecipientField label="To" value={[]} onChange={vi.fn()} error="Add someone to send it to." />);
    expect(screen.getByLabelText('To')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Add someone to send it to.')).toBeInTheDocument();
  });
});
