import type { Contact } from '../../features/customers/customersSlice';
import type { AttributeDef } from './attributeConfig';

// Every real field on revenact-backend's ContactSerializer (see
// docs/API_CONTRACTS.md -> customers -> Contact) — same "isCustom
// mechanically derived from what the real Add/Edit form actually
// sends" reasoning as organizationAttributes.ts/accountAttributes.ts.
// `companies`/`account_name` are System, not Custom — a Contact can't
// be moved between parents after creation (see the Contact model's
// own docstring), so neither is ever sent by ContactFormModal's own
// handleSubmit.
export const CONTACT_ATTRIBUTES: AttributeDef<Contact>[] = [
  // ── Custom (UI Editable) ──────────────────────────────────────────
  { displayName: 'Name', name: 'name', type: 'text', isCustom: true, required: true, getValue: (c) => c.name },
  { displayName: 'Role', name: 'role', type: 'select', isCustom: true, getValue: (c) => c.role },
  { displayName: 'Email', name: 'email', type: 'text', isCustom: true, getValue: (c) => c.email },
  { displayName: 'Phone', name: 'phone', type: 'text', isCustom: true, getValue: (c) => c.phone },
  { displayName: 'Status', name: 'status', type: 'select', isCustom: true, getValue: (c) => c.status },
  { displayName: 'Sentiment', name: 'sentiment', type: 'select', isCustom: true, getValue: (c) => c.sentiment },

  // ── System (read-only / computed / not exposed in any form) ───────
  { displayName: 'ID', name: 'id', type: 'number', isCustom: false, required: true, getValue: (c) => c.id },
  { displayName: 'Role (Display)', name: 'role_display', type: 'text', isCustom: false, required: true, getValue: (c) => c.role_display },
  { displayName: 'Last Contacted At', name: 'last_contacted_at', type: 'date', isCustom: false, getValue: (c) => c.last_contacted_at },
  { displayName: 'Companies', name: 'companies', type: 'relation', isCustom: false, required: true, getValue: (c) => c.companies },
  { displayName: 'Account Name', name: 'account_name', type: 'text', isCustom: false, getValue: (c) => c.account_name },
];
