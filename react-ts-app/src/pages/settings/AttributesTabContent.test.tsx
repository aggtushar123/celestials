import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttributesTabContent } from './AttributesTabContent';
import { ATTRS, CSV_HEADER, CSV_NAME, CSV_NOTE, ROWS } from './testAttributes';

// Integration tier (see the `testing` skill): the real component and
// table over a fixed fixture; only the browser's download is stubbed.

const { createObjectURL, revokeObjectURL } = URL;

afterEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.restoreAllMocks();
});

function renderTab() {
  render(
    <AttributesTabContent
      entityLabel="organization"
      attributes={ATTRS}
      allAttributes={ATTRS}
      entities={ROWS}
      isLoading={false}
      error={null}
      searchQuery=""
      setSearchQuery={() => {}}
    />,
  );
}

const shown = (displayName: string) => screen.queryByText(displayName) !== null;

describe('AttributesTabContent Filter (settings spec 2026-10-06 §3.3)', () => {
  it('lists the attributes in cards of rows on the attribute grid, its labels above them from the breakpoint', () => {
    renderTab();
    const custom = screen.getByRole('list', { name: 'Custom attributes' });
    expect(custom.closest('section')).toHaveClass('@container');
    const labels = custom.previousElementSibling!;
    expect(labels).toHaveAttribute('aria-hidden', 'true');
    expect(labels).toHaveClass('hidden', '@min-[40rem]:grid');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('names the empty-state Clear search after the query, apart from the field’s own Clear search', () => {
    render(
      <AttributesTabContent entityLabel="organization" attributes={[]} allAttributes={ATTRS} entities={ROWS} isLoading={false} error={null} searchQuery="zzz" setSearchQuery={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Clear search for “zzz”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('keeps the count beside the search as a polite region', () => {
    renderTab();
    expect(screen.getByRole('status')).toHaveTextContent(`${ATTRS.length} attributes`);
  });

  it('offers the types present in the list, plus Has values and Empty', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')!.textContent)).toEqual(['Text', 'Number', 'Has values', 'Empty']);
  });

  it('narrows the rows by type and counts the filter on the button', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Number' }));
    expect(shown('Seats')).toBe(true);
    expect(shown('Note, "quoted"')).toBe(false);
    const button = screen.getByRole('button', { name: 'Filter attributes, 1 active' });
    expect(button).toHaveTextContent('1');
  });

  it('"Empty" shows only the 0% rows', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Empty' }));
    expect(shown('Seats')).toBe(true);
    expect(shown('Note, "quoted"')).toBe(false);
    expect(screen.queryByText('name')).toBeNull();
  });

  it('Clear brings every row back', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Number' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(shown('Seats')).toBe(true);
    expect(shown('Note, "quoted"')).toBe(true);
    expect(screen.getByRole('button', { name: 'Filter attributes' })).toBeInTheDocument();
  });

  it('says when nothing matches, with its own Clear', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Number' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Has values' }));
    expect(screen.getByText('No attributes match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(shown('Note, "quoted"')).toBe(true);
  });

  it('closes on Escape', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    expect(screen.getByRole('group', { name: 'Attribute filters' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Attribute filters' })).toBeNull();
  });

  it('returns focus to the Filter button on Escape', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Number' }));
    expect(screen.getByRole('checkbox', { name: 'Number' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Filter attributes, 1 active' })).toHaveFocus();
  });

  it('closes on a click outside without pulling focus to the Filter button', async () => {
    renderTab();
    const search = screen.getByRole('searchbox', { name: /Search \d+ organization attributes/ });
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    search.focus();
    fireEvent.mouseDown(search);
    expect(screen.queryByRole('group', { name: 'Attribute filters' })).toBeNull();
    expect(search).toHaveFocus();
  });
});

describe('AttributesTabContent Download (settings spec 2026-10-06 §3.3)', () => {
  it('saves <entity>-attributes.csv built from the filtered rows', async () => {
    const captured: { blob?: Blob } = {};
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      captured.blob = obj as Blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderTab();

    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Text' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download attributes as CSV' }));

    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('organization-attributes.csv');
    expect(await captured.blob!.text()).toBe([CSV_HEADER, CSV_NAME, CSV_NOTE].join('\r\n'));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x'));
  });

  it('gives the Filter popover the overlay look and both buttons a 44px target on touch', async () => {
    renderTab();
    for (const name of ['Filter attributes', 'Download attributes as CSV']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    expect(screen.getByRole('group', { name: 'Attribute filters' })).toHaveClass('shadow-lg', 'bg-elevated');
  });
});

describe('AttributesTabContent: Clear, Download and the meta line', () => {
  it('keeps focus on Clear after it is pressed (aria-disabled, not disabled)', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    expect(clear).not.toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Number' }));
    expect(clear).not.toHaveAttribute('aria-disabled');
    await userEvent.click(clear);
    expect(shown('Note, "quoted"')).toBe(true);
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    expect(clear).toHaveFocus();
    // Nothing to clear: a press is a no-op.
    await userEvent.click(clear);
    expect(screen.getByRole('button', { name: 'Filter attributes' })).toBeInTheDocument();
  });

  it('sets Download on the surface, like the bordered buttons beside it', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'Download attributes as CSV' })).toHaveClass('bg-surface', 'border', 'border-line');
  });

  it('writes the row meta line as trailing-dot parts, never a leading dot', () => {
    renderTab();
    const row = document.querySelector('[data-attribute="name"]') as HTMLElement;
    const code = Array.from(row.querySelectorAll('span.font-mono-brand')).find((el) => el.textContent === 'name')!;
    const meta = code.parentElement!.parentElement!;
    expect(meta.textContent).toBe('name · Text · Required · 100% filled');
    const [namePart, narrowPart] = Array.from(meta.children);
    // The name's part carries the dot (shown with the narrow parts); the parts after it never lead with one.
    expect(namePart.textContent).toBe('name ·');
    expect(narrowPart.textContent!.trimStart().startsWith('·')).toBe(false);
    expect(Array.from(narrowPart.children).map((part) => part.textContent)).toEqual(['Text ·', 'Required ·', '100% filled']);
  });
});
