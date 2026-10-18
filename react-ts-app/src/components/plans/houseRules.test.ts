import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over Plans (spec §2.6, Decision 1): both new folders
// whole, and the bell's kind icon.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/plans/*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../layout/NotificationKindIcon.tsx', { query: '?raw', eager: true, import: 'default' })),
};

houseRuleSuite('plans house rules', files);
rowsIconsTargetsSuite('plans house rules beyond the shared suite', files);

describe('plans: what the suite covers, markup from the server, and storage', () => {
  it('covers the pages, the board, the modal steps and the timeline', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/plans/ProjectsHome.tsx',
        '../../pages/plans/NewPlan.tsx',
        '../../pages/plans/PlanPage.tsx',
        '../../pages/plans/TemplatesPage.tsx',
        '../../pages/plans/TemplateEditor.tsx',
        './PlansBoard.tsx',
        './ReviewStep.tsx',
        './Timeline.tsx',
        './RecordPlans.tsx',
        './DraftPlanBanner.tsx',
      ]),
    );
  });

  it('never renders markup from the server', () => {
    expect(Object.entries(files).filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });

  it('leaves storage to planParams, which survives it throwing', () => {
    expect(Object.entries(files).filter(([, source]) => /localStorage|sessionStorage/.test(source)).map(([file]) => file)).toEqual([]);
  });
});
