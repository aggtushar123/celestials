import type { Account } from '../../features/customers/customersSlice';
import type { AttributeDef } from './attributeConfig';

// Every real field on revenact-backend's AccountSerializer (see
// docs/API_CONTRACTS.md -> customers -> Account) — same "isCustom
// mechanically derived from what the real Add/Edit form actually
// sends" reasoning as organizationAttributes.ts, not a subjective
// guess. `customers` (the account's own linked organizations) is
// System, not Custom, even though AccountWritePayload technically has
// a `customer_ids` field for it — AccountFormModal's own handleSubmit
// never actually sends it today (the standalone Account page's own
// Organizations tab is read-only, no add/remove UI yet), so by the
// same "does the current form actually send this" rule as email/phone
// on the Organization side, it isn't UI Editable yet either.
export const ACCOUNT_ATTRIBUTES: AttributeDef<Account>[] = [
  // ── Custom (UI Editable) ──────────────────────────────────────────
  { displayName: 'Name', name: 'name', type: 'text', isCustom: true, required: true, getValue: (a) => a.name },
  { displayName: 'Domain', name: 'domain', type: 'text', isCustom: true, getValue: (a) => a.domain },
  { displayName: 'Owner', name: 'owner', type: 'relation', isCustom: true, getValue: (a) => a.owner },
  { displayName: 'Lifecycle Stage', name: 'lifecycle_stage', type: 'select', isCustom: true, getValue: (a) => a.lifecycle_stage },
  { displayName: 'Renewal Date', name: 'renewal_date', type: 'date', isCustom: true, getValue: (a) => a.renewal_date },

  // ── System (read-only / computed / sync-later) ────────────────────
  { displayName: 'ID', name: 'id', type: 'number', isCustom: false, required: true, getValue: (a) => a.id },
  { displayName: 'Organizations', name: 'customers', type: 'relation', isCustom: false, getValue: (a) => a.customers },
  { displayName: 'Address', name: 'address', type: 'text', isCustom: false, getValue: (a) => a.address },
  { displayName: 'Email', name: 'email', type: 'text', isCustom: false, getValue: (a) => a.email },
  { displayName: 'Phone', name: 'phone', type: 'text', isCustom: false, getValue: (a) => a.phone },
  { displayName: 'Created At', name: 'created_at', type: 'date', isCustom: false, required: true, getValue: (a) => a.created_at },
  { displayName: 'Updated At', name: 'updated_at', type: 'date', isCustom: false, required: true, getValue: (a) => a.updated_at },
  { displayName: 'Health Score', name: 'health_score', type: 'number', isCustom: false, getValue: (a) => a.health_score },
  { displayName: 'Health Category', name: 'health_category', type: 'select', isCustom: false, getValue: (a) => a.health_category },
  { displayName: 'Pulse', name: 'pulse', type: 'text', isCustom: false, getValue: (a) => a.pulse },
  { displayName: 'AI Pulse Score', name: 'ai_pulse_score', type: 'select', isCustom: false, getValue: (a) => a.ai_pulse_score },
  { displayName: 'AI Pulse Reason', name: 'ai_pulse_reason', type: 'text', isCustom: false, getValue: (a) => a.ai_pulse_reason },
  { displayName: 'NPS Score', name: 'nps_score', type: 'number', isCustom: false, getValue: (a) => a.nps_score },
  { displayName: 'CSAT Score', name: 'csat_score', type: 'number', isCustom: false, getValue: (a) => a.csat_score },
  { displayName: 'ARR', name: 'arr', type: 'currency', isCustom: false, getValue: (a) => a.arr },
];
