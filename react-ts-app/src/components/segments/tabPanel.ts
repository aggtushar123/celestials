/** A segment tab's panel ids from the page's Tabs (`ui/tabIds`). */
export interface TabPanelIds {
  id: string;
  labelledBy: string;
}

/** Named by its tab when the page gives the ids; alone (a component test),
 *  by its own label. */
export function tabPanelProps(label: string, panel: TabPanelIds | undefined) {
  return panel ? { id: panel.id, 'aria-labelledby': panel.labelledBy } : { 'aria-label': label };
}
