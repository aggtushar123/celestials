import type { ReactElement } from 'react';
import { Route } from 'react-router-dom';
import { AREAS } from './areas';
import { AreaLayout } from './AreaLayout';
import { DashboardFrame } from './DashboardFrame';
import { Keep, LegacyRedirect } from './redirects';
import { Overview } from './Overview';
import { AITrendingTopics } from './tabs/AITrendingTopics';
import { ControlsView as TopicsView } from './tabs/ai-trending/ControlsView';
import { HealthOverviewContainer } from './tabs/HealthOverviewContainer';
import { TriageView } from './tabs/health-overview/TriageView';
import { DivergenceView } from './tabs/health-overview/DivergenceView';
import { MovementView } from './tabs/health-overview/MovementView';
import { RenewalView } from './tabs/health-overview/RenewalView';
import { DistributionView } from './tabs/health-overview/DistributionView';
import { CustomerOverviewContainer } from './tabs/CustomerOverviewContainer';
import { ControlsView as CustomersView } from './tabs/customer-overview/ControlsView';
import { ActivityContainer } from './tabs/ActivityContainer';
import { ControlsView as ActivityView } from './tabs/activity/ControlsView';
import { ForecastContainer } from './tabs/ForecastContainer';
import { ControlsView as ForecastView } from './tabs/forecast/ControlsView';
import { UsageOverviewContainer } from './tabs/UsageOverviewContainer';
import { ControlsView as UsageView } from './tabs/usage-overview/ControlsView';
import { ProductUsageContainer } from './tabs/ProductUsageContainer';
import { ControlsView as ProductsView } from './tabs/product-usage/ControlsView';
import { TicketOverviewContainer } from './tabs/ticket-overview/TicketOverviewContainer';
import { ControlsView as TicketsView } from './tabs/ticket-overview/ControlsView';

const first = (key: string) => `/dashboard/${key}/${AREAS.find((a) => a.key === key)!.views[0].path}`;

/**
 * The dashboard's route tree. A function so tests can pass `stub` to replace
 * every view with a probe and assert on where each URL lands.
 */
export function dashboardRoutes(stub?: () => ReactElement) {
  const el = (real: ReactElement) => (stub ? stub() : real);
  const shell = (real: ReactElement) => (stub ? undefined : real);
  return (
    <>
      <Route path="dashboard" element={<DashboardFrame />}>
        <Route index element={<Keep to="/dashboard/overview" />} />
        <Route path="overview" element={el(<Overview />)} />
        <Route path="advance" element={<Keep to="/dashboard/overview" />} />
        <Route path="advance/*" element={<LegacyRedirect />} />
        <Route path="custom" element={<Keep to="/dashboard/overview" />} />

        <Route path="revenue" element={<AreaLayout area="revenue" />}>
          <Route index element={<Keep to={first('revenue')} />} />
          <Route element={shell(<ForecastContainer />)}>
            <Route path="forecast" element={el(<ForecastView />)} />
          </Route>
          <Route element={shell(<CustomerOverviewContainer />)}>
            <Route path="customers" element={el(<CustomersView />)} />
          </Route>
          <Route element={shell(<ProductUsageContainer />)}>
            <Route path="products" element={el(<ProductsView />)} />
          </Route>
          <Route path="*" element={<Keep to={first('revenue')} />} />
        </Route>

        <Route path="health" element={<AreaLayout area="health" />}>
          <Route index element={<Keep to={first('health')} />} />
          <Route element={shell(<HealthOverviewContainer />)}>
            <Route path="triage" element={el(<TriageView />)} />
            <Route path="divergence" element={el(<DivergenceView />)} />
            <Route path="movement" element={el(<MovementView />)} />
            <Route path="renewals" element={el(<RenewalView />)} />
            <Route path="distribution" element={el(<DistributionView />)} />
          </Route>
          <Route element={shell(<UsageOverviewContainer />)}>
            <Route path="usage" element={el(<UsageView />)} />
          </Route>
          <Route element={shell(<ActivityContainer />)}>
            <Route path="activity" element={el(<ActivityView />)} />
          </Route>
          <Route path="*" element={<Keep to={first('health')} />} />
        </Route>

        <Route path="support" element={<AreaLayout area="support" />}>
          <Route index element={<Keep to={first('support')} />} />
          <Route element={shell(<TicketOverviewContainer />)}>
            <Route path="tickets" element={el(<TicketsView />)} />
          </Route>
          <Route element={shell(<AITrendingTopics />)}>
            <Route path="topics" element={el(<TopicsView />)} />
          </Route>
          <Route path="*" element={<Keep to={first('support')} />} />
        </Route>
      </Route>
      <Route path="health" element={<Keep to="/dashboard/health/distribution" />} />
    </>
  );
}
