import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '../../../features/files/filesSlice';
import { FILES } from '../../../features/organizations/testStory';
import { FileItem } from './FileItem';

function renderItem(file: Attachment, canDelete = true) {
  const handlers = { onDownload: vi.fn(), onDelete: vi.fn() };
  render(
    <ul>
      <FileItem file={file} canDelete={canDelete} {...handlers} />
    </ul>,
  );
  return handlers;
}

describe('FileItem (spec 2026-09-27 §4)', () => {
  it("names a filed email's attachment by its subject and sender (D2 contract §6)", () => {
    renderItem({ ...FILES[0], source: 'email', description: '', uploaded_by: null, email: { id: 812, subject: 'Renewal terms', from: 'Ann Lee' } }, false);
    expect(screen.getByText(/Renewal terms · Email from Ann Lee ·/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('shows name, size, description, account, uploader, source and date on one meta line', () => {
    renderItem(FILES[0]);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('240 KB')).toHaveClass('tabular-nums');
    expect(within(item).getByText(/Signed order form · Alice · Upload ·/)).toBeInTheDocument();
    expect(within(item).getByText('20 Sep 2026')).toHaveClass('tabular-nums');
    expect(within(item).getByText('EMEA')).toBeInTheDocument();
    expect(item.querySelector('.font-mono-brand')).toBeNull();
  });

  it('names a call transcript as such, and gives a file on the organization no account tag', () => {
    renderItem({ ...FILES[1], source: 'transcript' });
    expect(screen.getByText(/Carl CSM · Call transcript ·/)).toBeInTheDocument();
    expect(screen.queryByText('Organization')).toBeNull();
  });

  it('downloads from its name, and deletes from the row actions where allowed', async () => {
    const { onDownload, onDelete } = renderItem(FILES[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Order form.pdf' }));
    expect(onDownload).toHaveBeenCalledOnce();
    const del = screen.getByRole('button', { name: 'Delete Order form.pdf' });
    expect(del).toHaveClass('min-h-11', 'min-w-11', 'sm:min-h-9', 'sm:min-w-9');
    expect(del.parentElement).toHaveClass('sm:opacity-0');
    await userEvent.click(del);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('offers no delete to someone who may not', () => {
    renderItem(FILES[0], false);
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
