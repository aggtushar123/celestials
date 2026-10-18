import type { Capability } from '../features/auth/authSlice';

// Test-only fixtures for the capability list on a logged-in `User`.
//
// Roles became org-defined rows carrying a set of capabilities (see
// revenact-backend's services/accounts/models.py:Role), so a test user
// needs real `permissions` for any gated UI to render. These two
// helpers exist so ~27 test files don't each carry their own copy of
// the capability list — and so adding a capability later is one edit,
// not twenty-seven.
export const ALL_CAPABILITIES: Capability[] = [
  'manage_users',
  'manage_org_settings',
  'manage_custom_objects',
  'manage_integrations',
  'manage_fx_rates',
  'view_all_accounts',
];

/** What the two built-in roles grant: Admin everything, CSM nothing —
 * exactly what the hardcoded `role === 'admin'` checks used to mean, so
 * tests written against those keep testing the same thing. */
export const capabilitiesForRole = (role: 'admin' | 'csm'): Capability[] =>
  role === 'admin' ? ALL_CAPABILITIES : [];
