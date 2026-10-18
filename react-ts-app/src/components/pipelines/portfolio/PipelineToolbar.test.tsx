import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PIPELINE_KINDS } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams, type PipelineView } from '../../../features/pipelines/pipelineParams';
import { PIPELINE_FILTER_OPTIONS } from '../../../features/pipelines/testPipelines';
import { setViewport } from '../../../test/viewport';
import { PipelineToolbar } from './PipelineToolbar';

const OPTIONS = { ...PIPELINE_FILTER_OPTIONS, stages: [] };
const OPEN = ['discovery', 'qualification', 'solution_validation', 'proposal_price_review', 'negotiation'];

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderToolbar(
  query = '',
  { view = 'list', isSm = true, count = '14 opportunities' }: { view?: PipelineView; isSm?: boolean; count?: string } = {},
) {
  setViewport(isSm ? 1440 : 390);
  const update = vi.fn();
  const onExport = vi.fn();
  const onAdd = vi.fn();
  const onToggleSelectMode = vi.fn();
  const params = parsePipelineParams(new URLSearchParams(query));
  function Harness() {
    const searchRef = useRef<HTMLInputElement>(null);
    return (
      <PipelineToolbar
        kind={PIPELINE_KINDS[params.kind]}
        view={view}
        params={params}
        update={update}
        options={OPTIONS}
        isSm={isSm}
        onExport={onExport}
        exporting={false}
        onAdd={onAdd}
        searchRef={searchRef}
        onToggleSelectMode={onToggleSelectMode}
        count={count}
      />
    );
  }
  render(
    <MemoryRouter initialEntries={[`/pipelines/${view}${query ? `?${query}` : ''}`]}>
      <Harness />
      <Where />
    </MemoryRouter>,
  );
  return { update, onExport, onAdd, onToggleSelectMode };
}

const dialog = () => screen.getByRole('dialog', { name: 'Filters' });

describe('PipelineToolbar (spec §1 "Toolbar")', () => {
  it('searches titles and organisation or account names, 300ms after typing stops', async () => {
    const { update } = renderToolbar();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by title, organization or account' }), 'emea');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ search: 'emea' }));
  });

  it("offers the kind's groups and sorts, and Export and Add from sm", async () => {
    const { update, onAdd } = renderToolbar();
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'None',
      'Stage',
      'Close month',
      'Organization or account',
      'Owner',
      'Department',
      'Priority',
    ]);
    expect(within(screen.getByRole('combobox', { name: 'Sort by' })).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'MRR',
      'Close date',
      'Priority',
      'Stage',
      'Title',
    ]);
    await userEvent.selectOptions(group, 'month');
    expect(update).toHaveBeenCalledWith({ group: 'month' });
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('filters by owner (with Not in your book), organisation, account, priority, department and date', async () => {
    const { update } = renderToolbar('owner=2&date=30');
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('2');
    const owner = within(dialog()).getByRole('combobox', { name: 'Owner' });
    expect(owner).toHaveFocus();
    expect(within(owner).getAllByRole('option').map((option) => option.textContent)).toEqual(['Everyone', 'Carl CSM', 'Priya', 'Not in your book', 'Unassigned']);
    await userEvent.selectOptions(owner, 'outside');
    expect(update).toHaveBeenLastCalledWith({ owner: 'outside' });
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Pizza Hut' }));
    expect(update).toHaveBeenLastCalledWith({ organisation: ['7'] });
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Pizza Hut EMEA' }));
    expect(update).toHaveBeenLastCalledWith({ account: ['12'] });
    await userEvent.click(within(within(dialog()).getByRole('group', { name: 'Priority' })).getByRole('checkbox', { name: 'High' }));
    expect(update).toHaveBeenLastCalledWith({ priority: ['high'] });
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Whole company' }));
    expect(update).toHaveBeenLastCalledWith({ department: ['none'] });
    const closes = within(dialog()).getByRole('group', { name: 'Closes' });
    expect(within(closes).getByRole('radio', { name: 'Within 30 days' })).toBeChecked();
    await userEvent.click(within(closes).getByRole('radio', { name: 'Overdue' }));
    expect(update).toHaveBeenLastCalledWith({ date: 'overdue' });
  });

  it('shows the open stages checked on the List; a closed stage is opt-in', async () => {
    const { update } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const stages = within(dialog()).getByRole('group', { name: 'Stage' });
    expect(within(stages).getByRole('checkbox', { name: 'Negotiation' })).toBeChecked();
    expect(within(stages).getByRole('checkbox', { name: 'Closed Won' })).not.toBeChecked();
    await userEvent.click(within(stages).getByRole('checkbox', { name: 'Closed Won' }));
    expect(update).toHaveBeenLastCalledWith({ stage: [...OPEN, 'closed_won'] });
    await userEvent.click(within(stages).getByRole('checkbox', { name: 'Discovery' }));
    expect(update).toHaveBeenLastCalledWith({ stage: OPEN.slice(1) });
  });

  it('shows every stage checked on the Board, whose groups have no None', async () => {
    const { update } = renderToolbar('', { view: 'board' });
    expect(within(screen.getByRole('combobox', { name: 'Group' })).queryByRole('option', { name: 'None' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const stages = within(dialog()).getByRole('group', { name: 'Stage' });
    expect(within(stages).getByRole('checkbox', { name: 'Closed Lost' })).toBeChecked();
    await userEvent.click(within(stages).getByRole('checkbox', { name: 'Closed Lost' }));
    expect(update).toHaveBeenLastCalledWith({ stage: [...OPEN, 'closed_won'] });
  });

  it('puts group, sort, Export and Add in the phone sheet, with a Select toggle in the bar', async () => {
    const { onExport, onToggleSelectMode } = renderToolbar('kind=risks', { isSm: false });
    expect(screen.queryByRole('combobox', { name: 'Group' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(onToggleSelectMode).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog()).getByRole('combobox', { name: 'Group' })).toBeInTheDocument();
    expect(within(dialog()).getByRole('group', { name: 'Due' })).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Add risk' })).toHaveClass('min-h-11');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('is the one toolbar: the kind leads, then search and count, filters, Export and the primary last', () => {
    renderToolbar();
    const kind = screen.getByRole('group', { name: 'Opportunities or risks' });
    expect(within(kind).getByRole('button', { name: 'Opportunities' })).toHaveAttribute('aria-pressed', 'true');
    expect(kind.closest('[data-part="toolbar-lead"]')).not.toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Search by title, organization or account' });
    expect(search).toHaveAttribute('placeholder', 'Search pipelines');
    expect(screen.getByRole('status')).toHaveTextContent('14 opportunities');
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim());
    expect(names.slice(-2)).toEqual(['Export', 'Add opportunity']);
    expect(screen.getByRole('button', { name: 'Add opportunity' })).toHaveClass('bg-accent');
    expect(screen.getByLabelText('Sort by').closest('.shrink-0')).not.toBeNull();
  });

  it('switches the kind in the URL, keeping the shared filters', async () => {
    renderToolbar('owner=7');
    await userEvent.click(screen.getByRole('button', { name: 'Risks' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pipelines/list?owner=7&kind=risks');
  });

  it('offers the Select toggle from sm too, so selection starts at every width', async () => {
    const { onToggleSelectMode } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(onToggleSelectMode).toHaveBeenCalledOnce();
  });

  it('keeps Add and Export in the Filters sheet on a phone, the kind switch still leading', () => {
    renderToolbar('', { isSm: false });
    expect(screen.queryByRole('button', { name: 'Add opportunity' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Opportunities or risks' })).toBeInTheDocument();
  });
});
