import type { CurrencyCode } from '../auth/authSlice';
import type { ActionKind, AgentKind } from '../agents/agentTypes';

// Mirrors /api/v1/brain/graph/?scope= (customers spec §3; Agents delivery 3
// contract "Brain graph"): real relations, the dashboards' own figures.

export type NodeKind = 'owner' | 'customer' | 'product' | 'initiative' | 'agent_action';

interface BaseNode {
  id: string;
  kind: NodeKind;
  label: string;
}
export interface CustomerNode extends BaseNode {
  kind: 'customer';
  arr: number;
  downside: number;
  risk: number;
  health_category: 'good' | 'average' | 'poor';
  health_score: number | null;
  days_to_renewal: number | null;
  open_tasks: number;
}
export interface GroupNode extends BaseNode {
  kind: 'product' | 'owner';
  customers: number;
  arr: number;
  downside: number;
}
export interface InitiativeNode extends BaseNode {
  kind: 'initiative';
  status: 'planned' | 'active';
  metric: string;
  metric_label: string;
  /** Minor #1: delivery 3 withholds this cut (`initiative_part`, `label_shown`). */
  member_label: string | null;
  target_value: number | null;
  target_by: string;
  owner: string | null;
}
/** A proposed agent action the reader may read, of any kind and agent (it
 *  replaces the old `proposal` node). `label` is the action's title. */
export interface AgentActionNode extends BaseNode {
  kind: 'agent_action';
  agent: AgentKind;
  action_kind: ActionKind;
  action_id: number;
}
export type GraphNode = CustomerNode | GroupNode | InitiativeNode | AgentActionNode;

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'owns' | 'runs_on' | 'targets' | 'acts_on' | 'serves';
}

export interface GraphPayload {
  as_of: string;
  currency: CurrencyCode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The scope's customers the reader can't open (Contract note 8). The only
   *  reader of this type is brain/graph/, which always sends it (minor #2). */
  hidden: number;
}
