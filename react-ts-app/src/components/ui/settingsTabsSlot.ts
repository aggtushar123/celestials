import { createContext, type ReactNode } from 'react';

/** A tabbed settings page's tab row (settings production spec §10.3),
 *  provided by the route (pages/settings/SettingsTabsRoute) and drawn by
 *  SettingsFrame under the heading, so the pages themselves stay unaware. */
export const SettingsTabsSlot = createContext<ReactNode>(null);
