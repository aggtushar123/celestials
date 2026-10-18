import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../../hooks';
import { DashboardToolbar } from '../../shared/DashboardToolbar';
import type { ToolbarFilter } from '../../shared/DashboardToolbar';
import { toQuery, useDashboardFilters } from '../../shared/useDashboardFilters';
import { useSubViews } from '../../useSubViews';
import type { TicketOverviewContext } from './ControlsView';

/** The date presets the "Ticket Date" filter offers. Relative to today
 * rather than fixed dates, so they keep meaning something as time
 * moves — the seeded demo data now runs up to the present for exactly
 * this reason. */
const DATE_PRESETS = [
  { label: 'All', days: null },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last year', days: 365 },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The `days` values a preset actually offers — anything else in the URL
 *  (a hand-edited link, `?days=abc`) is nonsense rather than a filter, and
 *  is treated the same as no `days` key at all rather than crashing
 *  `isoDaysAgo` with `NaN`. */
const DATE_PRESET_DAYS = DATE_PRESETS.map((p) => String(p.days ?? ''));

// `days` is also Activity's key (Health area); safe because area links carry only SHARED_KEYS.
const KEYS = ['days', 'owner', 'priority', 'customer'];

/**
 * The Ticket Overview shell, and its filter bar.
 *
 * The filters live in the URL rather than component state, the same move
 * Health > Activity already made: switching tabs no longer resets them, and a
 * filtered view can be linked. "Ticket Date" carries `clearable: false` — like
 * Activity's window, it's the question being asked rather than a narrowing of
 * the book, so Clear leaves it alone, and with no `days` param at all the
 * chip reads "All" rather than assuming a default window.
 *
 * The backend's `TicketStatsView` reads `from` (an ISO date), not `days`, so
 * the URL's preset is translated at the query-building boundary rather than
 * carried through as-is.
 */
export function TicketOverviewContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.tickets.stats?.filters);
  const { values } = useDashboardFilters(KEYS);

  const base = toQuery({ owner: values.owner, priority: values.priority, customer: values.customer });
  let query = base;
  if (values.days && DATE_PRESET_DAYS.includes(values.days)) {
    const params = new URLSearchParams(base);
    params.set('from', isoDaysAgo(Number(values.days)));
    query = params.toString();
  }
  const context: TicketOverviewContext = { query };

  const filters: ToolbarFilter[] = [
    {
      key: 'days',
      label: 'Ticket Date',
      clearable: false,
      options: DATE_PRESETS.map((p) => ({ value: String(p.days ?? ''), label: p.label })),
    },
    {
      key: 'owner',
      label: 'Primary Owner',
      options: [
        { value: '', label: 'All' },
        ...(options?.owners ?? []).map((o) => ({ value: String(o.id), label: o.name })),
      ],
    },
    {
      key: 'priority',
      label: 'Ticket Priority',
      options: [
        { value: '', label: 'All' },
        ...(options?.priorities ?? []).map((p) => ({ value: p.value, label: p.name })),
      ],
    },
    {
      key: 'customer',
      label: 'Account',
      options: [
        { value: '', label: 'All' },
        ...(options?.customers ?? []).map((c) => ({ value: String(c.id), label: c.name })),
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar subViews={subViews} filters={filters} />
      <div className="flex-1 w-full h-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
