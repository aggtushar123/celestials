import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { HealthDataRow } from '../../../../../features/health/types';
import { healthRow, renderWithDrill } from '../testUtils';
import { sizeCharts } from '../../../../../test/chartSize';
import { CSMPulseBar } from './CSMPulseBar';
import { AIPulseBar } from './AIPulseBar';
import { HealthByOwnerStackedBar } from './HealthByOwnerStackedBar';
import { CurrentHealthDonut } from './CurrentHealthDonut';
import { AccountsByRenewalDateBar } from './AccountsByRenewalDateBar';
import { AccountHealthBySeats } from './AccountHealthBySeats';
import { HealthChangeOverTimeStacked } from './HealthChangeOverTimeStacked';
import { AccountHealthDetailTable } from './AccountHealthDetailTable';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts();

/** Each on-chart label's text; Recharts sets a multi-word label as one
 *  `<tspan>` per word. */
const totals = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-label-list text')].map((t) => {
    const words = [...t.querySelectorAll('tspan')].map((w) => w.textContent);
    return words.length > 0 ? words.join(' ') : t.textContent;
  });

const legendOf = (anchor: HTMLElement) =>
  within(anchor.closest('ul') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

function expectReadableTicks(container: HTMLElement) {
  const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
  expect(ticks.length).toBeGreaterThan(0);
  for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
}

describe.each([
  ['CSM', CSMPulseBar, 'csmPulseScore'],
  ['AI', AIPulseBar, 'aiPulseScore'],
] as const)('%s Pulse bar legend and axes', (name, Chart, field) => {
  const book: HealthDataRow[] = [
    healthRow({ id: '1', [field]: 3, healthStatus: 'Average' }),
    healthRow({ id: '2', [field]: 3, healthStatus: 'Poor' }),
    healthRow({ id: '3', [field]: 4, healthStatus: 'Good' }),
  ];

  it('keys the three health colours', () => {
    renderWithDrill(<Chart data={book} />);
    expect(legendOf(screen.getByText('Good'))).toEqual(['Good', 'Average', 'Poor']);
  });

  it('titles the score axis with its 1–5 scale', () => {
    renderWithDrill(<Chart data={book} />);
    expect(screen.getByText(`${name} Pulse (1–5)`)).toBeInTheDocument();
  });

  it('labels one total per score, and "0" on a score nobody holds', () => {
    const { container } = renderWithDrill(<Chart data={book} />);
    // Scores 1, 2 and 5 are empty; 3 holds two accounts and 4 one.
    expect(totals(container).sort()).toEqual(['0', '0', '0', '1', '2']);
  });

  it('keeps tick text at 10px or more', () => {
    const { container } = renderWithDrill(<Chart data={book} />);
    expectReadableTicks(container);
  });
});

describe('HealthByOwnerStackedBar legend and sizing', () => {
  const owner = (id: string, name: string, healthStatus: HealthDataRow['healthStatus']) =>
    healthRow({ id, owner: name, ownerKey: name, healthStatus });

  it('keys the three health colours with the shared legend', () => {
    renderWithDrill(<HealthByOwnerStackedBar data={[owner('1', 'Carl', 'Poor')]} />);
    expect(legendOf(screen.getByText('Good'))).toEqual(['Good', 'Average', 'Poor']);
  });

  it('prints a long owner name in full when the axis has room for it', () => {
    const { container } = renderWithDrill(
      <HealthByOwnerStackedBar data={[owner('1', 'Alexandra Montgomery', 'Poor')]} />,
    );
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')].map((t) => t.textContent);
    expect(ticks).toContain('Alexandra Montgomery');
  });

  it('puts each owner\'s total on its own bar, even an owner with no Good accounts', () => {
    const { container } = renderWithDrill(
      <HealthByOwnerStackedBar
        data={[owner('1', 'Carl', 'Poor'), owner('2', 'Carl', 'Poor'), owner('3', 'Dina', 'Good')]}
      />,
    );
    expect(totals(container)).toEqual(['2', '1']);
  });

  it('gives every owner a row of its own height instead of squashing them', () => {
    const many = Array.from({ length: 14 }, (_, i) => owner(String(i), `Owner ${i}`, 'Good'));
    renderWithDrill(<HealthByOwnerStackedBar data={many} />);
    const plot = screen.getByTestId('owner-plot');
    expect(parseInt(plot.style.height, 10)).toBeGreaterThanOrEqual(14 * 28);
    // The rows scroll inside the card rather than growing it without end.
    expect(screen.getByRole('region', { name: 'Health by owner' })).toHaveStyle({ maxHeight: '320px' });
  });
});

describe('CurrentHealthDonut legend', () => {
  const book = [
    healthRow({ id: '1', healthStatus: 'Good' }),
    healthRow({ id: '2', healthStatus: 'Good' }),
    healthRow({ id: '3', healthStatus: 'Poor' }),
  ];

  it('keys each status with its count, a zero included', () => {
    render(<CurrentHealthDonut data={book} activeFilter={null} onSegmentClick={() => {}} filteredCount={3} />);
    expect(legendOf(screen.getByText('Good'))).toEqual(['Good, 2', 'Average, 0', 'Poor, 1']);
  });

  it('draws no slice labels outside the ring, where a narrow card clips them', () => {
    const { container } = render(
      <CurrentHealthDonut data={book} activeFilter={null} onSegmentClick={() => {}} filteredCount={3} />,
    );
    expect(container.querySelector('.recharts-pie-labels')).toBeNull();
  });
});

describe('AccountsByRenewalDateBar legend and axes', () => {
  const at = (id: string, renewalDate: string, healthStatus: HealthDataRow['healthStatus']) =>
    healthRow({ id, renewalDate, healthStatus });
  const book = [at('1', 'Jul 1, 2026', 'Poor'), at('2', 'Jul 9, 2026', 'Poor'), at('3', 'Sep 2, 2026', 'Good')];

  it('keys the three health colours', () => {
    renderWithDrill(<AccountsByRenewalDateBar data={book} />);
    expect(legendOf(screen.getByText('Good'))).toEqual(['Good', 'Average', 'Poor']);
  });

  it('titles the month axis and writes each month with its year', () => {
    const { container } = renderWithDrill(<AccountsByRenewalDateBar data={book} />);
    expect(screen.getByText('Renewal month')).toBeInTheDocument();
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')].map((t) => t.textContent);
    expect(ticks).toEqual(["Jul '26", "Aug '26", "Sep '26"]);
  });

  it('puts each total on its own month and marks an empty month "0"', () => {
    const { container } = renderWithDrill(<AccountsByRenewalDateBar data={book} />);
    // July's two are Poor only, so Good and Average skip that column.
    expect(totals(container).sort()).toEqual(['0', '1', '2']);
  });

  it('keeps tick text at 10px or more', () => {
    const { container } = renderWithDrill(<AccountsByRenewalDateBar data={book} />);
    expectReadableTicks(container);
  });
});

describe('AccountHealthBySeats', () => {
  const book = [
    healthRow({ id: '1', healthStatus: 'Good', activeSeats: 20 }),
    healthRow({ id: '2', healthStatus: 'Poor', activeSeats: 1 }),
  ];

  it('says what each bar counts', () => {
    const { container } = render(<AccountHealthBySeats data={book} />);
    expect(totals(container)).toEqual(['1 seat', '20 seats']);
  });

  it('writes a large count grouped, on one line', () => {
    const { container } = render(<AccountHealthBySeats data={[healthRow({ id: '1', activeSeats: 2906 })]} />);
    const label = container.querySelector('.recharts-label-list text')!;
    expect(label.textContent).toBe('2,906 seats');
    expect(label.querySelectorAll('tspan')).toHaveLength(0);
  });

  it('titles both axes and keeps tick text at 10px or more', () => {
    const { container } = render(<AccountHealthBySeats data={book} />);
    expect(screen.getByText('Health status')).toBeInTheDocument();
    expect(screen.getByText('Active seats')).toBeInTheDocument();
    expectReadableTicks(container);
  });
});

describe('HealthChangeOverTimeStacked legend and axes', () => {
  const book = [
    healthRow({
      id: '1',
      history: [
        { month: 'Jan 31, 2026', status: 'Good' },
        { month: 'Feb 28, 2026', status: 'Poor' },
      ],
    }),
  ];

  it('keys the three health colours', () => {
    render(<HealthChangeOverTimeStacked data={book} />);
    expect(legendOf(screen.getByText('Good'))).toEqual(['Good', 'Average', 'Poor']);
  });

  it('titles both axes and writes each month with its year', () => {
    const { container } = render(<HealthChangeOverTimeStacked data={book} />);
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Month')).toBeInTheDocument();
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map(
      (t) => t.textContent,
    );
    expect(ticks).toEqual(["Jan '26", "Feb '26"]);
    expectReadableTicks(container);
  });
});

describe('AccountHealthDetailTable', () => {
  it('scrolls inside its card with the header pinned, instead of growing the page', () => {
    render(<AccountHealthDetailTable data={[healthRow()]} />);
    const region = screen.getByRole('region', { name: 'Account health details' });
    expect(region).toHaveStyle({ maxHeight: '520px' });
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });

  it('keeps the status pill inside its column', () => {
    render(<AccountHealthDetailTable data={[healthRow({ healthStatus: 'Average' })]} />);
    const pill = screen.getByText('Average', { selector: 'span' });
    expect(pill.className).toContain('px-2');
    expect(pill.className).not.toContain('px-6');
  });
});
