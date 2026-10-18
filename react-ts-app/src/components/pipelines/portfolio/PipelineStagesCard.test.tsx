import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OPPORTUNITIES_KIND, RISKS_KIND } from '../../../features/pipelines/pipelineKinds';
import type { PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineSummary } from '../../../features/pipelines/pipelineTypes';
import { resetViewport, setViewport } from '../../../test/viewport';
import { PipelineStagesCard } from './PipelineStagesCard';

const kind = OPPORTUNITIES_KIND;
const stages = kind.openStages.map((value, index) => ({
  value,
  label: kind.stages.find((stage) => stage.value === value)!.label,
  count: index,
  mrr: index * 1000,
}));
const summary = { stages } as unknown as PipelineSummary;
const params = { stage: [] } as unknown as PipelineParams;

describe('PipelineStagesCard (UI foundations spec §4.3: more than three rows leave the tile row)', () => {
  afterEach(resetViewport);

  it('lists every open stage, empty ones included, each a stage filter, in one card', async () => {
    setViewport(1440);
    const onFilter = vi.fn();
    render(<PipelineStagesCard kind={kind} summary={summary} params={params} onFilter={onFilter} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Stages' })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(stages.length);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(buttons[0]);
    expect(onFilter).toHaveBeenCalledWith({ stage: [stages[0].value] });
    expect(buttons[0].closest('section')).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
  });

  it('starts folded behind its title on a phone', () => {
    setViewport(390);
    render(<PipelineStagesCard kind={kind} summary={summary} params={params} onFilter={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Stages' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('draws nothing for a kind with one open stage (Risks: the Open tile says it)', () => {
    const risks = RISKS_KIND;
    const { container } = render(
      <PipelineStagesCard kind={risks} summary={{ stages: [{ value: 'open', label: 'Open', count: 3, mrr: 0 }] } as unknown as PipelineSummary} params={params} onFilter={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
