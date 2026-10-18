import { describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import notificationsReducer from '../features/notifications/notificationsSlice';
import { PageHeader } from '../components/ui/PageHeader';
import { DashboardLayout } from './DashboardLayout';

// The real Navbar, so its title slot resolves as it does in the app.
vi.mock('../components/layout/Sidebar', () => ({ Sidebar: () => <nav aria-label="Sidebar stub" /> }));

const mounts = vi.fn();

/** Stands in for a page's tabs, which read a badge count on mount. */
function CountingTabs() {
  useEffect(() => {
    mounts();
  }, []);
  return <nav aria-label="Counting tabs" />;
}

function renderAt(url: string) {
  // No access token: the layout fetches no notifications and opens no socket.
  const store = configureStore({ reducer: { auth: authReducer, notifications: notificationsReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="*" element={<PageHeader title="Titled" tabs={<CountingTabs />} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('DashboardLayout title slot (UI foundations spec §6.1)', () => {
  it.each(['/brain', '/work/today', '/pipelines/list', '/organizations/list'])(
    'on %s mounts the page header once, straight into the bar, never in place first',
    async (url) => {
      mounts.mockClear();
      renderAt(url);
      const header = document.querySelector('header')!;
      expect(await within(header).findByRole('heading', { level: 1, name: 'Titled' })).toBeInTheDocument();
      expect(within(header).getByRole('navigation', { name: 'Counting tabs' })).toBeInTheDocument();
      expect(mounts).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('main').querySelector('[data-page-header]')).toBeNull();
    },
  );

  it('draws nothing for a PageHeader on a route whose bar has no title slot', () => {
    mounts.mockClear();
    renderAt('/users');
    expect(screen.queryByRole('heading', { level: 1, name: 'Titled' })).toBeNull();
    expect(mounts).not.toHaveBeenCalled();
  });
});
