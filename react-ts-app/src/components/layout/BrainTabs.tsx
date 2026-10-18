import { useLocation } from 'react-router-dom';
import { BRAIN_TABS, brainTabOf, tabSearch } from '../../features/brain/brainTabs';
import { Tabs } from '../ui';

/** The Brain's tabs (brain UI spec 2026-10-06 §1.1), drawn by BrainAskLayout's
 *  PageHeader into the bar: What changed, What's being done and Customers,
 *  as links carrying `?scope=`. Waiting on you moved to Work (work in one
 *  place §5). The Knowledge graph lights none. */
export function BrainTabs() {
  const location = useLocation();
  const search = tabSearch(location.search);
  return <Tabs label="Brain" value={brainTabOf(location.pathname) ?? ''} items={BRAIN_TABS.map((tab) => ({ key: tab.path, label: tab.label, to: `${tab.path}${search}` }))} />;
}
