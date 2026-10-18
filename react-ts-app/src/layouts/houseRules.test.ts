import { houseRuleSuite, rowsIconsTargetsSuite } from '../test/houseRules';

// Spec §1 "House rules" and .claude/skills/revenact-design/SKILL.md §4: the
// full house-rule suite plus the rows/icons/touch-target suite, over every
// non-test layout in this folder — layout markup cleanup, owner-approved
// 2026-10-06.
const files = import.meta.glob('./*.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

houseRuleSuite('layouts house rules', files);
rowsIconsTargetsSuite('layouts touch targets and icons', files);
