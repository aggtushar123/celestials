import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersPanel } from './FiltersPanel';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

function renderPanel(search = '', isSm = true) {
  const props = {
    params: parseParams(new URLSearchParams(search)),
    update: vi.fn(),
    options: FILTER_OPTIONS,
    isSm,
    onClose: vi.fn(),
    onExport: vi.fn(),
    exporting: false,
    onAdd: vi.fn(),
  };
  render(<FiltersPanel {...props} />);
  return props;
}

describe('FiltersPanel', () => {
  it('filters by health, lifecycle and product with checkboxes', async () => {
    const { update } = renderPanel('health=average');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Poor' }));
    expect(update).toHaveBeenLastCalledWith({ health: ['average', 'poor'] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Average' }));
    expect(update).toHaveBeenLastCalledWith({ health: [] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Live' }));
    expect(update).toHaveBeenLastCalledWith({ lifecycle: ['live'] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hiring' }));
    expect(update).toHaveBeenLastCalledWith({ product: ['1'] });
  });

  it('filters by owner from the server options, Unassigned included once', async () => {
    const { update } = renderPanel();
    const owner = screen.getByRole('combobox', { name: 'Owner' });
    expect(screen.getAllByRole('option', { name: 'Unassigned' })).toHaveLength(1);
    await userEvent.selectOptions(owner, 'unassigned');
    expect(update).toHaveBeenLastCalledWith({ owner: 'unassigned' });
  });

  it('filters by renewal window, NPS band and churned', async () => {
    const { update } = renderPanel();
    await userEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(update).toHaveBeenLastCalledWith({ renews_within: '90' });
    await userEvent.click(screen.getByRole('radio', { name: 'Detractors' }));
    expect(update).toHaveBeenLastCalledWith({ nps: 'detractor' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include churned' }));
    expect(update).toHaveBeenLastCalledWith({ include_churned: true });
  });

  it('closes on Escape', async () => {
    const { onClose } = renderPanel();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('is a modal bottom sheet on phones, holding group, sort, export and add', async () => {
    const { update, onExport, onAdd } = renderPanel('', false);
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'owner');
    expect(update).toHaveBeenLastCalledWith({ group: 'owner' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name');
    expect(update).toHaveBeenLastCalledWith({ sort: '-name' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('keeps group and sort out of the desktop popover (the toolbar has them)', () => {
    renderPanel('', true);
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Filters' })).not.toHaveAttribute('aria-modal');
  });

  it('focuses the owner select first, not the close button', () => {
    renderPanel();
    expect(screen.getByRole('combobox', { name: 'Owner' })).toHaveFocus();
  });

  it('closes on an outside click but not on its trigger', async () => {
    const onClose = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = 'Filters';
    document.body.appendChild(trigger);
    render(
      <FiltersPanel
        params={parseParams(new URLSearchParams())}
        update={vi.fn()}
        options={FILTER_OPTIONS}
        isSm
        onClose={onClose}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
        triggerRef={{ current: trigger }}
      />,
    );
    await userEvent.click(trigger);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    document.body.removeChild(trigger);
  });

  it('does not force focus back to the trigger when closed by an outside click (the user moved focus on purpose)', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Filters';
    document.body.appendChild(trigger);
    const { unmount } = render(
      <FiltersPanel
        params={parseParams(new URLSearchParams())}
        update={vi.fn()}
        options={FILTER_OPTIONS}
        isSm
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
        triggerRef={{ current: trigger }}
      />,
    );
    await userEvent.click(document.body);
    unmount();
    expect(trigger).not.toHaveFocus();
    document.body.removeChild(trigger);
  });

  it('restores focus to the trigger when closed via Escape', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Filters';
    document.body.appendChild(trigger);
    const { unmount } = render(
      <FiltersPanel
        params={parseParams(new URLSearchParams())}
        update={vi.fn()}
        options={FILTER_OPTIONS}
        isSm
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
        triggerRef={{ current: trigger }}
      />,
    );
    await userEvent.keyboard('{Escape}');
    unmount();
    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });
});
