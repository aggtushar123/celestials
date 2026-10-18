import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import notificationsReducer from '../features/notifications/notificationsSlice';
import { IDLE_AFTER_MS } from '../lib/presence';
import { DashboardLayout } from './DashboardLayout';

// Integration tier: the notification bell's socket closes while the person
// is away (lib/presence.ts) — an open WebSocket keeps a Cloud Run instance
// billed — and the bell reloads on return for whatever arrived meanwhile.

vi.mock('../components/layout/Sidebar', () => ({ Sidebar: () => <nav aria-label="Sidebar stub" /> }));
vi.mock('../components/layout/Navbar', () => ({ Navbar: () => <header>Navbar stub</header> }));

const fetchNotifications = vi.fn();
vi.mock('../features/notifications/notificationApi', () => ({
  fetchNotifications: () => fetchNotifications(),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  closed = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function renderLayout() {
  const store = configureStore({
    reducer: { auth: authReducer, notifications: notificationsReducer },
    preloadedState: {
      auth: { ...authReducer(undefined, { type: 'init' }), accessToken: 'real-jwt' },
    },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard/overview']}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="*" element={<div>Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('DashboardLayout notification socket while away', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    fetchNotifications.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('closes the socket after 30 idle minutes and reloads the bell on return', async () => {
    const { unmount } = renderLayout();
    expect(fetchNotifications).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances.filter((s) => !s.closed)).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('/ws/notifications/');

    act(() => {
      vi.advanceTimersByTime(IDLE_AFTER_MS);
    });
    expect(FakeWebSocket.instances.filter((s) => !s.closed)).toHaveLength(0);

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(FakeWebSocket.instances.filter((s) => !s.closed)).toHaveLength(1);
    expect(fetchNotifications).toHaveBeenCalledTimes(2);

    unmount();
    expect(FakeWebSocket.instances.filter((s) => !s.closed)).toHaveLength(0);
  });
});
