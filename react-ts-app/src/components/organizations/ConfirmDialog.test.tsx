import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm = async () => {} }: { onConfirm?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Remove it
      </button>
      {open ? <ConfirmDialog title="Remove it?" message="It is gone for good." confirmLabel="Remove" danger onConfirm={onConfirm} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

async function openDialog(onConfirm?: () => Promise<void>) {
  render(<Harness onConfirm={onConfirm} />);
  const opener = screen.getByRole('button', { name: 'Remove it' });
  await userEvent.click(opener);
  return { opener, dialog: screen.getByRole('dialog', { name: 'Remove it?' }) };
}

describe('ConfirmDialog', () => {
  it('is a modal dialog labelled by its title and described by its message, with focus on Cancel', async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('It is gone for good.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('keeps Tab inside', async () => {
    await openDialog();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    const { opener } = await openDialog();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on its labelled X, which submits no form around it', async () => {
    const submit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(event) => submit(event.nativeEvent)}>
        <ConfirmDialog title="Remove it?" message="Gone." confirmLabel="Remove" onConfirm={async () => {}} onClose={() => {}} />
      </form>,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveAttribute('type', 'button');
    await userEvent.click(close);
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not close on Escape while the confirm is working', async () => {
    let finish = () => {};
    await openDialog(() => new Promise<void>((resolve) => (finish = resolve)));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('announces a refusal', async () => {
    await openDialog(() => Promise.reject('Cancel it instead: some of its work is done.'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancel it instead: some of its work is done.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps to the house type scale and colour tokens', () => {
    const source = readFileSync('src/components/organizations/ConfirmDialog.tsx', 'utf8');
    expect(source.match(/text-\[(\d+)px\]/g)?.filter((size) => !['text-[11px]', 'text-[13px]', 'text-[15px]', 'text-[22px]'].includes(size)) ?? []).toEqual([]);
    expect(source).not.toMatch(/text-white|bg-white|text-black/);
  });
});
