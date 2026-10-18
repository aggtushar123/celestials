import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PIPELINE_KINDS } from '../../../features/pipelines/pipelineKinds';
import { hasPipelineFilters, parsePipelineParams } from '../../../features/pipelines/pipelineParams';
import { pipelineQueries, stubPipelines } from '../../../features/pipelines/testPipelines';
import { PipelineSections } from './PipelineSections';
import { usePipelineBook } from './usePipelineBook';

function Harness({ query, onClear = vi.fn(), onAdd = vi.fn() }: { query: string; onClear?: () => void; onAdd?: () => void }) {
  const params = parsePipelineParams(new URLSearchParams(query));
  const kind = PIPELINE_KINDS[params.kind];
  const book = usePipelineBook(kind, params, 'list', 0);
  return (
    <PipelineSections
      kind={kind}
      params={params}
      version={0}
      book={book}
      currency="USD"
      filtered={hasPipelineFilters(params)}
      renderItem={(row) => <li key={row.id}>{row.title}</li>}
      onRowsLoaded={() => {}}
      onClearFilters={onClear}
      onAdd={onAdd}
    />
  );
}

describe('PipelineSections', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups by stage with each section counting its items and MRR, and reading its own rows', async () => {
    const spy = stubPipelines();
    render(<Harness query="" />);
    const negotiation = await screen.findByRole('button', { name: /^Negotiation/ });
    expect(negotiation).toHaveTextContent('Negotiation · 1 · $2.0K');
    expect(negotiation).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Discovery/ })).toHaveTextContent('Discovery · 1 · $300.0');
    expect(await screen.findByText('EMEA seats')).toBeInTheDocument();
    const column = pipelineQueries(spy, 'opportunities').find((query) => query.get('group_value') === 'negotiation');
    expect(column?.get('limit')).toBe('25');
    expect(column?.get('stage')).toBeNull();
  });

  it('lists flat with group=none', async () => {
    stubPipelines();
    render(<Harness query="group=none" />);
    expect(await screen.findByText('Globex uplift')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Opportunities list' })).toHaveClass('sr-only');
  });

  it('shows a loading state inside one card while the first read loads', () => {
    stubPipelines();
    render(<Harness query="kind=risks" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading risks');
    expect(status.closest('.rounded-xl')).not.toBeNull();
  });

  it('draws the flat list as one card with column labels', async () => {
    stubPipelines();
    render(<Harness query="group=none" />);
    const list = await screen.findByRole('list', { name: /list$/ });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'overflow-hidden');
    const labels = list.parentElement!.querySelector('[aria-hidden="true"].hidden')!;
    expect(labels).toHaveClass('@min-[60rem]:grid');
    expect(labels).toHaveTextContent('MRR');
  });

  it('says when filters match nothing, and when there is nothing open yet', async () => {
    stubPipelines({ opportunities: [], risks: [] });
    const onClear = vi.fn();
    const { unmount } = render(<Harness query="owner=2" onClear={onClear} />);
    expect(await screen.findByText('No opportunities match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
    unmount();
    const onAdd = vi.fn();
    render(<Harness query="kind=risks" onAdd={onAdd} />);
    expect(await screen.findByText('No open risks')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add risk' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('shows a failed first read with Try again', async () => {
    const spy = stubPipelines({ pipeline: () => ({ status: 500, body: { detail: 'Server error' } }) });
    render(<Harness query="" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(pipelineQueries(spy, 'opportunities')).toHaveLength(2));
  });
});
