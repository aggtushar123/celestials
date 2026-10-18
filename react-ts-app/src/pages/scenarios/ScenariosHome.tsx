import { useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { scenariosTab } from '../../features/rules/ruleParams';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { PageHeader, PRIMARY, Tabs } from '../../components/ui';
import { RulesTab } from '../rules/RulesTab';
import { ScenariosList } from './ScenariosList';

/** /scenarios (rules spec §2.1): Rules first, then the Canvas as it was
 *  (`?tab=`, plan Decision 2), under the framed bar titled "Scenarios". New
 *  rule (/scenarios/rules/new) opens its modal over this page through the
 *  Outlet. */
export function ScenariosHome() {
  const [search] = useSearchParams();
  const tab = scenariosTab(search);
  // Each time the modal route closes back to /scenarios, the Rules list
  // reads again: a rule may have been saved under it.
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/scenarios';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [reload, setReload] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setReload((n) => n + 1);
  }
  return (
    <OrganizationsFrame>
      <PageHeader
        title="Scenarios"
        tabs={
          <Tabs
            label="Scenario views"
            value={tab}
            items={[
              { key: 'rules', label: 'Rules', to: '/scenarios' },
              { key: 'canvas', label: 'Canvas', to: '/scenarios?tab=canvas' },
            ]}
          />
        }
        actions={{
          primary:
            tab === 'rules' ? (
              <Link to="/scenarios/rules/new" className={PRIMARY}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New rule
              </Link>
            ) : (
              <Link to="/scenarios/create" className={PRIMARY}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create scenario
              </Link>
            ),
        }}
      />
      <div className="flex flex-col gap-4 pb-6">{tab === 'rules' ? <RulesTab reload={reload} /> : <ScenariosList />}</div>
      {/* /scenarios/rules/new: the rule builder modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
