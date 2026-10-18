import { useLocation } from 'react-router-dom';
import { Tabs } from '../../ui';

/** List | Board under a portfolio's title (Organizations, Accounts): links
 *  that carry the query, so filters, sort and group survive the switch. */
export function ViewTabs({ label, base, value }: { label: string; base: string; value: 'list' | 'board' }) {
  const { search } = useLocation();
  return (
    <Tabs
      label={label}
      value={value}
      items={[
        { key: 'list', label: 'List', to: `${base}/list${search}` },
        { key: 'board', label: 'Board', to: `${base}/board${search}` },
      ]}
    />
  );
}
