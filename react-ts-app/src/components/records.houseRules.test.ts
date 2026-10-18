import { houseRuleSuite, uiRuleSuite } from '../test/houseRules';

// The Records surface (UI foundations spec §9.2 row 1): Organizations,
// Accounts and Contacts, on every house rule and every foundations rule
// (§9.4). Out of this PR and not globbed: the create and edit modals, the
// + Add sheet forms and the other legacy activity tabs.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob(['./organizations/portfolio/**/*.{ts,tsx}', './organizations/detail/**/*.{ts,tsx}'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./organizations/CompanyViewTab.tsx', './organizations/AccountBriefPanel.tsx', './organizations/QuestionsPanel.tsx', './organizations/activity/HeadlinesTab.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('./accounts/**/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./contacts/ContactList.tsx', './contacts/ContactListItem.tsx', './contacts/ContactsToolbar.tsx', './contacts/ContactProfile.tsx', './contacts/HistoryItems.tsx', './contacts/ContactsTiles.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./shared/CustomObjectsTab.tsx', './shared/OwnerTile.tsx', './canvas/MapsTab.tsx', './canvas/MapRow.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/organizations/**/*.tsx', '../pages/accounts/**/*.tsx', '../pages/contacts/**/*.tsx', '!../pages/organizations/AccountFormModal.tsx'], { query: '?raw', eager: true, import: 'default' })),
};

// Shared legacy parts other surfaces still import with their old look,
// named one by one (spec §9.4: exemptions are files, not patterns). Each
// owning surface PR removes its line: listStyles (the organisation page's
// lists).
const LEGACY = {
  listStyles: './organizations/detail/listStyles.ts',
};

houseRuleSuite('Records: house rules', files);
uiRuleSuite('Records: foundations rules', files, {
  uppercase: [LEGACY.listStyles],
});
