import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// Spec §1 "House rules" and .claude/skills/revenact-design/SKILL.md §4: the
// full house-rule suite (tokens, type-size scale, no glass, no scrim raw
// colour, no third-party image, no emoji, no h-screen) plus the rows/icons/
// touch-target suite, over every non-test component in this folder — layout
// markup cleanup, owner-approved 2026-10-06.
const files = import.meta.glob('./*.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

houseRuleSuite('components/layout house rules', files);
rowsIconsTargetsSuite('components/layout touch targets and icons', files);
