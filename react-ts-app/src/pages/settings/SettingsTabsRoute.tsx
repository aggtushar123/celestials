import { Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import type { Capability } from '../../features/auth/authSlice';
import { SettingsTabsSlot, Tabs } from '../../components/ui';
import { settingsTabsFor } from './workspaceSettingsNav';

const NO_PERMISSIONS: Capability[] = [];

/** The route element of a merged settings page (settings production spec
 *  §4.2, §10.3): its tab row, one link per tab this person may open, handed
 *  to the page's SettingsFrame through SettingsTabsSlot. */
export function SettingsTabsRoute() {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? NO_PERMISSIONS);
  const { pathname } = useLocation();
  const found = settingsTabsFor(pathname, permissions);
  const row = found ? (
    <Tabs label={`${found.item.label} sections`} value={found.current} items={found.tabs.map((tab) => ({ key: tab.path, label: tab.label, to: tab.path }))} />
  ) : null;
  return (
    <SettingsTabsSlot.Provider value={row}>
      <Outlet />
    </SettingsTabsSlot.Provider>
  );
}
