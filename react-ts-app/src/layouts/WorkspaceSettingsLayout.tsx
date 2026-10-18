import { useMemo, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks';
import type { Capability } from '../features/auth/authSlice';
import { MD, useMediaQuery } from '../lib/useMediaQuery';
import { visibleSettingsNav } from '../pages/settings/workspaceSettingsNav';
import { FOCUS, PageHeader, ScrollSentinel, Select, SettingsLeaveSlot, TYPE, type LeaveRequest } from '../components/ui';

// A stable empty list, so the selector does not hand back a new array (and a
// re-render) on every store change while signed out.
const NO_PERMISSIONS: Capability[] = [];

const groupId = (label: string) => `settings-nav-${label.toLowerCase()}`;
const LINK = `flex min-h-9 items-center gap-2 rounded-lg px-2 text-[13px] leading-5 ${FOCUS}`;

/** Workspace settings' frame (settings spec 2026-10-06 §2.1; UI foundations
 *  spec §6.1, §6.3): "Settings" moved from the bar into the nav from md
 *  (settings production spec §4.1, §10.2) and stays in the bar on phones (as
 *  text: each page's SettingsFrame owns the h1), the grouped nav column from md, the ui Select
 *  above the page below it, and the page beside or under it, keeping its own
 *  scroll (whose sentinel shows the bar's hairline once it scrolls). One nav
 *  or the other is rendered, never both, so a screen reader meets one. The
 *  phone select navigates through the page's leave guard (SettingsLeaveSlot),
 *  so unsaved edits ask first there too. */
export function WorkspaceSettingsLayout() {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? NO_PERMISSIONS);
  const groups = visibleSettingsNav(permissions);
  const isMdUp = useMediaQuery(MD);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const leave = useRef<LeaveRequest | null>(null);
  const fillLeave = useMemo(
    () => (request: LeaveRequest | null) => {
      leave.current = request;
    },
    [],
  );
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const options = [
    ...(current ? [] : [{ value: '', label: 'Choose a section' }]),
    ...groups.map((group) => ({ label: group.label, options: group.items.map((item) => ({ value: item.path, label: item.label })) })),
  ];

  return (
    <SettingsLeaveSlot.Provider value={fillLeave}>
      {isMdUp ? null : <PageHeader title="Settings" titleAs="p" />}
      <div className="flex h-full min-h-0 w-full flex-1 flex-col md:flex-row">
        {isMdUp ? (
          <nav aria-label="Workspace settings" className="flex w-56 shrink-0 flex-col gap-5 overflow-y-auto rv-scrollbar border-r border-line px-3 py-4">
            <p className={`px-2 ${TYPE.title}`}>Settings</p>
            {groups.map((group) => (
              <div key={group.label} role="group" aria-labelledby={groupId(group.label)} className="flex flex-col gap-0.5">
                <span id={groupId(group.label)} className={`px-2 pb-1 ${TYPE.eyebrow}`}>
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `${LINK} ${isActive ? 'bg-subtle font-semibold text-ink' : 'text-ink-muted hover:bg-subtle hover:text-ink'}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        ) : (
          <div className="shrink-0 px-4 pt-4">
            <Select
              label="Settings section"
              labelPosition="hidden"
              value={current?.path ?? ''}
              onChange={(path) => {
                if (!path) return;
                if (leave.current) leave.current(path);
                else navigate(path);
              }}
              options={options}
            />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rv-scrollbar">
          <ScrollSentinel />
          <Outlet />
        </div>
      </div>
    </SettingsLeaveSlot.Provider>
  );
}
