import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailEditor } from './MailEditor';
import { SIGNATURE } from '../../features/mail/testMail';

// Unit tier: the formatting editor (Decision 1). jsdom has no
// execCommand, so each test gives the document a spy.

let exec: ReturnType<typeof vi.fn>;
beforeEach(() => {
  exec = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
});

function renderEditor(html = `<p></p>${SIGNATURE}`) {
  const onChange = vi.fn();
  render(<MailEditor label="Message" html={html} onChange={onChange} />);
  return { editor: screen.getByRole('textbox', { name: 'Message' }), onChange };
}

describe('MailEditor', () => {
  it('starts with the server html, signature included, and hands back cleaned html on input', () => {
    const { editor, onChange } = renderEditor();
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(editor.innerHTML).toContain('data-revenact-signature');
    editor.innerHTML = '<p>Works <span style="color:red">for us</span>.</p>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenLastCalledWith('<p>Works for us.</p>');
  });

  it('seeds only what the editor may hold, so nothing in the html can run', () => {
    const { editor } = renderEditor('<p>Hi</p><img src="x" onerror="alert(1)">');
    expect(editor.innerHTML).toBe('<p>Hi</p>');
  });

  it('offers bold, italic, both lists and a link, each named', async () => {
    renderEditor();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    for (const name of ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link']) expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Bold' }));
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Numbered list' }));
    expect(exec.mock.calls.map((call) => call[0])).toEqual(['bold', 'insertOrderedList']);
  });

  it('pastes text only', () => {
    const { editor, onChange } = renderEditor();
    fireEvent.paste(editor, { clipboardData: { getData: (type: string) => (type === 'text/plain' ? 'Plain words' : '<img src="x">') } });
    expect(exec).toHaveBeenCalledWith('insertText', false, 'Plain words');
    expect(onChange).toHaveBeenCalled();
  });

  it('refuses a link that is not a web or email address, and writes one that is', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    const field = screen.getByLabelText('Link address');
    await userEvent.type(field, 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use a web or email address.');
    await userEvent.clear(field);
    await userEvent.type(field, 'doughco.com{Enter}');
    // Nothing was selected, so the address itself is written as the link.
    expect(exec).toHaveBeenCalledWith('insertHTML', false, '<a href="https://doughco.com/">https://doughco.com/</a>');
    expect(screen.queryByLabelText('Link address')).not.toBeInTheDocument();
  });

  it('drops text only: dropped rich html never reaches the live editor', () => {
    const { editor, onChange } = renderEditor();
    const data = { files: [], types: ['text/html', 'text/plain'], getData: (type: string) => (type === 'text/plain' ? 'Dropped words' : '<img src="x" onerror="alert(1)"><b style="color:red">Dropped words</b>') };
    const kept = fireEvent.drop(editor, { dataTransfer: data });
    expect(kept).toBe(false);
    expect(exec).toHaveBeenCalledWith('insertText', false, 'Dropped words');
    expect(editor.innerHTML).not.toContain('img');
    expect(onChange).toHaveBeenCalled();
  });

  it('refuses a dropped file and writes nothing', () => {
    const { editor } = renderEditor();
    const kept = fireEvent.drop(editor, { dataTransfer: { files: [new File(['x'], 'a.png')], types: ['Files'], getData: () => '' } });
    expect(kept).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('closes the link row with Cancel or a second press of Link, on a phone too', async () => {
    renderEditor();
    const link = screen.getByRole('button', { name: 'Link' });
    await userEvent.click(link);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Link address')).not.toBeInTheDocument();
    expect(link).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(link);
    expect(screen.getByLabelText('Link address')).toBeInTheDocument();
    await userEvent.click(link);
    expect(screen.queryByLabelText('Link address')).not.toBeInTheDocument();
    expect(exec).not.toHaveBeenCalled();
  });

  it('is read-only while disabled (a send in flight): nothing can be typed or formatted', () => {
    const onChange = vi.fn();
    render(<MailEditor label="Message" html="<p>Hi</p>" onChange={onChange} disabled />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    expect(editor).toHaveAttribute('contenteditable', 'false');
    expect(editor).toHaveAttribute('aria-disabled', 'true');
    for (const button of within(screen.getByRole('toolbar', { name: 'Formatting' })).getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('keeps the Gmail signature as one read-only block (round 2 D1 Decision 6)', () => {
    const { editor } = renderEditor(`<p>Hi</p>${SIGNATURE}`);
    const block = editor.querySelector('[data-revenact-signature]');
    expect(block).not.toBeNull();
    expect(block).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByText('Your Gmail signature goes out as it is in Gmail.')).toBeInTheDocument();
  });

  it('marks the signature block from the editor class, never on the block (so it is not sent)', () => {
    const { editor, onChange } = renderEditor(`<p>Hi</p>${SIGNATURE}`);
    expect(editor.className).toContain('[&_[data-revenact-signature]]:mt-3');
    expect(editor.className).toContain('[&_[data-revenact-signature]]:text-ink-muted');
    fireEvent.input(editor);
    const sent = onChange.mock.calls.at(-1)![0] as string;
    const block = new DOMParser().parseFromString(sent, 'text/html').querySelector('[data-revenact-signature]')!;
    expect(block.hasAttribute('class')).toBe(false);
  });

  it('says nothing about a signature when there is none', () => {
    renderEditor('<p>Hi</p>');
    expect(screen.queryByText('Your Gmail signature goes out as it is in Gmail.')).toBeNull();
  });

  it('never sends contenteditable, and keeps the signature marker', () => {
    const { editor, onChange } = renderEditor(`<p>Hi</p>${SIGNATURE}`);
    fireEvent.input(editor);
    const sent = onChange.mock.calls.at(-1)![0] as string;
    expect(sent).toContain('data-revenact-signature');
    expect(sent).not.toContain('contenteditable');
  });
});
