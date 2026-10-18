import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ChartLegend } from './ChartLegend';
import { HEALTH_LEGEND, HEALTH_COLORS, ROLE } from './chartPalette';

describe('ChartLegend', () => {
  it('is a list with one item per series, label and value readable', () => {
    render(
      <ChartLegend
        items={[
          { label: 'Good', color: ROLE.gain, value: '12' },
          { label: 'Poor', color: ROLE.loss },
        ]}
      />,
    );
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Good, 12');
    expect(within(items[0]).getByText('12')).toHaveClass('font-mono-brand', 'tabular-nums');
    expect(items[1]).toHaveTextContent('Poor');
  });

  it('wraps, at 11px, starting from the left by default', () => {
    render(<ChartLegend items={[{ label: 'A', color: ROLE.ink }]} />);
    expect(screen.getByRole('list')).toHaveClass('flex', 'flex-wrap', 'text-[11px]', 'justify-start');
  });

  it('can centre or end-align', () => {
    const { rerender } = render(<ChartLegend items={[{ label: 'A', color: ROLE.ink }]} align="center" />);
    expect(screen.getByRole('list')).toHaveClass('justify-center');
    rerender(<ChartLegend items={[{ label: 'A', color: ROLE.ink }]} align="end" />);
    expect(screen.getByRole('list')).toHaveClass('justify-end');
  });

  const swatch = (label: string) =>
    screen.getByText(label).closest('li')!.querySelector('[aria-hidden="true"]') as HTMLElement;

  it('draws each kind of swatch in the series colour, hidden from screen readers', () => {
    render(
      <ChartLegend
        items={[
          { label: 'Bar', color: ROLE.ink },
          { label: 'Trend', color: ROLE.muted, kind: 'line' },
          { label: 'Target', color: ROLE.faint, kind: 'outline' },
          { label: 'Forecast', color: ROLE.caution, kind: 'dashed' },
        ]}
      />,
    );
    expect(swatch('Bar')).toHaveClass('size-2');
    expect(swatch('Bar').style.backgroundColor).toBe('var(--text-primary)');
    expect(swatch('Trend').style.backgroundColor).toBe('var(--text-secondary)');
    expect(swatch('Trend')).toHaveClass('h-0.5');
    expect(swatch('Target').style.borderColor).toBe('var(--text-tertiary)');
    expect(swatch('Target').style.backgroundColor).toBe('');
    expect(swatch('Forecast')).toHaveClass('border-dashed');
    expect(swatch('Forecast').style.borderColor).toBe('var(--warning)');
  });

  it('renders nothing for no items', () => {
    const { container } = render(<ChartLegend items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('health legend', () => {
  it('names the three statuses best first, in their semantic tokens', () => {
    expect(HEALTH_LEGEND.map((item) => item.label)).toEqual(['Good', 'Average', 'Poor']);
    expect(HEALTH_COLORS).toEqual({ Good: 'var(--success)', Average: 'var(--warning)', Poor: 'var(--danger)' });
    for (const item of HEALTH_LEGEND) expect(item.color).toBe(HEALTH_COLORS[item.label as keyof typeof HEALTH_COLORS]);
  });
});
