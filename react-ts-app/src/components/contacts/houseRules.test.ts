import { houseRuleSuite } from '../../test/houseRules';

// .claude/skills/revenact-design/SKILL.md §4 over the Contacts page (spec
// 2026-09-28 §7). ContactFormModal and ContactRowActionsPopover are older
// shared forms the account page also uses; they are not this page's to
// restyle.
houseRuleSuite('Contacts page house rules', {
  ...(import.meta.glob(['./ContactList.tsx', './ContactListItem.tsx', './ContactsToolbar.tsx', './ContactProfile.tsx', './HistoryItems.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>),
  ...(import.meta.glob(['../../pages/contacts/ContactsPage.tsx', '../../pages/contacts/ContactsFrame.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>),
});
