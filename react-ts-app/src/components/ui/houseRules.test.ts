import { houseRuleSuite, uiRuleSuite } from '../../test/houseRules';

// The ui folder and the /__ui gallery hold every house rule and every
// foundations rule (UI foundations spec §9.4). The primitives own card
// markup; styles.ts owns CODE (DM Mono); type.ts owns the eyebrow's
// uppercase.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/dev/UiGallery.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const primitives = Object.keys(files).filter((file) => file.startsWith('./'));

houseRuleSuite('ui primitives: house rules', files);
uiRuleSuite('ui primitives: foundations rules', files, {
  cards: primitives,
  shadows: primitives,
  mono: ['./styles.ts'],
  uppercase: ['./type.ts'],
});
