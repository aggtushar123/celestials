import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { B_ESCALATION, ESCALATION_REPLY } from '../../features/agents/testBundleFixtures';
import { ReplyText } from './ReplyText';

const PLACES = B_ESCALATION.steps[3].placeholders;

function Harness({ onRaw }: { onRaw: (raw: string) => void }) {
  const [value, setValue] = useState(ESCALATION_REPLY);
  return (
    <ReplyText
      id="r"
      label="Message"
      value={value}
      stored={ESCALATION_REPLY}
      placeholders={PLACES}
      onChange={(raw) => {
        setValue(raw);
        onRaw(raw);
      }}
    />
  );
}

describe('ReplyText (frontend Decision 3)', () => {
  it('shows the Jira key and link as markers, with a chip each', () => {
    render(<Harness onRaw={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success).');
    expect(screen.getByText('Fills in when step 1 runs:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Jira key from step 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Jira link from step 1' })).toBeInTheDocument();
  });

  it('typing words keeps the placeholders in what is saved', () => {
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Hi Faiz, it is [Jira key] ([Jira link]).' } });
    expect(onRaw).toHaveBeenLastCalledWith('Hi Faiz, it is {{step 1.ticket_key}} ({{step 1.ticket_url}}).');
  });

  it('removing a chip takes its placeholder out', async () => {
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jira link from step 1' }));
    expect(onRaw).toHaveBeenLastCalledWith('Thanks Tushar. Logged as {{step 1.ticket_key}} with Faiz Jamal (Customer Success).');
    expect(screen.queryByRole('button', { name: 'Remove Jira link from step 1' })).toBeNull();
  });

  it('after a chip is removed, focus goes to the next chip, then to the field', async () => {
    render(<Harness onRaw={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jira key from step 1' }));
    expect(screen.getByRole('button', { name: 'Remove Jira link from step 1' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jira link from step 1' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  });

  it('a chip cannot be typed', () => {
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: '[Jira key] [Jira key] [Jira link]' } });
    expect(onRaw).toHaveBeenLastCalledWith('{{step 1.ticket_key}} [Jira key] {{step 1.ticket_url}}');
  });
});
