import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BarChart, Bar, XAxis, YAxis } from 'recharts';
import {
  axisLabel,
  AXIS_TICK,
  AXIS_BASE,
  CHART_MARGIN,
  chartMargin,
  moneyTick,
  pctTick,
  dateTick,
  truncate,
  truncTick,
  wrapTick,
  categoryAxis,
  wrapLabel,
  zeroMoney,
} from './chartAxis';
import { formatCompactMoney } from '../../../features/customers/formatters';

describe('axisLabel', () => {
  it('lays a left title along the axis, rotated, in the secondary ink', () => {
    expect(axisLabel('Accounts')).toEqual({
      value: 'Accounts',
      position: 'left',
      angle: -90,
      offset: 10,
      fill: 'var(--text-secondary)',
      fontSize: 11,
      textAnchor: 'middle',
    });
  });

  it('sets the x title flat under the axis and the right title the other way round', () => {
    expect(axisLabel('Month', 'x')).toMatchObject({ position: 'bottom', angle: 0, offset: 4 });
    expect(axisLabel('ARR', 'right')).toMatchObject({ position: 'right', angle: 90, offset: 10 });
  });
});

// Renders a real chart: the title must land in the margin `chartMargin`
// reserves, outside the tick band, never over the tick numbers.
describe('axis titles in a real chart', () => {
  const data = [
    { month: 'Jan', value: 1200 },
    { month: 'Feb', value: 900 },
  ];
  const drawn = () =>
    render(
      <BarChart width={400} height={240} data={data} margin={chartMargin({ left: true, x: true })}>
        <XAxis {...AXIS_BASE} dataKey="month" label={axisLabel('Month', 'x')} />
        <YAxis {...AXIS_BASE} width={38} label={axisLabel('Accounts')} />
        <Bar dataKey="value" isAnimationActive={false} />
      </BarChart>,
    ).container;

  const title = (container: HTMLElement, text: string) =>
    [...container.querySelectorAll('text')].find((node) => node.textContent === text)!;

  it('puts the y title left of every y tick, inside the chart', () => {
    const container = drawn();
    const ticks = [...container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')];
    expect(ticks.length).toBeGreaterThan(0);
    const labelX = Number(title(container, 'Accounts').getAttribute('x'));
    // Ticks are end-anchored at their x; the rotated title is centred on its
    // x, so half its 11px line sits either side.
    const tickRight = Math.min(...ticks.map((tick) => Number(tick.getAttribute('x'))));
    const widestTick = Math.max(...ticks.map((tick) => (tick.textContent ?? '').length)) * 6;
    expect(labelX + 5.5).toBeLessThan(tickRight - widestTick);
    expect(labelX - 5.5).toBeGreaterThan(0);
  });

  it('puts the x title below every x tick, inside the chart', () => {
    const container = drawn();
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')];
    expect(ticks.length).toBeGreaterThan(0);
    const labelY = Number(title(container, 'Month').getAttribute('y'));
    const tickY = Math.max(...ticks.map((tick) => Number(tick.getAttribute('y'))));
    expect(labelY).toBeGreaterThan(tickY);
    expect(labelY).toBeLessThan(240);
  });
});

describe('axis defaults', () => {
  it('never draws a tick under 10px', () => {
    expect(AXIS_TICK.fontSize).toBeGreaterThanOrEqual(10);
    expect(AXIS_TICK.fill).toMatch(/^var\(--/);
    expect(AXIS_BASE).toMatchObject({ axisLine: false, tickLine: false, tick: AXIS_TICK });
  });

  it('has no negative margin anywhere', () => {
    for (const side of Object.values(CHART_MARGIN)) expect(side).toBeGreaterThanOrEqual(0);
  });

  it('chartMargin reserves room for the titles it is told about, and only those', () => {
    expect(chartMargin()).toEqual(CHART_MARGIN);
    const withTitles = chartMargin({ x: true, left: true });
    expect(withTitles.bottom).toBeGreaterThan(CHART_MARGIN.bottom);
    expect(withTitles.left).toBeGreaterThan(CHART_MARGIN.left);
    expect(withTitles.right).toBe(CHART_MARGIN.right);
    expect(chartMargin({ right: true }).right).toBeGreaterThan(CHART_MARGIN.right);
  });
});

describe('tick formatters', () => {
  it('money reuses the compact money format', () => {
    expect(moneyTick('USD')(1_800_000)).toBe('$1.8M');
    expect(moneyTick('USD')(450_000)).toBe(formatCompactMoney(450_000, 'USD'));
  });

  it('percent appends the sign', () => expect(pctTick(42)).toBe('42%'));

  it('date reads a day as "1 Sep" and a month as "Sep \'26"', () => {
    expect(dateTick('2026-09-01')).toBe('1 Sep');
    expect(dateTick('2026-09')).toBe("Sep '26");
    expect(dateTick('2026-12-31T10:00:00Z')).toBe('31 Dec');
  });

  it('reads the backend\'s pre-formatted month and week labels too', () => {
    expect(dateTick('Aug 2026')).toBe("Aug '26");
    expect(dateTick('Jun 15, 2025')).toBe('15 Jun');
    expect(dateTick('Sep 1, 2026')).toBe('1 Sep');
  });

  it('date leaves anything it cannot read alone', () => expect(dateTick('Q3')).toBe('Q3'));
});

describe('truncTick', () => {
  it('truncate keeps short names and shortens long ones with an ellipsis', () => {
    expect(truncate('Support', 14)).toBe('Support');
    expect(truncate('Implementation services', 14)).toBe('Implementatio…');
    expect(truncate('Implementation services', 14)).toHaveLength(14);
  });

  it('draws the short name and keeps the full one in a <title>', () => {
    const Tick = truncTick(10);
    const { container } = render(
      <svg>
        <Tick x={40} y={20} payload={{ value: 'Customer success operations' }} textAnchor="end" />
      </svg>,
    );
    const text = container.querySelector('text')!;
    expect(text).toHaveAttribute('x', '40');
    expect(text).toHaveAttribute('text-anchor', 'end');
    expect(text).toHaveAttribute('font-size', String(AXIS_TICK.fontSize));
    expect(text.querySelector('title')!.textContent).toBe('Customer success operations');
    expect(text.textContent).toContain('Customer …');
  });

  it('adds no <title> when nothing was cut', () => {
    const Tick = truncTick();
    const { container } = render(
      <svg>
        <Tick x={0} y={0} payload={{ value: 'Email' }} />
      </svg>,
    );
    expect(container.querySelector('title')).toBeNull();
    expect(container.querySelector('text')!.textContent).toBe('Email');
  });

  it('can slant an x-axis name, rotating about its own anchor and hanging below the axis', () => {
    const Tick = truncTick(14, -35);
    const { container } = render(
      <svg>
        <Tick x={80} y={200} payload={{ value: 'Globex International Holdings' }} textAnchor="middle" />
      </svg>,
    );
    const text = container.querySelector('text')!;
    expect(text).toHaveAttribute('transform', 'rotate(-35, 80, 200)');
    // A slanted name ends at its tick, whatever anchor the axis asked for.
    expect(text).toHaveAttribute('text-anchor', 'end');
    expect(text).toHaveAttribute('dy', '0.71em');
    expect(text.querySelector('title')!.textContent).toBe('Globex International Holdings');
  });
});

describe('wrapLabel', () => {
  it('keeps a name that fits on one line whole', () => {
    expect(wrapLabel('Analytics Suite', 20, 2)).toEqual({ lines: ['Analytics Suite'], cut: false });
  });

  it('wraps on word boundaries onto a second line', () => {
    expect(wrapLabel('Workflow Automation', 12, 2)).toEqual({ lines: ['Workflow', 'Automation'], cut: false });
  });

  it('cuts the last allowed line with an ellipsis when the name runs past it', () => {
    const { lines, cut } = wrapLabel('Globex International Holdings Group', 12, 2);
    expect(cut).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines[1].length).toBeLessThanOrEqual(12);
  });

  it('hard-cuts a single word longer than the line', () => {
    expect(wrapLabel('Supercalifragilistic', 8, 1)).toEqual({ lines: ['Superca…'], cut: true });
  });

  it('breaks the line at a newline even when both parts would fit on one', () => {
    expect(wrapLabel('Low\n25–50%', 20, 2)).toEqual({ lines: ['Low', '25–50%'], cut: false });
  });
});

describe('categoryAxis', () => {
  const Tick = (count: number) => categoryAxis(count).tick;
  const draw = (count: number, width: number, name: string) => {
    const T = Tick(count);
    const { height } = categoryAxis(count);
    return render(
      <svg>
        <T x={100} y={10} width={width} height={height} visibleTicksCount={count} payload={{ value: name }} />
      </svg>,
    ).container.querySelector('text')!;
  };

  it('reserves two lines for a few categories and three for many', () => {
    expect(categoryAxis(5)).toMatchObject({ interval: 0, height: 38 });
    expect(categoryAxis(9)).toMatchObject({ interval: 0, height: 50 });
  });

  it('draws full names flat, centred on the band, when the band is wide enough', () => {
    const text = draw(5, 1400, 'Workflow Automation');
    expect(text).not.toHaveAttribute('transform');
    expect(text).toHaveAttribute('text-anchor', 'middle');
    expect(text.textContent).toBe('Workflow Automation');
    expect(text.querySelector('title')).toBeNull();
    expect(text).toHaveAttribute('font-size', '10');
  });

  it('wraps a long name onto a second line in a moderately wide band', () => {
    const text = draw(9, 900, 'Globex International');
    const lines = [...text.querySelectorAll('tspan')].map((t) => t.textContent);
    expect(lines).toEqual(['Globex', 'International']);
  });

  it('slants and shortens only when the band is too narrow for flat text', () => {
    const text = draw(9, 360, 'Globex International Holdings');
    expect(text.getAttribute('transform')).toMatch(/^rotate\(-35/);
    expect(text).toHaveAttribute('text-anchor', 'end');
    expect(text.querySelector('title')!.textContent).toBe('Globex International Holdings');
  });

  it('draws a two-part name on two lines, and slants it as one line with its full name kept', () => {
    const flat = draw(5, 1400, 'At capacity\n90–100%');
    expect([...flat.querySelectorAll('tspan')].map((t) => t.textContent)).toEqual(['At capacity', '90–100%']);
    const slanted = draw(9, 200, 'At capacity\n90–100%');
    expect(slanted.querySelector('title')!.textContent).toBe('At capacity 90–100%');
  });

  it('keeps a short name flat in a narrow band it still fits in', () => {
    // A 1–5 score or a "Low" band fits a 44px band as it is; slanting it
    // only makes it harder to read.
    for (const name of ['3', 'Low']) {
      const text = draw(5, 220, name);
      expect(text).not.toHaveAttribute('transform');
      expect(text.textContent).toBe(name);
    }
  });
});

describe('zeroMoney', () => {
  it('prints zero without a decimal', () => {
    expect(zeroMoney('USD')).toBe('$0');
  });
});

describe('wrapTick', () => {
  const draw = (value: string, perLine = 20) => {
    const Tick = wrapTick(perLine);
    return render(
      <svg>
        <Tick x={120} y={50} payload={{ value }} />
      </svg>,
    ).container.querySelector('text')!;
  };

  it('keeps a short name on one line, centred on its row', () => {
    const text = draw('Billing');
    expect(text).toHaveAttribute('text-anchor', 'end');
    expect(text).toHaveAttribute('font-size', String(AXIS_TICK.fontSize));
    expect([...text.querySelectorAll('tspan')].map((t) => t.textContent)).toEqual(['Billing']);
    expect(text.querySelector('tspan')).toHaveAttribute('dy', '0.355em');
    expect(text.querySelector('title')).toBeNull();
  });

  it('wraps a longer name onto a second line instead of cutting it', () => {
    const text = draw('Integration Support Requests');
    expect([...text.querySelectorAll('tspan')].map((t) => t.textContent)).toEqual([
      'Integration Support',
      'Requests',
    ]);
    expect(text.querySelector('title')).toBeNull();
  });

  it('cuts only past two lines, keeping the whole name in a <title>', () => {
    const long = 'Contract Renewal Negotiation And Pricing Questions';
    const text = draw(long);
    expect(text.querySelectorAll('tspan')).toHaveLength(2);
    expect(text.querySelector('title')!.textContent).toBe(long);
  });
});
