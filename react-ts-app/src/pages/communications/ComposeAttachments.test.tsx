import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeAttachments } from './ComposeAttachments';
import type { DraftAttachment } from '../../features/mail/mailDrafts';

// Unit tier: the files on a message being written.

const QUOTE: DraftAttachment = { id: 61, filename: 'Quote v2.pdf', mime_type: 'application/pdf', size: 182311, origin: 'upload', download_url: '/api/v1/mail/attachments/61/download/' };
const ORIGINAL: DraftAttachment = { id: 31, filename: 'Renewal quote.pdf', mime_type: 'application/pdf', size: 90112, origin: 'forward', download_url: '/api/v1/mail/attachments/31/download/' };

describe('ComposeAttachments', () => {
  it('lists uploads and forwarded originals with their size, the total, and a remove button each', async () => {
    const onRemove = vi.fn();
    render(<ComposeAttachments files={[QUOTE, ORIGINAL]} uploads={[]} total={272423} max={26214400} failedId={null} onAttach={vi.fn()} onRemove={onRemove} />);
    const list = screen.getByRole('list', { name: 'Attachments' });
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Renewal quote.pdfFrom the original · 88 KB');
    // Figured wraps each figure in its own span, so read the text whole.
    expect(document.body).toHaveTextContent('266 KB of 25 MB used');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Renewal quote.pdf' }));
    expect(onRemove).toHaveBeenCalledWith(31);
  });

  it('shows an upload in progress', () => {
    render(<ComposeAttachments files={[]} uploads={[{ key: 1, name: 'Deck.pptx', fraction: 0.4 }]} total={0} max={26214400} failedId={null} onAttach={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: 'Uploading Deck.pptx' })).toHaveAttribute('value', '40');
  });

  it('hands chosen files to the composer, and marks the part a send could not get', async () => {
    const onAttach = vi.fn();
    render(<ComposeAttachments files={[ORIGINAL]} uploads={[]} total={90112} max={26214400} failedId={31} onAttach={onAttach} onRemove={vi.fn()} />);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByLabelText('Choose files to attach'), file);
    expect(onAttach).toHaveBeenCalledWith([file]);
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('border-danger');
  });

  it('says nothing about size with no files: the bodies alone count toward the limit (contract decision 20)', () => {
    render(<ComposeAttachments files={[]} uploads={[]} total={2048} max={26214400} failedId={null} onAttach={vi.fn()} onRemove={vi.fn()} />);
    expect(document.body).not.toHaveTextContent(/used|attached/);
  });

  it('reads the limit from the draft, not a fixed 25 MB', () => {
    render(<ComposeAttachments files={[QUOTE]} uploads={[]} total={190000} max={10 * 1024 * 1024} failedId={null} onAttach={vi.fn()} onRemove={vi.fn()} />);
    expect(document.body).toHaveTextContent('186 KB of 10 MB used');
  });
});
