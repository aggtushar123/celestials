import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageFields } from './MessageFields';

function Harness({ start = '', errors = {} }: { start?: string; errors?: { subject?: string; body?: string } }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(start);
  return <MessageFields subject={subject} body={body} errors={errors} onSubject={setSubject} onBody={setBody} />;
}
const bodyBox = () => screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement;

describe('the message fields (spec §2.2)', () => {
  it('counts the subject and the body in tabular figures', async () => {
    render(<Harness />);
    const subjectCount = screen.getByText((_, node) => node?.id.endsWith('-hint') === true && node.textContent === '0 of 150');
    expect([...subjectCount.querySelectorAll('.tabular-nums')].map((node) => node.textContent)).toEqual(['0', '150']);
    expect(screen.getByText((_, node) => node?.id.endsWith('-hint') === true && node.textContent === '0 of 5000')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Subject' }), 'Hello');
    expect(screen.getByText((_, node) => node?.id.endsWith('-hint') === true && node.textContent === '5 of 150')).toBeInTheDocument();
  });

  it('sets each merge field in DM Mono, as code (UI foundations spec §3)', () => {
    render(<Harness />);
    expect(within(screen.getByRole('button', { name: 'Insert {first_name}' })).getByText('{first_name}')).toHaveClass('font-mono-brand');
  });

  it('inserts a merge field at the caret, over a selection, and leaves the caret after it', async () => {
    render(<Harness start="Hello , welcome" />);
    const box = bodyBox();
    box.focus();
    box.setSelectionRange(6, 6);
    fireEvent.select(box);
    await userEvent.click(screen.getByRole('button', { name: 'Insert {first_name}' }));
    expect(box).toHaveValue('Hello {first_name}, welcome');
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(18);
    box.setSelectionRange(0, 5);
    fireEvent.select(box);
    await userEvent.click(screen.getByRole('button', { name: 'Insert {sender_name}' }));
    expect(box).toHaveValue('{sender_name} {first_name}, welcome');
  });

  it('adds a merge field at the end when the body was never touched', async () => {
    render(<Harness start="Hi" />);
    await userEvent.click(screen.getByRole('button', { name: 'Insert {organisation}' }));
    expect(bodyBox()).toHaveValue('Hi{organisation}');
  });

  it('shows a refusal under its field and marks it invalid', () => {
    render(<Harness errors={{ body: 'Use {first_name}, {organisation} or {sender_name}.' }} />);
    expect(bodyBox()).toHaveAttribute('aria-invalid', 'true');
    expect(bodyBox()).toHaveAccessibleDescription(/Use \{first_name\}, \{organisation\} or \{sender_name\}\./);
  });
});
