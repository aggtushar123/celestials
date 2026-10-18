// The template editor (spec §2.4) as plain data. Offsets are kept as typed
// so a half-typed number is the person's to finish.
import type { NestedErrors, PlanErrors } from './planErrors';
import { CHECK, MILESTONES_MAX, OFFSET_MAX, TASKS_MAX } from './planOptions';
import type { AssigneeRole, PersonRef, PlanKind, PlanTemplate, Priority, Sharing, TemplateWrite } from './planTypes';

export interface TemplateTaskDraft {
  key: string;
  title: string;
  priority: Priority;
  offset: string;
  role: AssigneeRole;
}

export interface TemplateMilestoneDraft {
  key: string;
  name: string;
  offset: string;
  tasks: TemplateTaskDraft[];
}

export interface TemplateDraft {
  name: string;
  kind: PlanKind;
  description: string;
  milestones: TemplateMilestoneDraft[];
  sharing: Sharing;
  sharedWith: PersonRef[];
}

let sequence = 0;
const key = (prefix: string) => `${prefix}${++sequence}`;

export function newTemplateMilestone(offset = 0): TemplateMilestoneDraft {
  return { key: key('tm'), name: '', offset: String(offset), tasks: [] };
}

export function newTemplateTask(offset = 0): TemplateTaskDraft {
  return { key: key('tt'), title: '', priority: 'medium', offset: String(offset), role: 'record_owner' };
}

export function emptyTemplateDraft(): TemplateDraft {
  return { name: '', kind: 'other', description: '', milestones: [newTemplateMilestone(0)], sharing: 'private', sharedWith: [] };
}

export function templateDraftOf(template: PlanTemplate): TemplateDraft {
  return {
    name: template.name,
    kind: template.kind,
    description: template.description,
    milestones: template.milestones.map((milestone) => ({
      key: key('tm'),
      name: milestone.name,
      offset: String(milestone.offset_days),
      tasks: milestone.tasks.map((task) => ({ key: key('tt'), title: task.title, priority: task.priority, offset: String(task.offset_days), role: task.assignee_role })),
    })),
    sharing: template.sharing,
    sharedWith: template.shared_with,
  };
}

export function templateCounts(draft: TemplateDraft): { milestones: number; tasks: number } {
  return { milestones: draft.milestones.length, tasks: draft.milestones.reduce((n, milestone) => n + milestone.tasks.length, 0) };
}

export function toTemplateWrite(draft: TemplateDraft): TemplateWrite {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    description: draft.description.trim(),
    milestones: draft.milestones.map((milestone) => ({
      name: milestone.name.trim(),
      offset_days: Number(milestone.offset),
      tasks: milestone.tasks.map((task) => ({ title: task.title.trim(), priority: task.priority, offset_days: Number(task.offset), assignee_role: task.role })),
    })),
    sharing: draft.sharing,
    shared_with: draft.sharing === 'people' ? draft.sharedWith.map((person) => person.id) : [],
  };
}

const offsetBad = (typed: string) => {
  const value = Number(typed);
  return typed.trim() === '' || !Number.isInteger(value) || value < 0 || value > OFFSET_MAX;
};

export function checkTemplate(draft: TemplateDraft): PlanErrors {
  const field: Record<string, string> = {};
  const counts = templateCounts(draft);
  if (!draft.name.trim()) field.name = CHECK.TEMPLATE_NAME;
  if (counts.milestones === 0) field.milestones = CHECK.NO_MILESTONES;
  else if (counts.milestones > MILESTONES_MAX) field.milestones = CHECK.TOO_MANY_MILESTONES;
  else if (counts.tasks > TASKS_MAX) field.milestones = CHECK.TOO_MANY_TASKS;
  if (draft.sharing === 'people' && draft.sharedWith.length === 0) field.shared_with = CHECK.NO_PEOPLE;
  const milestones: NestedErrors[] = draft.milestones.map((milestone) => {
    const own: Record<string, string> = {};
    if (!milestone.name.trim()) own.name = CHECK.MILESTONE_NAME;
    if (offsetBad(milestone.offset)) own.offset_days = CHECK.OFFSET;
    const tasks = milestone.tasks.map((task) => {
      const one: Record<string, string> = {};
      if (!task.title.trim()) one.title = CHECK.TASK_TITLE;
      if (offsetBad(task.offset)) one.offset_days = CHECK.OFFSET;
      return one;
    });
    return { field: own, tasks };
  });
  return { field, milestones };
}
