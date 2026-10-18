import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Copy, Pencil, Send } from 'lucide-react';
import { DetailHeader, type HeaderAction } from './DetailHeader';

const EDIT: HeaderAction = { key: 'edit', label: 'Edit', icon: Pencil, to: '/segments/7/edit' };
const SURVEY: HeaderAction = { key: 'survey', label: 'Survey these', icon: Send, to: '/segments/7/survey' };

describe('DetailHeader (UI foundations spec §6.1, §9.2 row 3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the page in one display h1, shows at most two actions, and puts Delete last in ⋯ in the danger tone', async () => {
    const onDelete = vi.fn();
    render(
      <MemoryRouter>
        <DetailHeader
          title="Renewal risk"
          actions={[EDIT, SURVEY]}
          menu={[
            { key: 'delete', label: 'Delete', onSelect: onDelete, danger: true },
            { key: 'duplicate', label: 'Duplicate', onSelect: () => {} },
          ]}
          meta="Yours · Private"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Renewal risk' })).toHaveClass('text-[22px]', 'font-semibold', 'break-words');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/segments/7/edit');
    expect(screen.getByText('Yours · Private').closest('[data-part="meta"]')).toHaveClass('text-[13px]', 'text-ink-muted');
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Duplicate', 'Delete']);
    expect(items[1]).toHaveClass('text-danger-ink');
    await userEvent.click(items[1]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps every action on one row on a phone: the icon, its name for screen readers', () => {
    render(
      <MemoryRouter>
        <DetailHeader title="Q3 NPS" actions={[EDIT]} />
      </MemoryRouter>,
    );
    const edit = screen.getByRole('link', { name: 'Edit' });
    expect(edit).toHaveClass('min-w-11', 'justify-center');
    expect(within(edit).getByText('Edit')).toHaveClass('sr-only', 'sm:not-sr-only');
  });

  it('draws one primary, marks a toggle pressed and a busy button busy, and sends a click to onSelect', async () => {
    const onDuplicate = vi.fn();
    render(
      <MemoryRouter>
        <DetailHeader
          title="Win-back"
          actions={[
            { key: 'send', label: 'Send now…', icon: Send, onSelect: () => {}, primary: true },
            { key: 'copy', label: 'Duplicate', icon: Copy, onSelect: onDuplicate, busyLabel: 'Duplicating…', disabled: true },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Send now…' })).toHaveClass('bg-accent');
    const busy = screen.getByRole('button', { name: 'Duplicating…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps its status region mounted and empty until there is something to say', () => {
    const { rerender } = render(
      <MemoryRouter>
        <DetailHeader title="Pizza EMEA map" />
      </MemoryRouter>,
    );
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    // Empty, it is taken out of the flow (sr-only), so the header adds no gap for it.
    expect(region).toHaveClass('empty:sr-only');
    rerender(
      <MemoryRouter>
        <DetailHeader title="Pizza EMEA map" status="Unsaved changes" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Unsaved changes');
  });

  it('takes a heading of its own (an editable name) and the page’s one control', () => {
    render(
      <MemoryRouter>
        <DetailHeader title="Pizza EMEA map" heading={<h1>Editable</h1>} control={<button type="button" role="switch" aria-checked="true">On</button>} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Editable' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('switch').closest('[data-part="actions"]')).not.toBeNull();
  });

  it('says so in development when a control and two actions would show three', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <DetailHeader title="Onboarding" control={<button type="button">On track</button>} actions={[EDIT, SURVEY]} />
      </MemoryRouter>,
    );
    expect(error).toHaveBeenCalledWith('DetailHeader: at most two visible controls');
  });
});
