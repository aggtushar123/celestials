import { houseRuleSuite } from '../../../test/houseRules';

// The design skill's §4 over every part of the account page, the page
// itself, and the shared parts it restyled.
houseRuleSuite('account page house rules', {
  ...(import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob(
    ['../../../pages/accounts/Details.tsx', '../../shared/CustomObjectsTab.tsx', '../../shared/OwnerTile.tsx'],
    { query: '?raw', eager: true, import: 'default' },
  ) as Record<string, string>),
});
