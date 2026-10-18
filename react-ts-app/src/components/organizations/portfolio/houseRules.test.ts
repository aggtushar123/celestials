import { houseRuleSuite } from '../../../test/houseRules';

// Spec §1 "House rules", enforced over every portfolio component so a
// regression fails here rather than at design review. The scanners and
// their self-check live in src/test/houseRules.ts.
houseRuleSuite(
  'portfolio house rules',
  import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
);
