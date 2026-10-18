import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { DashboardLayout } from './DashboardLayout';

// The shell's own pieces have their own tests; this one is about the frame.
vi.mock('../components/layout/Sidebar', () => ({ Sidebar: () => <nav aria-label="Sidebar stub" /> }));
vi.mock('../components/layout/Navbar', () => ({ Navbar: () => <header>Navbar stub</header> }));

function renderAt(url: string) {
  // No access token: the layout fetches no notifications and opens no socket.
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="*" element={<div>Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return screen.getByRole('main');
}

describe('DashboardLayout', () => {
  // The dashboard's frame pads itself as Communications' body does (px-4
  // pb-4 under a transparent top bar), so <main> adds nothing around it.
  it.each([
    '/dashboard/overview',
    '/communications',
    '/organizations/list',
    '/organizations/board',
    '/organizations/7',
    '/contacts',
    '/contacts/41',
    // A trailing slash is still the same route (fix round 1, 2026-09-28).
    '/contacts/',
    '/contacts/41/',
    // The Accounts list and board wear the Organizations frame too, whose
    // own px-4 pb-4 already gutters them (fix round 1, 2026-09-30).
    '/accounts/list',
    '/accounts/board',
    // …and an account's page, the organization page's bleed frame (accounts
    // spec 2026-09-29 §2.1) — including a non-numeric id (the page's own
    // "Account not found" state), fix round 2, 2026-09-30.
    '/accounts/12',
    '/accounts/12/',
    '/accounts/abc',
    // The New plan modal over a record's page (plans spec §2.2).
    '/organizations/7/plans/new',
    '/accounts/12/plans/new',
    // The Pipelines list and board, framed like Accounts' (pipelines spec
    // 2026-09-30 §1).
    '/pipelines/list',
    '/pipelines/board',
    // Segments wear the same frame (segments spec 2026-10-03 §3).
    '/segments',
    '/segments/new',
    '/segments/7',
    '/segments/7/edit',
    // Survey these and Automate open their modals over the segment.
    '/segments/7/survey',
    '/segments/7/rule',
    // Scenarios and the rule pages wear the same frame (rules spec 2026-10-04 §2).
    '/scenarios',
    '/scenarios/rules/new',
    '/scenarios/rules/5',
    '/scenarios/rules/5/edit',
    // Plans wear the same frame (plans spec 2026-10-04 §2).
    '/projects',
    '/projects/new',
    '/projects/41',
    '/projects/templates',
    '/projects/templates/new',
    '/projects/templates/10/edit',
    // Campaigns wear the same frame (campaigns spec 2026-10-04 §2).
    '/campaigns',
    '/campaigns/new',
    '/campaigns/11',
    '/campaigns/11/edit',
    // Canvas wears the same frame too (canvas spec 2026-10-04 §2, Decision 4).
    '/canvas',
    '/canvas/301',
    // Any id, so a missing map keeps the single gutter (Impact plan Task 2).
    '/canvas/abc',
    // Surveys wear the same frame (surveys spec 2026-10-03 §2); they were
    // double-guttered until UI broken-things fix 11.
    '/surveys',
    '/surveys/new',
    '/surveys/12',
    '/surveys/12/edit',
  ])('adds no padding around %s', (url) => {
    const main = renderAt(url);
    expect(main).toHaveClass('p-0');
    expect(main).not.toHaveClass('p-2');
  });

  it('keeps the padding on other pages', () => {
    const main = renderAt('/users');
    expect(main).toHaveClass('p-2', 'md:p-3', 'lg:p-4');
  });

  // The Brain wears its own frame (brain UI spec 2026-10-06 §1.4): BrainFrame's
  // px-4 pb-6 gutters every Brain route, so <main> adds nothing around it.
  it.each(['/brain', '/brain/', '/brain/doing', '/brain/customers', '/brain/requests', '/brain/anomalies', '/brain/graph'])(
    'adds no padding around the Brain at %s',
    (url) => {
      const main = renderAt(url);
      expect(main).toHaveClass('p-0');
      expect(main).not.toHaveClass('p-2');
    },
  );

  it('keeps the padding on a route that only starts with the letters "brain"', () => {
    expect(renderAt('/brainstorm')).toHaveClass('p-2', 'md:p-3', 'lg:p-4');
  });

  it('keeps the Navbar on the dashboard, not on Communications', () => {
    renderAt('/dashboard/overview');
    expect(screen.getByText('Navbar stub')).toBeInTheDocument();
  });

  it.each(['/scenarios', '/scenarios/rules/new', '/scenarios/rules/5', '/scenarios/rules/5/edit'])('keeps the Navbar on %s', (url) => {
    renderAt(url);
    expect(screen.getByText('Navbar stub')).toBeInTheDocument();
  });

  it.each(['/projects', '/projects/41', '/projects/templates'])('keeps the Navbar on %s', (url) => {
    renderAt(url);
    expect(screen.getByText('Navbar stub')).toBeInTheDocument();
  });

  it.each(['/canvas', '/canvas/301'])('keeps the Navbar on %s', (url) => {
    renderAt(url);
    expect(screen.getByText('Navbar stub')).toBeInTheDocument();
  });

  it.each(['/scenarios/create', '/scenarios/12'])('gives the canvas builder at %s the full canvas: no Navbar, no padding', (url) => {
    const main = renderAt(url);
    expect(screen.queryByText('Navbar stub')).toBeNull();
    expect(main).toHaveClass('p-0');
  });

  // Owner, 2026-10-16: Settings takes the gradient canvas like Account
  // settings (replaces settings production spec §10.1's solid canvas).
  it('gives Settings the gradient canvas, like Account settings', () => {
    renderAt('/settings/general');
    const wrapper = document.querySelector('[data-part="content-canvas"]');
    expect(wrapper).toHaveClass('rv-canvas');
    expect(wrapper).not.toHaveClass('bg-base');
  });

  it('keeps the glow elsewhere', () => {
    renderAt('/dashboard/overview');
    expect(document.querySelector('[data-part="content-canvas"]')).toHaveClass('rv-canvas');
  });
});
