import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionBar, type BulkReport } from './SelectionBar';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

function renderBar(count: number, report: BulkReport | null = null, activity: 'applying' | 'exporting' | null = null, loading = false) {
  const props = {
    count,
    owners: FILTER_OPTIONS.owners,
    lifecycles: FILTER_OPTIONS.lifecycles,
    activity,
    loading,
    report,
    onSetOwner: vi.fn(),
    onSetLifecycle: vi.fn(),
    onExport: vi.fn(),
    onArchive: vi.fn(),
    onChurn: vi.fn(),
    onClose: vi.fn(),
  };
  const view = render(<SelectionBar {...props} />);
  return { ...props, ...view };
}

describe('SelectionBar', () => {
  it('renders no bar with no selection and no report, but keeps its live regions mounted', () => {
    renderBar(0);
    expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('announces the selected count in a region that stays mounted as it changes', () => {
    const view = renderBar(0);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    view.rerender(<SelectionBar {...view} count={2} />);
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('2 selected');
    view.rerender(<SelectionBar {...view} count={3} />);
    expect(status).toHaveTextContent('3 selected');
  });

  it('choosing an owner only arms Apply; Apply runs it with the count (Unassigned sends null)', async () => {
    const { onSetOwner } = renderBar(12);
    const owner = screen.getByRole('combobox', { name: 'Change owner' });
    await userEvent.selectOptions(owner, '3');
    expect(onSetOwner).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 12' }));
    expect(onSetOwner).toHaveBeenCalledWith(3);
    expect(screen.queryByRole('button', { name: 'Apply to 12' })).not.toBeInTheDocument();
    expect(owner).toHaveValue('');

    await userEvent.selectOptions(owner, 'unassigned');
    screen.getByRole('button', { name: 'Apply to 12' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSetOwner).toHaveBeenLastCalledWith(null);
  });

  it('drops an armed choice when the selection empties', async () => {
    const view = renderBar(2);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), '3');
    expect(screen.getByRole('button', { name: 'Apply to 2' })).toBeInTheDocument();
    view.rerender(<SelectionBar {...view} count={0} />);
    view.rerender(<SelectionBar {...view} count={2} />);
    expect(screen.queryByRole('button', { name: 'Apply to 2' })).not.toBeInTheDocument();
  });

  it('does nothing while the keyboard arrows through a select', () => {
    const { onSetOwner, onSetLifecycle } = renderBar(3);
    const owner = screen.getByRole('combobox', { name: 'Change owner' });
    // A closed <select> fires change on every arrow press on Windows and Firefox.
    fireEvent.change(owner, { target: { value: '2' } });
    fireEvent.change(owner, { target: { value: '3' } });
    const stage = screen.getByRole('combobox', { name: 'Set lifecycle' });
    fireEvent.change(stage, { target: { value: 'adoption' } });
    fireEvent.change(stage, { target: { value: 'live' } });
    expect(onSetOwner).not.toHaveBeenCalled();
    expect(onSetLifecycle).not.toHaveBeenCalled();
    // One armed action at a time: the lifecycle choice replaced the owner one.
    expect(screen.getAllByRole('button', { name: 'Apply to 3' })).toHaveLength(1);
    expect(owner).toHaveValue('');
  });

  it('sets lifecycle through Apply, never offering churn', async () => {
    const { onSetLifecycle } = renderBar(2);
    const stage = screen.getByRole('combobox', { name: 'Set lifecycle' });
    expect(within(stage).queryByRole('option', { name: 'Churn' })).not.toBeInTheDocument();
    await userEvent.selectOptions(stage, 'live');
    expect(onSetLifecycle).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));
    expect(onSetLifecycle).toHaveBeenCalledWith('live');
  });

  it('moves focus to the report when an action completes, never leaving it on the page body', async () => {
    const view = renderBar(2);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));
    expect(document.activeElement).not.toBe(document.body);
    view.rerender(<SelectionBar {...view} count={0} report={{ updated: 2, failed: [] }} />);
    expect(screen.getByText('Updated 2 organizations.').closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('puts a request error in the alert region', () => {
    renderBar(1, { updated: 0, failed: [], error: 'Server down.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Server down.');
  });

  it('exports and archives; churn only for one account', async () => {
    const two = renderBar(2);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(two.onExport).toHaveBeenCalled();
    expect(two.onArchive).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
    two.unmount();

    const one = renderBar(1);
    await userEvent.click(screen.getByRole('button', { name: 'Churn' }));
    expect(one.onChurn).toHaveBeenCalled();
  });

  it('reports partial failures per account', () => {
    renderBar(1, { updated: 1, failed: [{ id: 1, name: 'Globex', reason: 'Not found.' }] });
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(bar).toHaveTextContent('Updated 1 organization. 1 failed:');
    expect(bar).toHaveTextContent('Globex: Not found.');
  });

  it('keeps the report after the selection empties, with a Dismiss', async () => {
    const { onClose } = renderBar(0, { updated: 2, failed: [] });
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('Updated 2 organizations.');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables actions while applying, and says so', () => {
    renderBar(2, null, 'applying');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Change owner' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('Applying…');
    expect(screen.getByRole('status')).toHaveTextContent('Applying…');
  });

  it('says Exporting, not Applying, while an export runs', () => {
    renderBar(2, null, 'exporting');
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('Exporting…');
    expect(screen.getByRole('region', { name: 'Selection' })).not.toHaveTextContent('Applying…');
  });

  it('disables actions while the list loads, without claiming to apply anything', () => {
    renderBar(1, null, null, true);
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Churn' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Set lifecycle' })).toBeDisabled();
    expect(screen.queryByText('Applying…')).not.toBeInTheDocument();
  });
});
