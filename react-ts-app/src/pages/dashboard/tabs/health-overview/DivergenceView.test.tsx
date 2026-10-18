import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, format } from 'date-fns';
import { renderWithHealth, renderWithDrill, healthRow } from './testUtils';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DivergenceView } from './DivergenceView';
import { DivergenceList } from './charts/DivergenceList';
import { HealthOverviewContainer } from '../HealthOverviewContainer';
import { MOCK_HEALTH_DATA } from './mockData';
import { RENEWAL_DATE_FORMAT } from './triage';

/** The generated mock, used here purely as a fixture book — the tabs
 *  themselves read `state.health`, which the real app fills from
 *  /customers/health/. */
const BOOK = MOCK_HEALTH_DATA;
import { layOut, splitDivergent, summariseDivergence } from './divergence';

// Integration tier. Recharts needs a sized container, which jsdom doesn't
// give it, so — as in TicketOverview.test.tsx — these assert on the lists,
// the counts and the routing rather than on rendered SVG. The layout and
// classification maths is pinned to fixtures in divergence.test.ts.

const expected = (() => {
  const laid = layOut(MOCK_HEALTH_DATA, new Date());
  return { ...splitDivergent(laid), summary: summariseDivergence(laid) };
})();

const listNamed = (name: RegExp) =>
  screen.getByRole('heading', { name }).closest('section') as HTMLElement;

describe('DivergenceView', () => {
  it('leads with how many accounts the two pulses disagree on', () => {
    renderWithHealth(<DivergenceView />, { rows: BOOK });
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          /have a CSM and AI pulse \d\+ points apart/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  it('scrolls both lists inside one capped region, at every width', () => {
    renderWithHealth(<DivergenceView />, { rows: BOOK });
    const region = screen.getByRole('region', { name: 'Pulse disagreements' });
    expect(region).toHaveStyle({ maxHeight: '460px' });
    expect(within(region).getAllByRole('heading')).toHaveLength(2);
    // Each list's header stays in view while its rows scroll under it.
    for (const heading of within(region).getAllByRole('heading')) {
      expect(heading.closest('header')).toHaveClass('sticky', 'top-0', 'bg-surface');
    }
  });

  it('lists both directions of disagreement separately', () => {
    renderWithHealth(<DivergenceView />, { rows: BOOK });

    const blindSpots = listNamed(/AI sees risk the CSM/i);
    const humanFirst = listNamed(/CSM sees risk the AI/i);

    expect(within(blindSpots).queryAllByRole('listitem')).toHaveLength(expected.aiColder.length);
    expect(within(humanFirst).queryAllByRole('listitem')).toHaveLength(expected.csmColder.length);
  });

  it('names the accounts the model reads colder, soonest renewal first', () => {
    renderWithHealth(<DivergenceView />, { rows: BOOK });
    const blindSpots = listNamed(/AI sees risk the CSM/i);
    const rendered = within(blindSpots)
      .queryAllByRole('listitem')
      .map((li) => li.textContent ?? '');

    expected.aiColder.forEach((d, i) => {
      expect(rendered[i]).toContain(d.row.account);
    });
  });

  it('shows each row’s two scores and its renewal countdown', () => {
    renderWithHealth(<DivergenceView />, { rows: BOOK });
    const rows = within(listNamed(/AI sees risk the CSM/i)).queryAllByRole('listitem');
    if (rows.length === 0) return; // covered by the empty-state test below

    expect(rows[0].textContent).toMatch(/CSM \d/);
    expect(rows[0].textContent).toMatch(/AI \d/);
    expect(rows[0].textContent).toMatch(/\d+d/);
  });

  it('never files the same account under both directions', () => {
    renderWithHealth(<DivergenceView />, { rows: BOOK });
    const named = (section: HTMLElement) =>
      within(section).queryAllByRole('listitem').map((li) => li.textContent ?? '');

    const blind = named(listNamed(/AI sees risk the CSM/i));
    const human = named(listNamed(/CSM sees risk the AI/i));
    expect(blind.filter((t) => human.includes(t))).toEqual([]);
  });
});

describe('DivergenceList', () => {
  it('explains itself when a direction has no accounts', () => {
    renderWithHealth(
      <DivergenceList
        title="AI sees risk the CSM doesn’t"
        caption="The model is reading these colder."
        rows={[]}
        tone="danger"
        emptyMessage="No account currently has an AI Pulse that far below its CSM Pulse."
      />,
    );
    expect(screen.getByText(/No account currently has an AI Pulse/)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('DivergenceView drill', () => {
  const near = format(addDays(new Date(), 30), RENEWAL_DATE_FORMAT); // inside 90 days
  const far = format(addDays(new Date(), 400), RENEWAL_DATE_FORMAT); // outside 90 days

  const rows = [
    // Disagreeing (ai-colder) and renewing soon — an urgent blind spot.
    healthRow({ id: '1', account: 'AiColderUrgent', csmPulseScore: 5, aiPulseScore: 2, renewalDate: near }),
    // Near miss: same direction, but renews far out — disagreeing, not urgent.
    healthRow({ id: '2', account: 'AiColderFar', csmPulseScore: 5, aiPulseScore: 2, renewalDate: far }),
    // Near miss: disagreeing the other way — never an "urgent blind spot",
    // which is specifically the AI reading colder.
    healthRow({ id: '3', account: 'CsmColderSoon', csmPulseScore: 2, aiPulseScore: 5, renewalDate: near }),
    // Near miss: within threshold, doesn't count as disagreement at all.
    healthRow({ id: '4', account: 'Aligned', csmPulseScore: 4, aiPulseScore: 3, renewalDate: near }),
    // Unrated on each side.
    healthRow({ id: '5', account: 'NoCsm', csmPulseScore: null, aiPulseScore: 4, renewalDate: near }),
    healthRow({ id: '6', account: 'NoAi', csmPulseScore: 4, aiPulseScore: null, renewalDate: near }),
  ];

  it('the disagreeing number opens exactly the ai-colder and csm-colder accounts', async () => {
    const user = userEvent.setup();
    renderWithDrill(<DivergenceView />, { rows });

    await user.click(screen.getByRole('button', { name: /^Disagreeing 3, show accounts$/ }));
    const dialog = screen.getByRole('dialog');

    ['AiColderUrgent', 'AiColderFar', 'CsmColderSoon'].forEach((name) =>
      expect(within(dialog).getByRole('link', { name })).toBeInTheDocument(),
    );
    ['Aligned', 'NoCsm', 'NoAi'].forEach((name) =>
      expect(within(dialog).queryByRole('link', { name })).not.toBeInTheDocument(),
    );
  });

  it('the urgent blind spots number opens only the ai-colder accounts renewing inside 90 days', async () => {
    const user = userEvent.setup();
    renderWithDrill(<DivergenceView />, { rows });

    await user.click(screen.getByRole('button', { name: /^Urgent blind spots 1, show accounts$/ }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'AiColderUrgent' })).toBeInTheDocument();
    ['AiColderFar', 'CsmColderSoon', 'Aligned', 'NoCsm', 'NoAi'].forEach((name) =>
      expect(within(dialog).queryByRole('link', { name })).not.toBeInTheDocument(),
    );
  });

  it('the unrated number opens exactly the accounts one side hasn’t rated', async () => {
    const user = userEvent.setup();
    renderWithDrill(<DivergenceView />, { rows });

    await user.click(screen.getByRole('button', { name: /^Unrated 2, show accounts$/ }));
    const dialog = screen.getByRole('dialog');

    ['NoCsm', 'NoAi'].forEach((name) =>
      expect(within(dialog).getByRole('link', { name })).toBeInTheDocument(),
    );
    ['AiColderUrgent', 'AiColderFar', 'CsmColderSoon', 'Aligned'].forEach((name) =>
      expect(within(dialog).queryByRole('link', { name })).not.toBeInTheDocument(),
    );
  });

  it('offers no drill when the book is truncated', () => {
    renderWithDrill(<DivergenceView />, { rows, truncated: true });

    // Plain numbers, not dead buttons that promise a "show accounts" nobody
    // gets — the underline/hover styling goes with the button.
    expect(screen.queryByRole('button', { name: /Disagreeing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Urgent blind spots/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unrated/ })).not.toBeInTheDocument();
    expect(screen.getByText('3').closest('button')).toBeNull();
  });
});

describe('Health Overview routing with Divergence', () => {
  const renderAt = (path: string) =>
    renderWithHealth(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard/health" element={<HealthOverviewContainer />}>
            <Route index element={<Navigate to="triage" replace />} />
            <Route path="triage" element={<p>Triage stub</p>} />
            <Route path="divergence" element={<DivergenceView />} />
            <Route path="distribution" element={<p>Distribution stub</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { rows: BOOK },
    );

  // Tab order and cross-tab navigation now live in the shared sub-view nav
  // (`DashboardToolbar`, fed by `AREAS` in `areas.ts`), which has its own
  // tests — the container no longer renders a tab bar of its own for this
  // to reach through.

  it('still lands on Triage by default', () => {
    renderAt('/dashboard/health');
    expect(screen.getByText('Triage stub')).toBeInTheDocument();
  });
});
