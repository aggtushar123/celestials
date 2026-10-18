// The internal portal's own shell. Deliberately not the tenant shell: no
// customer sidebar, no copilot, no notifications. A thin bar that says
// where you are, three sections, and a way back to the app.

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, LayoutGrid, ShieldCheck, UserCircle, LogOut } from 'lucide-react';
import { RevenactMark } from '../components/shared/RevenactMark';
import { useAppDispatch, useAppSelector } from '../hooks';
import { logout } from '../features/auth/authSlice';

const NAV = [
  { to: '/platform', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/platform/organisations', label: 'Organisations', icon: Building2, end: false },
  { to: '/platform/staff', label: 'Staff', icon: ShieldCheck, end: false },
  { to: '/platform/account', label: 'Account', icon: UserCircle, end: false },
];

export function PlatformLayout() {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen rv-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-[var(--rv-header-bg)]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <RevenactMark withWordmark size="sm" />
          <span className="text-[11px] font-bold tracking-[0.12em] text-ink-faint uppercase">Platform</span>
          <nav className="flex items-center gap-1 ml-4" aria-label="Platform sections">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    isActive ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-subtle'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px] text-ink-muted">
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => {
                dispatch(logout());
                navigate('/login', { replace: true });
              }}
              className="inline-flex min-h-11 items-center gap-1 hover:text-ink"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
