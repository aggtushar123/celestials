import { Navigate, Route, Routes } from 'react-router-dom';
import { KeepQueryRedirect } from '../../components/work/KeepQueryRedirect';
import { AnomaliesPage } from './Anomalies';
import { BrainAskLayout } from './ask/BrainAskLayout';
import { CustomersPage } from './Customers';
import { DoingPage } from './Doing';
import { FeatureRequestsPage } from './FeatureRequests';
import { GraphPage } from './Graph';
import { WhatChangedPage } from './WhatChanged';

/** /brain/*: the Company Brain. Every page is open to every signed-in
 *  member (spec 2026-10-05 §2.1; Waiting §2.2; rules spec §2.4; Doing §2.2;
 *  customers plan Decision 10): curation on Feature Requests and Anomalies
 *  (Gather asks, Look now, the status selects) still needs
 *  view_all_accounts, enforced inside those pages. /brain/waiting and
 *  /brain/review redirect to Work: Mine, and Mine's Approvals chip for review
 *  (agent actions are bundles now; bundles D1 frontend Decision 19).
 *  /brain/initiatives redirects to /brain/doing?section=initiatives (Doing
 *  spec Decision 7).
 *  Every page sits under BrainAskLayout (brain ask spec §2.2): one Ask rail
 *  and one conversation across all of them; the redirects sit outside it. */
export function BrainRoutes() {
  return (
    <Routes>
      <Route element={<BrainAskLayout />}>
        <Route index element={<WhatChangedPage />} />
        <Route path="doing" element={<DoingPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="requests" element={<FeatureRequestsPage />} />
        <Route path="anomalies" element={<AnomaliesPage />} />
      </Route>
      <Route path="waiting" element={<KeepQueryRedirect to="/work" set={{ queue: 'mine' }} />} />
      <Route path="review" element={<KeepQueryRedirect to="/work" set={{ queue: 'mine', kind: 'approval' }} />} />
      <Route path="initiatives" element={<Navigate to="/brain/doing?section=initiatives" replace />} />
      <Route path="dashboard" element={<Navigate to="/brain" replace />} />
      <Route path="agents" element={<Navigate to="/settings/ai/usage" replace />} />
      <Route path="skills" element={<Navigate to="/settings/ai/skills" replace />} />
      <Route path="feedback" element={<Navigate to="/settings/ai/feedback" replace />} />
      <Route path="*" element={<Navigate to="/brain" replace />} />
    </Routes>
  );
}
