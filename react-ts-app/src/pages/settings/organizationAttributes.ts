import type { Customer } from '../../features/customers/customersSlice';
import type { AttributeDef } from './attributeConfig';

// Every real field on revenact-backend's CustomerSerializer (see
// docs/API_CONTRACTS.md -> customers -> Customer) — replaces the
// previous hand-picked mock list, which included fields that don't
// even exist on the real model (e.g. "Starting SaaS MRR"). `isCustom`
// is derived mechanically from CustomerWritePayload's own field list —
// true only for a field an admin can actually set today through the
// app's own Add/Edit/Churn/Archive forms (OrganizationFormModal/
// ChurnOrganizationModal), not a subjective guess; everything else is
// read-only, server-computed, or (per those forms' own docstrings)
// "meant to eventually sync from other systems" rather than hand-typed.
export const ORGANIZATION_ATTRIBUTES: AttributeDef<Customer>[] = [
  // ── Custom (UI Editable) ──────────────────────────────────────────
  { displayName: 'Name', name: 'name', type: 'text', isCustom: true, required: true, getValue: (c) => c.name },
  { displayName: 'Domain', name: 'domain', type: 'text', isCustom: true, getValue: (c) => c.domain },
  { displayName: 'Address', name: 'address', type: 'text', isCustom: true, getValue: (c) => c.address },
  { displayName: 'Owner', name: 'owner', type: 'relation', isCustom: true, getValue: (c) => c.owner },
  { displayName: 'Lifecycle Stage', name: 'lifecycle_stage', type: 'select', isCustom: true, getValue: (c) => c.lifecycle_stage },
  { displayName: 'Joined Date', name: 'joined_date', type: 'date', isCustom: true, getValue: (c) => c.joined_date },
  { displayName: 'Renewal Date', name: 'renewal_date', type: 'date', isCustom: true, getValue: (c) => c.renewal_date },
  { displayName: 'Contract Start Date', name: 'contract_start_date', type: 'date', isCustom: true, getValue: (c) => c.contract_start_date },
  { displayName: 'Contract End Date', name: 'contract_end_date', type: 'date', isCustom: true, getValue: (c) => c.contract_end_date },
  { displayName: 'Churn Date', name: 'churn_date', type: 'date', isCustom: true, getValue: (c) => c.churn_date },
  { displayName: 'Churn Reason', name: 'churn_reason', type: 'text', isCustom: true, getValue: (c) => c.churn_reason },
  { displayName: 'Churn Comment', name: 'churn_comment', type: 'text', isCustom: true, getValue: (c) => c.churn_comment },
  { displayName: 'Is Archived', name: 'is_archived', type: 'boolean', isCustom: true, getValue: (c) => c.is_archived },

  // ── System (read-only / computed / sync-later) ────────────────────
  { displayName: 'ID', name: 'id', type: 'number', isCustom: false, required: true, getValue: (c) => c.id },
  { displayName: 'Email', name: 'email', type: 'text', isCustom: false, getValue: (c) => c.email },
  { displayName: 'Phone', name: 'phone', type: 'text', isCustom: false, getValue: (c) => c.phone },
  { displayName: 'Created By', name: 'created_by', type: 'relation', isCustom: false, getValue: (c) => c.created_by },
  { displayName: 'Modified By', name: 'modified_by', type: 'relation', isCustom: false, getValue: (c) => c.modified_by },
  { displayName: 'Created At', name: 'created_at', type: 'date', isCustom: false, required: true, getValue: (c) => c.created_at },
  { displayName: 'Updated At', name: 'updated_at', type: 'date', isCustom: false, required: true, getValue: (c) => c.updated_at },
  { displayName: 'Health Score', name: 'health_score', type: 'number', isCustom: false, getValue: (c) => c.health_score },
  { displayName: 'Health Category', name: 'health_category', type: 'select', isCustom: false, getValue: (c) => c.health_category },
  { displayName: 'Pulse', name: 'pulse', type: 'text', isCustom: false, getValue: (c) => c.pulse },
  { displayName: 'AI Pulse Score', name: 'ai_pulse_score', type: 'select', isCustom: false, getValue: (c) => c.ai_pulse_score },
  { displayName: 'AI Pulse Reason', name: 'ai_pulse_reason', type: 'text', isCustom: false, getValue: (c) => c.ai_pulse_reason },
  { displayName: 'NPS Score', name: 'nps_score', type: 'number', isCustom: false, getValue: (c) => c.nps_score },
  { displayName: 'CSAT Score', name: 'csat_score', type: 'number', isCustom: false, getValue: (c) => c.csat_score },
  { displayName: 'ARR (Billed at Account)', name: 'arr_billed_at_account', type: 'currency', isCustom: false, getValue: (c) => c.arr_billed_at_account },
  { displayName: 'ARR (Billed at HQ)', name: 'arr_billed_at_hq', type: 'currency', isCustom: false, getValue: (c) => c.arr_billed_at_hq },
  { displayName: 'Implementation Fee', name: 'implementation_fee', type: 'currency', isCustom: false, getValue: (c) => c.implementation_fee },
  { displayName: 'Total Contract Value', name: 'total_contract_value', type: 'currency', isCustom: false, getValue: (c) => c.total_contract_value },
  { displayName: 'Total Forecasted Renewal Revenue', name: 'total_forecasted_renewal_revenue', type: 'currency', isCustom: false, getValue: (c) => c.total_forecasted_renewal_revenue },
  { displayName: 'Primary Product', name: 'primary_product', type: 'text', isCustom: false, getValue: (c) => c.primary_product },
  { displayName: 'Additional Products Count', name: 'additional_products_count', type: 'number', isCustom: false, getValue: (c) => c.additional_products_count },
  { displayName: 'Top Source Channel', name: 'top_source_channel', type: 'text', isCustom: false, getValue: (c) => c.top_source_channel },
  { displayName: 'Total Contracted Seats', name: 'total_contracted_seats', type: 'number', isCustom: false, getValue: (c) => c.total_contracted_seats },
  { displayName: 'Total Active Seats', name: 'total_active_seats', type: 'number', isCustom: false, getValue: (c) => c.total_active_seats },
  { displayName: 'Seat Utilization %', name: 'seat_utilization_percentage', type: 'number', isCustom: false, getValue: (c) => c.seat_utilization_percentage },
  { displayName: 'Total Hires', name: 'total_hires', type: 'number', isCustom: false, getValue: (c) => c.total_hires },
  { displayName: 'Scope: Web App', name: 'scope_web_app', type: 'text', isCustom: false, getValue: (c) => c.scope_web_app },
  { displayName: 'CES %', name: 'ces_percentage', type: 'number', isCustom: false, getValue: (c) => c.ces_percentage },
];
