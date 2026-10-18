import type { Opportunity, Risk } from '../../features/customers/customersSlice';
import type { AttributeDef } from './attributeConfig';

// Every real field on revenact-backend's OpportunitySerializer/
// RiskSerializer (see docs/API_CONTRACTS.md -> customers -> Opportunity/
// Risk) — same "isCustom mechanically derived from what the real Add/
// Edit form actually sends" reasoning as organizationAttributes.ts/
// accountAttributes.ts/contactAttributes.ts. Kept as two separate lists
// (not merged into one) since the Pipelines board itself already
// treats Opportunities/Risks as two sub-tabs, not one combined list —
// same convention this settings page's own Pipeline sub-tab follows
// (see SettingsPage.tsx's own pipelineEntity toggle) — and merging
// would collide on field names (`stage`/`priority`/`mrr` exist,
// distinctly, on both).

export const OPPORTUNITY_ATTRIBUTES: AttributeDef<Opportunity>[] = [
  // ── Custom (UI Editable) ──────────────────────────────────────────
  { displayName: 'Title', name: 'title', type: 'text', isCustom: true, required: true, getValue: (o) => o.title },
  { displayName: 'MRR', name: 'mrr', type: 'currency', isCustom: true, getValue: (o) => o.mrr },
  { displayName: 'Stage', name: 'stage', type: 'select', isCustom: true, required: true, getValue: (o) => o.stage },
  { displayName: 'Priority', name: 'priority', type: 'select', isCustom: true, required: true, getValue: (o) => o.priority },

  // ── System (read-only / computed / not exposed in any form) ───────
  { displayName: 'ID', name: 'id', type: 'number', isCustom: false, required: true, getValue: (o) => o.id },
  { displayName: 'Stage (Display)', name: 'stage_display', type: 'text', isCustom: false, required: true, getValue: (o) => o.stage_display },
  { displayName: 'Priority (Display)', name: 'priority_display', type: 'text', isCustom: false, required: true, getValue: (o) => o.priority_display },
  { displayName: 'Companies', name: 'companies', type: 'relation', isCustom: false, required: true, getValue: (o) => o.companies },
  { displayName: 'Account Name', name: 'account_name', type: 'text', isCustom: false, getValue: (o) => o.account_name },
];

export const RISK_ATTRIBUTES: AttributeDef<Risk>[] = [
  // ── Custom (UI Editable) ──────────────────────────────────────────
  { displayName: 'Title', name: 'title', type: 'text', isCustom: true, required: true, getValue: (r) => r.title },
  { displayName: 'MRR', name: 'mrr', type: 'currency', isCustom: true, getValue: (r) => r.mrr },
  { displayName: 'Stage', name: 'stage', type: 'select', isCustom: true, required: true, getValue: (r) => r.stage },
  { displayName: 'Priority', name: 'priority', type: 'select', isCustom: true, required: true, getValue: (r) => r.priority },

  // ── System (read-only / computed / not exposed in any form) ───────
  { displayName: 'ID', name: 'id', type: 'number', isCustom: false, required: true, getValue: (r) => r.id },
  { displayName: 'Stage (Display)', name: 'stage_display', type: 'text', isCustom: false, required: true, getValue: (r) => r.stage_display },
  { displayName: 'Priority (Display)', name: 'priority_display', type: 'text', isCustom: false, required: true, getValue: (r) => r.priority_display },
  { displayName: 'Companies', name: 'companies', type: 'relation', isCustom: false, required: true, getValue: (r) => r.companies },
  { displayName: 'Account Name', name: 'account_name', type: 'text', isCustom: false, getValue: (r) => r.account_name },
];
