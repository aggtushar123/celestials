import { describe, expect, it } from 'vitest';
import { checkTemplate, emptyTemplateDraft, newTemplateMilestone, newTemplateTask, templateCounts, templateDraftOf, toTemplateWrite } from './templateDraft';
import { MINE_TEMPLATE, SHARED_TEMPLATE } from './testTemplates';

describe('the template editor draft (spec §2.4)', () => {
  it('starts with one empty milestone on day 0, private, kind Other', () => {
    const draft = emptyTemplateDraft();
    expect(draft).toMatchObject({ name: '', kind: 'other', description: '', sharing: 'private', sharedWith: [] });
    expect(draft.milestones).toHaveLength(1);
    expect(draft.milestones[0]).toMatchObject({ name: '', offset: '0', tasks: [] });
  });

  it('round-trips a template into its write body', () => {
    expect(toTemplateWrite(templateDraftOf(MINE_TEMPLATE))).toEqual({
      name: 'Renewal prep',
      kind: 'other',
      description: 'What I do before every renewal.',
      milestones: MINE_TEMPLATE.milestones,
      sharing: 'private',
      shared_with: [],
    });
    expect(toTemplateWrite(templateDraftOf(SHARED_TEMPLATE)).shared_with).toEqual([1]);
  });

  it('adds blank milestones and tasks and counts them', () => {
    const draft = emptyTemplateDraft();
    draft.milestones.push(newTemplateMilestone(30));
    draft.milestones[0].tasks.push(newTemplateTask(), newTemplateTask());
    expect(draft.milestones[1]).toMatchObject({ offset: '30', tasks: [] });
    expect(draft.milestones[0].tasks[0]).toMatchObject({ title: '', priority: 'medium', offset: '0', role: 'record_owner' });
    expect(templateCounts(draft)).toEqual({ milestones: 2, tasks: 2 });
  });

  it('checks names, offsets, limits and sharing before asking', () => {
    const draft = emptyTemplateDraft();
    draft.milestones[0].offset = '400';
    draft.milestones[0].tasks.push({ ...newTemplateTask(), title: '', offset: '-1' });
    draft.sharing = 'people';
    const found = checkTemplate(draft);
    expect(found.field).toEqual({ name: 'Give the template a name.', shared_with: 'Choose at least one teammate.' });
    expect(found.milestones[0].field).toEqual({ name: 'Give the milestone a name.', offset_days: 'Choose 0 to 365 days.' });
    expect(found.milestones[0].tasks[0]).toEqual({ title: 'Give the task a title.', offset_days: 'Choose 0 to 365 days.' });
    const many = { ...emptyTemplateDraft(), name: 'Big', milestones: Array.from({ length: 13 }, () => ({ ...newTemplateMilestone(0), name: 'Step' })) };
    expect(checkTemplate(many).field).toEqual({ milestones: 'Choose 1 to 12 milestones.' });
  });
});
