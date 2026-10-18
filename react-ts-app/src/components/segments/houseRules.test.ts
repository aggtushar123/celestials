import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// Spec §3's house rules over the Segments components and pages.
const files = {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../pages/segments/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
};

houseRuleSuite('segments house rules', files);
rowsIconsTargetsSuite('segments house rules beyond the shared suite', files);
