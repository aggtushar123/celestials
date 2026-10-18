import type { Node, Edge } from '@xyflow/react';

// A node's own saved configuration — see revenact-backend's
// services/scenarios/engine.py for exactly which of these fields the
// backend actually reads when running a scenario, and EditNodePane.tsx
// for which panels are real config vs. still an illustrative mockup
// (Assign Playbook/Slack Message/Create Pipeline/MS Teams/Send Survey
// have no backing system yet, on either side).
export type ScenarioNodeData = {
  action: string;
  label: string;
  emailService?: string;
  eventTrigger?: string;
  orgEnters?: string;
  // Send Email — real, sent via send_mail on the backend.
  emailSubject?: string;
  emailBody?: string;
  // Create Task — real, creates a Task on the backend.
  taskTitle?: string;
  // Set Attribute — real, but fixed to lifecycle_stage in v1 (see
  // engine.py's own docstring on why only a small allowlist of
  // Customer fields is settable at all).
  attributeValue?: string;
  // Condition / Filter's single real clause — one of two kinds, exactly
  // what services/scenarios/engine.py evaluates at run time.
  //
  // A field clause reads one fact about the customer. `conditionAttribute`
  // is an allowlist key, or `attr:<api_name>` for any AI attribute the
  // organisation has defined (services/attributes), so it is a string
  // rather than a union of the fixed names.
  conditionKind?: 'field' | 'semantic';
  conditionAttribute?: string;
  conditionOperator?: ConditionOperator;
  conditionValue?: string;
  // A semantic clause matches a plain-English phrase against the company's
  // recent interactions by embedding. `conditionThreshold` is the cosine
  // similarity it must clear, as a string because it is saved from an input.
  conditionPhrase?: string;
  conditionThreshold?: string;
  // Assign Owner — a person in this organisation, or a rule that picks one.
  assignTo?: number;
  assignRule?: '' | 'least_loaded';
  assignFunction?: string;
  // Notify — who hears about it, and what they are told.
  notifyWho?: 'owner' | 'manager' | 'user';
  notifyUser?: number;
  notifyMessage?: string;
};

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'is_one_of'
  | 'is_empty'
  | 'is_not_empty';

/** The operators that compare against nothing, so the value box goes away. */
export const VALUELESS_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty'];

export type ScenarioNodeType = 'entry' | 'operator' | 'action';

export interface ScenarioNodeDetail {
  id: string;
  data: ScenarioNodeData;
  type: ScenarioNodeType;
}

// Lowercase to match revenact-backend's Scenario.ApplyTo choices (and
// every other choice field in that codebase, e.g. Customer.lifecycle_stage)
// — see docs/API_CONTRACTS.md's `scenarios` section. Display labels are
// Title Case (ScenarioHeader's own radio labels), the value itself isn't.
export type ApplyToTarget = 'organizations' | 'accounts' | 'contacts';

export const APPLY_TO_LABELS: Record<ApplyToTarget, string> = {
  organizations: 'Organizations',
  accounts: 'Accounts',
  contacts: 'Contacts',
};

// A whole scenario — mirrors revenact-backend's ScenarioSerializer
// field-for-field (see scenarioApi.ts). `id` is a number now that this
// is a real Django row, not a client-generated localStorage key.
export interface Scenario {
  id: number;
  name: string;
  apply_to: ApplyToTarget;
  apply_to_display: string;
  nodes: Node<ScenarioNodeData>[];
  edges: Edge[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// The fields the builder actually sends on create/save — everything
// except the server-assigned id/timestamps/display label.
export type ScenarioWritePayload = Pick<
  Scenario,
  'name' | 'apply_to' | 'nodes' | 'edges' | 'is_active'
>;

// One `POST .../run/` result — mirrors ScenarioRunSerializer.
export interface ScenarioRunLogEntry {
  node_id: string | null;
  action: string | null;
  status: 'ok' | 'skipped' | 'failed';
  detail: string;
}

export interface ScenarioRun {
  id: number;
  scenario: number;
  customer: { id: number; name: string } | null;
  triggered_by: 'manual' | 'event';
  status: 'success' | 'failed';
  log: ScenarioRunLogEntry[];
  started_at: string;
  finished_at: string | null;
}
