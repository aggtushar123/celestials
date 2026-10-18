import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kpi, KpiStrip } from './Kpi';

describe('Kpi', () => {
  it('renders label, figure in the mono face, and detail', () => {
    render(<Kpi label="ARR today" value="$688.6K" detail="9 accounts" />);
    expect(screen.getByText('ARR today')).toBeInTheDocument();
    const figure = screen.getByText('$688.6K');
    expect(figure.className).toContain('font-mono-brand');
    expect(figure.className).toContain('tabular-nums');
    expect(screen.getByText('9 accounts')).toBeInTheDocument();
  });

  it('colours only the figure, and only for loss or gain', () => {
    render(<Kpi label="At risk" value="$114.5K" tone="loss" />);
    expect(screen.getByText('$114.5K').className).toContain('text-danger');
    render(<Kpi label="Expansion" value="$31K" tone="gain" />);
    expect(screen.getByText('$31K').className).toContain('text-success');
  });

  it('has no coloured left border', () => {
    const { container } = render(<Kpi label="x" value="1" tone="loss" />);
    expect(container.innerHTML).not.toMatch(/border-l-(danger|success|info)/);
  });

  it('a drillable figure keeps its detail as the button\'s description and holds only phrasing content', () => {
    render(<Kpi label="At risk" value="$114.5K" detail="weighted churn and contraction" onDrill={() => {}} />);
    const button = screen.getByRole('button', { name: 'At risk $114.5K, show accounts' });
    expect(button).toHaveAccessibleDescription('weighted churn and contraction');
    expect(button.querySelector('div')).toBeNull();
    expect(screen.getByText('weighted churn and contraction')).toBeVisible();
  });

  it('a drillable figure with no detail has no description', () => {
    render(<Kpi label="At risk" value="$114.5K" onDrill={() => {}} />);
    const button = screen.getByRole('button', { name: 'At risk $114.5K, show accounts' });
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('KpiStrip lays out children in a list', () => {
    render(
      <KpiStrip>
        <Kpi label="a" value="1" />
        <Kpi label="b" value="2" />
      </KpiStrip>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('KpiStrip drops a conditionally-absent child instead of rendering an empty item', () => {
    const showThird = false;
    render(
      <KpiStrip>
        <Kpi label="a" value="1" />
        <Kpi label="b" value="2" />
        {showThird && <Kpi label="c" value="3" />}
      </KpiStrip>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('KpiStrip lays a three-figure strip out in three columns, not four with a gap', () => {
    const { container } = render(
      <KpiStrip columns={3}>
        <Kpi label="a" value="1" />
        <Kpi label="b" value="2" />
        <Kpi label="c" value="3" />
      </KpiStrip>,
    );
    const list = container.querySelector('ul')!;
    expect(list.className).toContain('md:grid-cols-3');
    expect(list.className).not.toContain('md:grid-cols-4');
  });

  it('becomes a button with a full accessible name when drillable', async () => {
    const onDrill = vi.fn();
    render(<Kpi label="At risk" value="$114.5K" onDrill={onDrill} />);
    const button = screen.getByRole('button', { name: 'At risk $114.5K, show accounts' });
    await userEvent.click(button);
    expect(onDrill).toHaveBeenCalledWith(button);
  });

  it('stays a plain figure without onDrill', () => {
    render(<Kpi label="NRR" value="99.6%" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('dashboard Tile guard', () => {
  it('no dashboard view defines its own Tile', () => {
    const modules = import.meta.glob('../tabs/**/*.tsx', {
      query: '?raw',
      eager: true,
      import: 'default',
    }) as Record<string, string>;

    const offenders = Object.entries(modules)
      .filter(([file]) => !file.endsWith('.test.tsx'))
      .filter(([, source]) => /function Tile\(/.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});
