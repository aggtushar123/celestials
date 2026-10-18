import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over the Rules components and pages (plan Decision 1):
// both new folders whole, the Scenarios tabs page and the Brain routes. The
// legacy canvas pages beside ScenariosHome are held to the house and
// foundations rules by components/impact.houseRules.test.ts since the
// Impact PR.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/rules/*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/scenarios/ScenariosHome.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/BrainRoutes.tsx', { query: '?raw', eager: true, import: 'default' })),
};

houseRuleSuite('rules house rules', files);
rowsIconsTargetsSuite('rules house rules beyond the shared suite', files);

describe('rules: what the suite covers, and markup from the server (spec §3)', () => {
  it('covers the new pages and the shared review decision', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/rules/RuleBuilder.tsx',
        '../../pages/rules/RulePage.tsx',
        '../../pages/rules/RulesTab.tsx',
        '../../pages/scenarios/ScenariosHome.tsx',
        './ReviewDecision.tsx',
        './NightsSection.tsx',
      ]),
    );
  });

  it('never renders markup from the server', () => {
    expect(Object.entries(files).filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });
});
