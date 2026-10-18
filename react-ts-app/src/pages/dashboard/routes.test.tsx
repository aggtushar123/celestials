import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import { dashboardRoutes } from './routes';

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

// Each view is stubbed: this test is about where URLs land, not what renders.
const stub = () => <Where />;

const cases: [string, string][] = [
  ['/dashboard', '/dashboard/overview'],
  ['/dashboard/advance', '/dashboard/overview'],
  ['/dashboard/advance/health', '/dashboard/health/triage'],
  ['/dashboard/advance/health/triage', '/dashboard/health/triage'],
  ['/dashboard/advance/health/divergence', '/dashboard/health/divergence'],
  ['/dashboard/advance/health/movement', '/dashboard/health/movement'],
  ['/dashboard/advance/health/renewal-date', '/dashboard/health/renewals'],
  ['/dashboard/advance/health/controls', '/dashboard/health/distribution'],
  ['/dashboard/advance/health/primary-owner', '/dashboard/health/triage'],
  ['/dashboard/advance/usage/controls', '/dashboard/health/usage'],
  ['/dashboard/advance/activity/controls', '/dashboard/health/activity'],
  ['/dashboard/advance/revenue/controls', '/dashboard/revenue/forecast'],
  ['/dashboard/advance/customer/controls', '/dashboard/revenue/customers'],
  ['/dashboard/advance/product/controls', '/dashboard/revenue/products'],
  ['/dashboard/advance/ticket/ticket-priority', '/dashboard/support/tickets'],
  ['/dashboard/advance/ai-trending/controls', '/dashboard/support/topics'],
  ['/dashboard/custom', '/dashboard/overview'],
  ['/dashboard/revenue', '/dashboard/revenue/forecast'],
  ['/dashboard/health', '/dashboard/health/triage'],
  ['/dashboard/support', '/dashboard/support/tickets'],
  ['/health', '/dashboard/health/distribution'],
];

describe('dashboard routes', () => {
  it.each(cases)('%s lands on %s', (from, to) => {
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>{dashboardRoutes(stub)}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('keeps the query string through a legacy redirect', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/advance/revenue/controls?owner=7']}>
        <Routes>{dashboardRoutes(stub)}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/revenue/forecast?owner=7');
  });
});

describe('dashboard frame', () => {
  // The layout's <main> is overflow-hidden, so the dashboard has to own its
  // own scroll — without it a long view is simply cut off. The drill panel
  // and the Ask rail sit beside that scroll area (see DashboardFrame's own
  // comment), but exactly one element around the view still owns the
  // scroll.
  it.each(['/dashboard/overview', '/dashboard/health/triage', '/dashboard/support/tickets'])(
    '%s renders inside a scroll container that shrinks to fit',
    (url) => {
      const { container } = render(
        <MemoryRouter initialEntries={[url]}>
          <Routes>{dashboardRoutes(stub)}</Routes>
        </MemoryRouter>,
      );
      const view = screen.getByTestId('where');
      const scroller = view.closest('.overflow-y-auto');
      expect(scroller).not.toBeNull();
      expect(scroller).toHaveClass('min-h-0');
      // Exactly one element above the view owns the scroll. The Ask rail's
      // own message list scrolls too, but beside the view, not around it.
      const around: Element[] = [];
      for (let el = view.parentElement; el && el !== container; el = el.parentElement) {
        if (el.classList.contains('overflow-y-auto')) around.push(el);
      }
      expect(around).toHaveLength(1);
    },
  );

  // Communications' body, class for class: no top padding (the top bar
  // above gives the space), px-4 pb-4 and a gap-3 between the column and
  // the rail, which start at the same top.
  it('keeps the page padding on the frame around the scroll area, as Communications has it', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard/overview']}>
        <Routes>{dashboardRoutes(stub)}</Routes>
      </MemoryRouter>,
    );
    const scroller = screen.getByTestId('where').closest('.overflow-y-auto');
    const frame = container.firstElementChild;
    expect(frame).toHaveClass('flex-1', 'min-h-0', 'flex', 'gap-3', 'px-4', 'pb-4');
    expect(frame).not.toHaveClass('p-4');
    expect(frame).not.toHaveClass('flex-col');
    expect(frame).not.toBe(scroller);
    expect(frame).toContainElement(scroller as HTMLElement);
  });
});
