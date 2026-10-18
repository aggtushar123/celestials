import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ActivityWeek, CadenceBucket, DarkAccount, OwnerCoverage } from '../../../../../features/activity/activitySlice';
import { sizeCharts } from '../../../../../test/chartSize';
import { TouchTimeline } from './TouchTimeline';
import { CadenceChart } from './CadenceChart';
import { GoingDarkTable } from './GoingDarkTable';
import { OwnerCoverageList } from './OwnerCoverageList';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts(800, 360);

const legendOf = (anchor: HTMLElement) =>
  within(anchor.closest('ul') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

function expectReadableTicks(container: HTMLElement) {
  const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
  expect(ticks.length).toBeGreaterThan(0);
  for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
}

const week = (date: string, iso: string): ActivityWeek => ({
  date,
  iso,
  activities: 1,
  calls: 2,
  emails: 3,
  notes: 0,
  meetings: 1,
});

describe('TouchTimeline legend and axes', () => {
  const weeks = [week('Jun 8', '2026-06-08'), week('Jun 15', '2026-06-15')];
  const draw = () => render(<TouchTimeline weeks={weeks} sources={[]} inbound={0} windowDays={90} />);

  it('keys each source with a solid swatch, top band first', () => {
    draw();
    expect(legendOf(screen.getByText('Calls'))).toEqual(['Notes', 'Emails', 'Activities', 'Meetings', 'Calls']);
  });

  it('titles the count axis and the week axis', () => {
    const { container } = draw();
    expect(screen.getByText('Touches / week')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expectReadableTicks(container);
  });

  it('separates the stacked greys with solid fills, not a 45% wash', () => {
    const { container } = draw();
    const areas = [...container.querySelectorAll('.recharts-area-area')];
    expect(areas.length).toBe(5);
    for (const area of areas) expect(Number(area.getAttribute('fill-opacity'))).toBeGreaterThanOrEqual(0.85);
  });
});

describe('CadenceChart legend and axes', () => {
  const buckets: CadenceBucket[] = [
    { key: 'week', name: 'Last 7 days', accounts: 3, arr: 1000 },
    { key: 'month', name: '8–30 days', accounts: 2, arr: 1000 },
    { key: 'stale', name: '31–60 days', accounts: 0, arr: 0 },
    { key: 'dark', name: '61–90 days', accounts: 1, arr: 1000 },
    { key: 'cold', name: 'Over 90 days', accounts: 0, arr: 0 },
    { key: 'never', name: 'No contact logged', accounts: 1, arr: 1000 },
  ];
  const draw = () => render(<CadenceChart buckets={buckets} currency="USD" threshold={60} />);

  it('keys what the colours mean', () => {
    draw();
    expect(legendOf(screen.getByText('On track'))).toEqual(['On track', 'Stale', 'Dark', 'Never']);
  });

  it('titles both axes', () => {
    const { container } = draw();
    expect(screen.getByText('Days since last contact')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expectReadableTicks(container);
  });

  it('marks an empty bucket "0" rather than leaving a gap', () => {
    const { container } = draw();
    const labels = [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);
    expect(labels).toEqual(['0', '0']);
  });
});

describe('GoingDarkTable', () => {
  const row: DarkAccount = {
    id: 1,
    name: 'Globex International Holdings Group',
    owner: 'Carl',
    arr: 1000,
    health_category: 'good',
    lifecycle_stage: 'Live',
    last_contact: null,
    days_since_contact: null,
  } as DarkAccount;

  it('scrolls inside its card with the header pinned, instead of growing the page', () => {
    render(<GoingDarkTable rows={[row]} currency="USD" threshold={60} />);
    const region = screen.getByRole('region', { name: 'Going quiet' });
    expect(region).toHaveStyle({ maxHeight: '420px' });
    expect(within(region).getByRole('columnheader', { name: 'Account' })).toBeInTheDocument();
  });

  it('prints a long account name in full', () => {
    render(<GoingDarkTable rows={[row]} currency="USD" threshold={60} />);
    expect(screen.getByText('Globex International Holdings Group').className).not.toContain('truncate');
  });
});

describe('OwnerCoverageList', () => {
  it('draws the touched share in ink: coverage is not a gain', () => {
    const owners: OwnerCoverage[] = [{ owner: 'Carl', accounts: 4, touched: 3, dark: 1, arr_dark: 0 }];
    render(<OwnerCoverageList owners={owners} currency="USD" windowDays={90} threshold={60} />);
    const bar = screen.getByRole('img', { name: /Carl/ }).firstElementChild!;
    expect(bar.className).toContain('bg-ink');
    expect(bar.className).not.toContain('bg-success');
  });
});
