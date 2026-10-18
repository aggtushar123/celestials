import { houseRuleSuite } from '../../../test/houseRules';

// The portfolio's house rules over the Accounts panels, and the Accounts
// list page itself (the scanners live in src/test/houseRules.ts).
houseRuleSuite('accounts portfolio house rules', {
  ...(import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../../pages/accounts/List.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<
    string,
    string
  >),
});
