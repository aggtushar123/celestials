import type { ReactElement } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { RequireCapability } from '../../components/auth/RequireCapability';
import type { Capability } from '../../features/auth/authSlice';
import { WorkspaceSettingsLayout } from '../../layouts/WorkspaceSettingsLayout';
import { UserManagement } from '../users/UserManagement';
import { Integrations } from '../integrations/Integrations';
import { AgentsPage } from '../brain/Agents';
import { SkillsPage } from '../brain/Skills';
import { FeedbackLogPage } from '../brain/Feedback';
import { GeneralSettingsPage } from './GeneralSettingsPage';
import { PlanBillingPage } from './PlanBillingPage';
import { SettingsPage } from './SettingsPage';
import { DefaultsPage } from './DefaultsPage';
import { ProductsPage } from './ProductsPage';
import { EntityUploadsPage } from './EntityUploadsPage';
import { WorkRecommendationsPage } from './WorkRecommendationsPage';
import { WorkTasksPage } from './WorkTasksPage';
import { WorkNotificationsPage } from './WorkNotificationsPage';
import { AgentsSettingsPage } from './AgentsSettingsPage';
import { AgentActionsPage } from './AgentActionsPage';
import { AIAttributesPage } from './AIAttributesPage';
import { BriefDeliveryPage } from './BriefDeliveryPage';
import { WebhooksPage } from './WebhooksPage';
import { AgentAccessPage } from './AgentAccessPage';
import { SettingsTabsRoute } from './SettingsTabsRoute';
import { KeepLocation } from './redirects';
import { AccountSettingsPage } from './AccountSettingsPage';
import { PersonalizationPage } from './PersonalizationPage';
import { SkillsTasksPage } from './SkillsTasksPage';
import { AboutSettingsPage } from './AboutSettingsPage';
import { Personal } from './Personal';


/**
 * Workspace settings' route tree (settings spec 2026-10-06 §1), plus the old
 * /users and /integrations addresses. A function so a test can pass `stub`
 * to replace every page with a probe and assert where each URL lands; the
 * guards stay real either way.
 */
export function settingsRoutes(stub?: () => ReactElement) {
  const el = (real: ReactElement) => (stub ? stub() : real);
  const gated = (capability: Capability, real: ReactElement) => (
    <RequireCapability capability={capability}>{el(real)}</RequireCapability>
  );
  return (
    <>
      <Route path="settings" element={<WorkspaceSettingsLayout />}>
        <Route index element={<Navigate to="/settings/general" replace />} />

        {/* You: the person's own settings (owner, 2026-10-17), every member. */}
        <Route path="account" element={<Personal>{el(<AccountSettingsPage />)}</Personal>} />
        <Route path="personalization" element={<Personal>{el(<PersonalizationPage />)}</Personal>} />
        <Route path="skills" element={<Personal>{el(<SkillsTasksPage />)}</Personal>} />
        <Route path="about" element={<Personal>{el(<AboutSettingsPage />)}</Personal>} />

        <Route path="general" element={el(<GeneralSettingsPage />)} />
        <Route path="people" element={gated('manage_users', <UserManagement />)} />
        <Route path="connections" element={el(<Integrations />)} />
        <Route path="billing" element={el(<PlanBillingPage />)} />

        <Route path="data" element={el(<SettingsPage />)} />
        <Route path="defaults" element={el(<DefaultsPage />)} />
        <Route path="products" element={el(<ProductsPage />)} />
        <Route path="entity-uploads" element={el(<EntityUploadsPage />)} />

        {/* Merged pages (settings production spec §4.2): an item with tabs, each tab a child route. */}
        <Route path="work" element={<SettingsTabsRoute />}>
          <Route index element={<Navigate to="/settings/work/recommendations" replace />} />
          <Route path="recommendations" element={el(<WorkRecommendationsPage />)} />
          <Route path="tasks" element={el(<WorkTasksPage />)} />
          <Route path="notifications" element={el(<WorkNotificationsPage />)} />
          <Route path="briefs" element={el(<BriefDeliveryPage />)} />
        </Route>
        <Route path="agents" element={<SettingsTabsRoute />}>
          <Route index element={el(<AgentsSettingsPage />)} />
          <Route path="actions" element={el(<AgentActionsPage />)} />
        </Route>
        <Route path="ai" element={<SettingsTabsRoute />}>
          <Route index element={<Navigate to="/settings/ai/attributes" replace />} />
          <Route path="attributes" element={el(<AIAttributesPage />)} />
          <Route path="skills" element={gated('view_all_accounts', <SkillsPage />)} />
          <Route path="usage" element={gated('view_all_accounts', <AgentsPage />)} />
          <Route path="feedback" element={gated('view_all_accounts', <FeedbackLogPage />)} />
        </Route>
        <Route path="developers" element={<SettingsTabsRoute />}>
          <Route index element={<Navigate to="/settings/developers/webhooks" replace />} />
          <Route path="webhooks" element={el(<WebhooksPage />)} />
          <Route path="agent-access" element={el(<AgentAccessPage />)} />
        </Route>

        {/* The one-page addresses before the merge: bookmarks, emails, old links. */}
        <Route path="recommendations" element={<KeepLocation to="/settings/work/recommendations" />} />
        <Route path="work-tasks" element={<KeepLocation to="/settings/work/tasks" />} />
        <Route path="work-notifications" element={<KeepLocation to="/settings/work/notifications" />} />
        <Route path="brief-delivery" element={<KeepLocation to="/settings/work/briefs" />} />
        <Route path="agent-actions" element={<KeepLocation to="/settings/agents/actions" />} />
        <Route path="ai-attributes" element={<KeepLocation to="/settings/ai/attributes" />} />
        <Route path="ai-skills" element={<KeepLocation to="/settings/ai/skills" />} />
        <Route path="ai-usage" element={<KeepLocation to="/settings/ai/usage" />} />
        <Route path="ai-feedback" element={<KeepLocation to="/settings/ai/feedback" />} />
        <Route path="webhooks" element={<KeepLocation to="/settings/developers/webhooks" />} />
        <Route path="agent-access" element={<KeepLocation to="/settings/developers/agent-access" />} />

        <Route path="ai-agent" element={<KeepLocation to="/settings/agents" />} />
        <Route path="currency" element={<Navigate to="/settings/defaults" replace />} />
        <Route path="global-presets" element={<Navigate to="/settings/defaults" replace />} />
        <Route path="activities" element={<Navigate to="/settings/general" replace />} />
        <Route path="connect-widget" element={<Navigate to="/settings/general" replace />} />
      </Route>

      <Route path="users" element={<Navigate to="/settings/people" replace />} />
      {/* Account settings folded into Settings (owner, 2026-10-17). */}
      <Route path="account-settings">
        <Route index element={<Navigate to="/settings/account" replace />} />
        <Route path="account" element={<KeepLocation to="/settings/account" />} />
        <Route path="billing" element={<KeepLocation to="/settings/billing" />} />
        <Route path="integrations" element={<KeepLocation to="/settings/connections" />} />
        <Route path="personalization" element={<KeepLocation to="/settings/personalization" />} />
        <Route path="skills" element={<KeepLocation to="/settings/skills" />} />
        <Route path="about" element={<KeepLocation to="/settings/about" />} />
        <Route path="*" element={<Navigate to="/settings/account" replace />} />
      </Route>
      <Route path="integrations" element={<KeepLocation to="/settings/connections" />} />
    </>
  );
}
