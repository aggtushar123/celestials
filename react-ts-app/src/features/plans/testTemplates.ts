// Test-only: plan templates in the contract's shape (spec §1.6 and §4),
// shared by the Plans stub and the Rules stub's "Start a plan" action. The
// viewer is ME (Alice, id 1).
import { CARL, DANA, ME } from '../segments/testSegments';
import type { AssigneeRole, PlanTemplate, Priority, TemplateMilestone, TemplateTask } from './planTypes';

const task = (title: string, priority: Priority, offset_days: number, assignee_role: AssigneeRole = 'record_owner'): TemplateTask => ({
  title,
  priority,
  offset_days,
  assignee_role,
});
const step = (name: string, offset_days: number, tasks: TemplateTask[]): TemplateMilestone => ({ name, offset_days, tasks });

/** The counts the server computes: `length_days` is the largest offset. */
export function withCounts(template: Omit<PlanTemplate, 'milestone_count' | 'task_count' | 'length_days'>): PlanTemplate {
  const offsets = template.milestones.flatMap((milestone) => [milestone.offset_days, ...milestone.tasks.map((one) => one.offset_days)]);
  return {
    ...template,
    milestone_count: template.milestones.length,
    task_count: template.milestones.reduce((n, milestone) => n + milestone.tasks.length, 0),
    length_days: offsets.length > 0 ? Math.max(...offsets) : 0,
  };
}

const BUILT_IN = { description: '', is_builtin: true, is_owner: false, owner: null, sharing: 'workspace' as const, shared_with: [], updated_at: '2026-10-01T00:00:00Z' };

export const ONBOARDING = withCounts({
  ...BUILT_IN,
  id: 1,
  name: 'Onboarding',
  kind: 'onboarding',
  milestones: [
    step('Kick-off', 0, [task('Hold the kick-off call', 'high', 0), task('Confirm goals and success criteria', 'high', 3)]),
    step('Set up', 14, [task('Connect data sources', 'high', 10), task("Invite the customer's team", 'medium', 14)]),
    step('First value', 30, [task('Review first results with the champion', 'high', 28)]),
    step('Hand-off', 60, [task('Run the onboarding review', 'medium', 55), task('Hand over to the account owner', 'medium', 60, 'plan_owner')]),
  ],
});
export const SUCCESS = withCounts({
  ...BUILT_IN,
  id: 2,
  name: 'Success plan',
  kind: 'success',
  milestones: [
    step('Agree outcomes', 0, [task('Write the success plan with the customer', 'high', 7)]),
    step('Check-in', 30, [task('Review progress against outcomes', 'medium', 30)]),
    step('Expand adoption', 60, [task('Find the next team or use case', 'medium', 60)]),
    step('Review', 90, [task('Run the quarterly success review', 'high', 90)]),
  ],
});
export const SAVE = withCounts({
  ...BUILT_IN,
  id: 3,
  name: 'Save plan',
  kind: 'save',
  milestones: [
    step('Diagnose', 0, [task('Talk to the champion about the risk', 'high', 2), task('Write down the root cause', 'high', 5)]),
    step('Act', 14, [task('Agree a recovery plan with the customer', 'high', 10), task('Bring in an executive sponsor', 'medium', 14, 'plan_owner')]),
    step('Confirm', 30, [task('Check health and usage have recovered', 'high', 30)]),
  ],
});
export const QBR = withCounts({
  ...BUILT_IN,
  id: 4,
  name: 'QBR',
  kind: 'qbr',
  milestones: [
    step('Prepare', 0, [task("Pull the quarter's usage and outcomes", 'medium', 0), task('Draft the deck', 'medium', 5)]),
    step('Meet', 10, [task('Hold the business review', 'high', 10)]),
    step('Follow up', 14, [task('Send notes and next steps', 'high', 12), task('Log decisions on the account', 'medium', 14)]),
  ],
});
export const BUILTINS: PlanTemplate[] = [ONBOARDING, SUCCESS, SAVE, QBR];

/** Mine, private. */
export const MINE_TEMPLATE = withCounts({
  id: 10,
  name: 'Renewal prep',
  kind: 'other',
  description: 'What I do before every renewal.',
  is_builtin: false,
  is_owner: true,
  owner: ME,
  sharing: 'private',
  shared_with: [],
  milestones: [step('Prepare', 0, [task('Review the contract', 'high', 0, 'plan_owner')]), step('Renew', 30, [])],
  updated_at: '2026-10-02T09:00:00Z',
});
/** Carl's, shared with me by name. */
export const SHARED_TEMPLATE = withCounts({
  id: 11,
  name: "Carl's expansion play",
  kind: 'success',
  description: '',
  is_builtin: false,
  is_owner: false,
  owner: CARL,
  sharing: 'people',
  shared_with: [ME],
  milestones: [step('Find the team', 0, [task('Map the next team', 'medium', 7, 'plan_owner')])],
  updated_at: '2026-10-03T09:00:00Z',
});
/** Dana's, private: unreadable, so a 404 like a missing id. */
export const DANA_TEMPLATE = withCounts({
  id: 12,
  name: "Dana's private play",
  kind: 'save',
  description: '',
  is_builtin: false,
  is_owner: false,
  owner: DANA,
  sharing: 'private',
  shared_with: [],
  milestones: [step('Call', 0, [])],
  updated_at: '2026-10-03T09:00:00Z',
});
export const TEMPLATES: PlanTemplate[] = [...BUILTINS, MINE_TEMPLATE, SHARED_TEMPLATE, DANA_TEMPLATE];

export const readableTemplate = (one: PlanTemplate) =>
  one.is_builtin || one.is_owner || one.sharing === 'workspace' || (one.sharing === 'people' && one.shared_with.some((person) => person.id === ME.id));

/** `{id, name}` for a template ME may use, else null (spec §1.8). */
export function templateRef(id: number): { id: number; name: string } | null {
  const found = TEMPLATES.find((one) => one.id === id && readableTemplate(one));
  return found ? { id: found.id, name: found.name } : null;
}
