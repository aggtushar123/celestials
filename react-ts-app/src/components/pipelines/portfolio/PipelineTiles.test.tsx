import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OPPORTUNITIES_KIND, RISKS_KIND } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams } from '../../../features/pipelines/pipelineParams';
import { OPPORTUNITY_ROWS, RISK_ROWS, buildPipelinePage } from '../../../features/pipelines/testPipelines';
import { PipelineTiles } from './PipelineTiles';

const OPPORTUNITIES = buildPipelinePage('opportunities', new URLSearchParams(), OPPORTUNITY_ROWS).summary;
const RISKS = buildPipelinePage('risks', new URLSearchParams(), RISK_ROWS).summary;

function renderTiles(query = '', kind = OPPORTUNITIES_KIND, summary = OPPORTUNITIES) {
  const onFilter = vi.fn();
  render(<PipelineTiles kind={kind} summary={summary} currency="USD" params={parsePipelineParams(new URLSearchParams(query))} onFilter={onFilter} />);
  return onFilter;
}

describe('PipelineTiles (spec §1 "Summary tiles")', () => {
  it("shows the open pipeline, closing, overdue and won-this-quarter figures over every filtered row", () => {
    renderTiles();
    const open = screen.getByRole('group', { name: 'Open pipeline' });
    expect(open).toHaveTextContent('3');
    expect(open).toHaveTextContent('$7.3K MRR');
    expect(within(open).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Closing within 30 days: 1' })).toHaveTextContent('$2.0K MRR');
    expect(screen.getByRole('button', { name: 'Overdue: 1' })).toHaveTextContent('$5.0K MRR');
    expect(screen.getByRole('button', { name: 'Won this quarter: 1' })).toHaveTextContent('$1.5K MRR');
  });

  it("sets each tile's filter (a controller ruling: Closing/Due pins the open stages too, since the backend's date=30|90 window has none of its own; Overdue's window already requires one)", async () => {
    const onFilter = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: 'Closing within 30 days: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: '30', stage: OPPORTUNITIES_KIND.openStages });
    await userEvent.click(screen.getByRole('button', { name: '90d' }));
    await userEvent.click(screen.getByRole('button', { name: 'Closing within 90 days: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: '90', stage: OPPORTUNITIES_KIND.openStages });
    await userEvent.click(screen.getByRole('button', { name: 'Overdue: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: 'overdue' });
    await userEvent.click(screen.getByRole('button', { name: 'Won this quarter: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ stage: ['closed_won'], changed: 'quarter' });
  });

  it('clears a pressed tile', async () => {
    const onFilter = renderTiles('stage=closed_won&changed=quarter&date=overdue');
    const won = screen.getByRole('button', { name: 'Won this quarter: 1' });
    expect(won).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(won);
    expect(onFilter).toHaveBeenLastCalledWith({ stage: [], changed: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Overdue: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: '' });
  });

  it('clears a pressed Closing tile back to no date and no stage pin', async () => {
    const onFilter = renderTiles(`date=30&stage=${OPPORTUNITIES_KIND.openStages.join(',')}`);
    const closing = screen.getByRole('button', { name: 'Closing within 30 days: 1' });
    expect(closing).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(closing);
    expect(onFilter).toHaveBeenLastCalledWith({ date: '', stage: [] });
  });

  it("does not show the Closing tile pressed when the URL's stage filter is not exactly its own pin", () => {
    renderTiles('date=30&stage=negotiation');
    expect(screen.getByRole('button', { name: 'Closing within 30 days: 1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it("words the risks' tiles", () => {
    renderTiles('kind=risks', RISKS_KIND, RISKS);
    expect(screen.getByRole('group', { name: 'MRR at risk' })).toHaveTextContent('$2.0K MRR');
    expect(screen.getByRole('button', { name: 'Due within 30 days: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mitigated this quarter: 1' })).toHaveTextContent('$600.0 MRR');
  });

  it('waits with a skeleton, and says when the summary could not load', () => {
    const { rerender } = render(
      <PipelineTiles kind={OPPORTUNITIES_KIND} summary={null} currency="USD" params={parsePipelineParams(new URLSearchParams())} onFilter={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading summary');
    rerender(
      <PipelineTiles kind={OPPORTUNITIES_KIND} summary={null} failed currency="USD" params={parsePipelineParams(new URLSearchParams())} onFilter={vi.fn()} />,
    );
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
  });

  it('draws four standard tiles in a container-sized row, and no Stages tile', () => {
    renderTiles();
    expect(screen.queryByRole('group', { name: 'Stages' })).toBeNull();
    const open = screen.getByRole('group', { name: OPPORTUNITIES_KIND.tiles.open });
    expect(open).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(open.parentElement).toHaveClass('@min-[50rem]:grid-cols-4', 'items-start');
    expect(screen.getByText(String(OPPORTUNITIES.open.count))).toHaveClass('text-[22px]', 'tabular-nums');
  });

  it('makes Closing a filter tile whose window switch sits outside its button', async () => {
    const onFilter = renderTiles();
    const button = screen.getByRole('button', { name: new RegExp(`^${OPPORTUNITIES_KIND.tiles.within} within 30 days`) });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toContainElement(screen.getByRole('group', { name: `${OPPORTUNITIES_KIND.tiles.within} window` }));
    await userEvent.click(button);
    expect(onFilter).toHaveBeenCalledWith({ date: '30', stage: [...OPPORTUNITIES_KIND.openStages] });
  });
});
