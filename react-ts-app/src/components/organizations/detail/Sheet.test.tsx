import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

function Host({ isSm, withField = true }: { isSm: boolean; withField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Sheet title="New task" description="On EMEA" isSm={isSm} onClose={() => setOpen(false)}>
          {withField ? <input aria-label="Task title" /> : <p>Nothing to type</p>}
          <button type="button">Save</button>
        </Sheet>
      ) : null}
    </>
  );
}

async function open(isSm: boolean, withField = true) {
  render(<Host isSm={isSm} withField={withField} />);
  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  return screen.getByRole('dialog', { name: 'New task' });
}

describe('Sheet', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('is a labelled modal panel from sm that takes focus to its first field and locks the page', async () => {
    const dialog = await open(true);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('On EMEA');
    expect(dialog.closest('[data-shape]')).toHaveAttribute('data-shape', 'panel');
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('is a bottom sheet on phones, and focuses Close when there is no field', async () => {
    const dialog = await open(false, false);
    expect(dialog.closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('keeps Tab inside', async () => {
    await open(true);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('closes on Escape and hands focus back to its opener', async () => {
    await open(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from Close and from the scrim', async () => {
    await open(true);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("sits on the body, outside the page's scroll column, so a wheel or swipe on the scrim cannot scroll the page behind", async () => {
    const { container } = render(
      <div data-testid="column" className="overflow-y-auto">
        <Host isSm />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    const root = dialog.closest('[data-shape]') as HTMLElement;
    expect(root.parentElement).toBe(document.body);
    expect(container).not.toContainElement(root);
    expect(root).toHaveClass('overscroll-contain');
    expect(dialog.querySelector('.overflow-y-auto')).toHaveClass('overscroll-contain');
    // Focus still moves in, and Tab stays inside.
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveFocus();
  });
});

function OptionsHarness({ isSm }: { isSm: boolean }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  return (
    <>
      <h2 id="fallback" tabIndex={-1}>
        List
      </h2>
      {gone ? null : (
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      )}
      {open ? (
        <Sheet
          title="Bundle"
          isSm={isSm}
          size="wide"
          phone="full"
          focus="heading"
          footer={<button type="button">Run 1 selected</button>}
          returnFocus={() => document.getElementById('fallback')}
          onClose={() => {
            setOpen(false);
            setGone(true);
          }}
        >
          <input aria-label="Title" />
        </Sheet>
      ) : null}
    </>
  );
}

describe('Sheet options (agent bundles D1 frontend Decision 5)', () => {
  it('focuses the heading, pins the footer, and returns focus to the fallback when the opener is gone', async () => {
    render(<OptionsHarness isSm />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('heading', { name: 'Bundle' })).toHaveFocus();
    expect(screen.getByRole('dialog').className).toContain('max-w-2xl');
    expect(screen.getByRole('button', { name: 'Run 1 selected' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: 'List' })).toHaveFocus();
  });

  it('is full screen below sm', async () => {
    render(<OptionsHarness isSm={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog').className).toContain('h-full');
    expect(screen.getByRole('dialog').className).not.toContain('rounded-t-xl');
  });

  it('keeps Shift+Tab inside when the heading has focus', async () => {
    render(<OptionsHarness isSm />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('heading', { name: 'Bundle' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Run 1 selected' })).toHaveFocus();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('wraps a wide sheet\'s long title on a phone instead of cutting it; a regular sheet still truncates', async () => {
    render(<OptionsHarness isSm={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const heading = screen.getByRole('heading', { name: 'Bundle' });
    expect(heading.className).toContain('break-words');
    expect(heading.className).not.toContain('truncate');
  });

  it('keeps truncating the title of a regular sheet', async () => {
    await open(false);
    expect(screen.getByRole('heading', { name: 'New task' }).className).toContain('truncate');
  });
});
