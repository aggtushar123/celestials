import { useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { surveysTab } from '../../features/surveys/surveyParams';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { PageHeader, PRIMARY, Tabs } from '../../components/ui';
import { SendsTab } from './SendsTab';
import { SurveysPage } from './SurveysPage';

/** /surveys (spec §2.1; UI foundations spec §5.2): Sends and Logged scores
 *  as link tabs in the bar (`?tab=`, plan Decision 4), New survey as the
 *  bar's primary on Sends. New survey (/surveys/new) opens its modal over
 *  this page. */
export function SurveysHome() {
  const [search] = useSearchParams();
  const tab = surveysTab(search);
  // Each time the modal route closes back to /surveys, the Sends list reads
  // again: a draft may have been saved under it.
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/surveys';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [reload, setReload] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setReload((n) => n + 1);
  }
  return (
    <OrganizationsFrame>
      <PageHeader
        title="Surveys"
        tabs={
          <Tabs
            label="Survey views"
            value={tab}
            items={[
              { key: 'sends', label: 'Sends', to: '/surveys' },
              { key: 'logged', label: 'Logged scores', to: '/surveys?tab=logged' },
            ]}
          />
        }
        actions={
          tab === 'sends'
            ? {
                primary: (
                  <Link to="/surveys/new" className={PRIMARY}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New survey
                  </Link>
                ),
              }
            : undefined
        }
      />
      <div className="flex flex-col gap-4 pb-6">{tab === 'sends' ? <SendsTab reload={reload} /> : <SurveysPage />}</div>
      {/* /surveys/new: the New survey modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
