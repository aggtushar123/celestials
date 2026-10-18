// Shared fixtures for AI attribute tests, shaped exactly like
// docs/API_CONTRACTS.md's `attributes` section.
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import { capabilitiesForRole } from './capabilities';
import type { AIAttribute, AIAttributeValue, AttributeWithLatest } from '../features/attributes/types';

export function attribute(overrides: Partial<AIAttribute> = {}): AIAttribute {
  return {
    id: 3,
    name: 'Product tier',
    api_name: 'product_tier',
    prompt: 'Which tier of our product does this company use?',
    value_type: 'picklist',
    picklist_options: ['SMB', 'Enterprise'],
    applies_to_customer: true,
    applies_to_account: true,
    refresh: 'nightly',
    created_at: '2026-09-22T09:00:00Z',
    updated_at: '2026-09-22T09:00:00Z',
    ...overrides,
  };
}

export function value(overrides: Partial<AIAttributeValue> = {}): AIAttributeValue {
  return {
    id: 90,
    attribute: 3,
    customer: 12,
    account: null,
    value: 'Enterprise',
    reasoning: 'Two notes and a ticket mention the Enterprise tier.',
    sources: [
      { type: 'note', id: 41, label: 'Product usage', date: '2026-09-22', company: 'Pizza Hut', company_type: 'customer', company_id: 12 },
    ],
    hidden_sources: 0,
    status: 'filled',
    origin: 'ai',
    set_by: { id: 5, name: 'Dana' },
    computed_at: '2026-09-22T09:00:00Z',
    ...overrides,
  };
}

export function withLatest(attr: AIAttribute, latest: AIAttributeValue | null): AttributeWithLatest {
  const { id, name, api_name, prompt, value_type, picklist_options, refresh } = attr;
  return { attribute: { id, name, api_name, prompt, value_type, picklist_options, refresh }, latest };
}

export function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

// A real auth store for the admin gate, same shape as WebhooksPage.test's.
export function makeStore(role: 'admin' | 'csm' = 'admin') {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
}

