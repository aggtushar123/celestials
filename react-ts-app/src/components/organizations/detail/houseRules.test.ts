import { houseRuleSuite } from '../../../test/houseRules';

// Spec 2026-09-26 §1 and the design skill's §4 over every part of the
// organization page, and the page itself.
houseRuleSuite('organization page house rules', {
  ...(import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../../pages/organizations/Details.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<
    string,
    string
  >),
  ...(import.meta.glob('./listStyles.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
});

// The four tabs whose forms + Add shows in its sheet (and whose own tabs the
// account page still renders): the full suite, not just colours/sizes.
// TasksTab and NotesTab used to load a pravatar.cc avatar for the account
// page's feed; both now share UserAvatar (layout markup cleanup review
// round 1), so the third-party-image rule applies here too.
houseRuleSuite(
  "the + Add forms' tabs",
  import.meta.glob(['../activity/CallSenseTab.tsx', '../activity/SurveysTab.tsx', '../activity/TasksTab.tsx', '../activity/NotesTab.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
);
