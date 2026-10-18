import { describe, expect, it } from 'vitest';
import { RAW, houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules (revenact-design §4) over every Work component, the Work
// pages and the Work bar; and, for tokens, targets and copy only (their frame
// is SettingsFrame since the Settings PR; components/settings.houseRules.test.ts holds them
// to the foundations rules), the Settings › Work pages and their frame.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(['../../pages/work/MyWork.tsx', '../../pages/work/WorkInbox.tsx', '../../pages/work/History.tsx', '../../pages/work/WorkRoutes.tsx'], {
      query: '?raw',
      eager: true,
      import: 'default',
    }),
  ),
};
const settingsPage = raw(
  import.meta.glob(
    [
      '../../pages/settings/WorkRecommendationsPage.tsx',
      '../../pages/settings/WorkTasksPage.tsx',
      '../../pages/settings/WorkNotificationsPage.tsx',
      '../../pages/settings/WorkSettingsFrame.tsx',
    ],
    { query: '?raw', eager: true, import: 'default' },
  ),
);
// Every file in the three Work folders, tests included, plus the settings pages, for the copy rule.
const everything = {
  ...files,
  ...settingsPage,
  ...raw(import.meta.glob(['./*.ts', '../../features/work/*.ts', '../../pages/work/*.tsx'], { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
const PAGES = ['../../pages/work/MyWork.tsx', '../../pages/work/WorkInbox.tsx', '../../pages/work/History.tsx'];
// One primary per surface: My work's quick-add Add (the settings save bar lives in the shared frame).
// Work home's Ready to run: its first row's Review & run (owner, 2026-10-17).
// A guided bundle's Yes (guided agent, 2026-10-18), in place of the panel's Run.
// A sales report's Download (2026-10-18), once nothing else is asked.
const PRIMARY_OWNERS = ['./QuickAdd.tsx', './BundlePanel.tsx', './MatchDialog.tsx', './ReadyToRun.tsx', './GuidedConversation.tsx', './SalesReport.tsx'];

houseRuleSuite('work house rules', files);
rowsIconsTargetsSuite('work rows, icons and targets', files);
rowsIconsTargetsSuite('work settings page: rows, icons and targets', settingsPage);

describe('work: coverage, figures, states, cards, copy', () => {
  it('covers the pages, the bar and every component', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        ...PAGES,
        '../../pages/work/WorkRoutes.tsx',
        './QueueRail.tsx',
        './KindChips.tsx',
        './TeamPeople.tsx',
        './TaskPanelHost.tsx',
        './TaskSheet.tsx',
        './TaskPanel.tsx',
        './TaskFields.tsx',
        './TaskFacts.tsx',
        './TaskValue.tsx',
        './ActivityTrail.tsx',
        './CommentBox.tsx',
        './AssigneeSelect.tsx',
        './TaskRowItem.tsx',
        './TeamRow.tsx',
        './TeamSkeleton.tsx',
        './TaskPanelSkeleton.tsx',
        './WorkFrame.tsx',
        './AssignForm.tsx',
        './DismissForm.tsx',
        './WorkSettingsForm.tsx',
        './WorkSettingsSummary.tsx',
        './WorkTasksForm.tsx',
        './WorkTasksSummary.tsx',
        './WorkNotificationsForm.tsx',
        './WorkNotificationsSummary.tsx',
        './FeedRowParts.tsx',
        './FeedTaskRow.tsx',
        './FeedDecideRows.tsx',
        './FeedSuggestionRow.tsx',
        './FeedRow.tsx',
        './FeedGroups.tsx',
        './FeedSkeleton.tsx',
        './WorkToast.tsx',
        './QuickAdd.tsx',
        './ReadyToRun.tsx',
        './WorkBrief.tsx',
        './BriefLists.tsx',
        './RecordEditor.tsx',
        './KeepQueryRedirect.tsx',
        './TeamQueue.tsx',
        './AskTheAgent.tsx',
      ]),
    );
    expect(Object.keys(settingsPage).sort()).toEqual([
      '../../pages/settings/WorkNotificationsPage.tsx',
      '../../pages/settings/WorkRecommendationsPage.tsx',
      '../../pages/settings/WorkSettingsFrame.tsx',
      '../../pages/settings/WorkTasksPage.tsx',
    ]);
  });

  it('uses at most four type sizes across the section', () => {
    const sizes = new Set(sources.flatMap(([, s]) => [...s.matchAll(/text-\[(\d+)px\]/g)].map((m) => m[1])));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });

  it('sets every figure with tabular figures', () => {
    for (const file of [
      './TaskRowItem.tsx',
      './TeamRow.tsx',
      './TaskFacts.tsx',
      './ActivityTrail.tsx',
      './FeedGroups.tsx',
      './TaskValue.tsx',
      './WorkSettingsSummary.tsx',
      './WorkTasksSummary.tsx',
      './WorkNotificationsSummary.tsx',
      './FeedRowParts.tsx',
    ]) {
      expect(files[file], file).toMatch(/\b(MONO|NUM)\b/);
    }
    for (const file of ['./FeedSuggestionRow.tsx', './WorkSettingsForm.tsx']) expect(files[file], file).toMatch(/<Figured /);
  });

  it('designs loading, empty and error states', () => {
    expect(files['../../pages/work/MyWork.tsx']).toMatch(/<FeedSkeleton \/>/);
    expect(files['../../pages/work/MyWork.tsx']).toMatch(/<ErrorState /);
    expect(files['../../pages/work/MyWork.tsx']).toMatch(/<EmptyState /);
    expect(files['./FeedGroups.tsx']).toMatch(/failedText/);
    expect(files['./TeamPeople.tsx']).toMatch(/<TeamSkeleton \/>/);
    expect(files['./TeamPeople.tsx']).toMatch(/<ErrorState /);
    expect(files['./TeamPeople.tsx']).toMatch(/<EmptyState /);
    expect(settingsPage['../../pages/settings/WorkSettingsFrame.tsx']).toMatch(/<ErrorState /);
    expect(settingsPage['../../pages/settings/WorkSettingsFrame.tsx']).toMatch(/<LoadingState /);
    for (const page of ['../../pages/settings/WorkRecommendationsPage.tsx', '../../pages/settings/WorkTasksPage.tsx', '../../pages/settings/WorkNotificationsPage.tsx']) {
      expect(settingsPage[page], page).toMatch(/<WorkSettingsFrame /);
    }
    expect(files['./TeamRow.tsx']).toMatch(/NO_DRILL/);
    expect(files['./TeamRow.tsx']).toMatch(/TRY_AGAIN/);
    expect(files['./TaskSheet.tsx']).toMatch(/<TaskPanelSkeleton \/>/);
    expect(files['./TaskSheet.tsx']).toMatch(/<ErrorBlock /);
    expect(files['./TaskSheet.tsx']).toMatch(/NO_TASK/);
    expect(files['./TaskPanelSkeleton.tsx']).toMatch(/animate-pulse/);
    for (const file of ['./FeedSkeleton.tsx', './TeamSkeleton.tsx', './TeamRow.tsx']) {
      expect(files[file], file).toMatch(/<LoadingState /);
    }
  });

  it('nests no card in a card: rows are flat inside one bordered list', () => {
    for (const file of ['./TaskRowItem.tsx', './TeamRow.tsx', './FeedTaskRow.tsx', './FeedDecideRows.tsx', './FeedSuggestionRow.tsx']) expect(files[file], file).not.toMatch(/rounded-(lg|xl)|border border-line|shadow/);
    expect(files['./FeedGroups.tsx']).toMatch(/<ListCard\s/);
    expect(files['./TeamPeople.tsx']).toMatch(/<ListCard /);
  });

  it('keeps one primary per surface: My work’s Add, the bundle panel’s Run', () => {
    for (const file of PRIMARY_OWNERS) expect(files[file], file).toMatch(/className=\{PRIMARY\}|className=\{`\$\{PRIMARY\} |primary \? PRIMARY : BUTTON/);
    for (const [file, source] of sources) if (!PRIMARY_OWNERS.includes(file)) expect(source, file).not.toMatch(/\bPRIMARY\b/);
  });

  it('draws no h1 on a Work page: "Work" in the bar is the title', () => {
    for (const page of PAGES) expect(files[page], page).not.toMatch(/font-display|<h1\b/);
  });

  it('touches no browser storage', () => {
    expect(sources.filter(([, s]) => /localStorage|sessionStorage/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('keeps the settings page on tokens', () => {
    expect(Object.entries(settingsPage).filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('writes no em dash anywhere in the Work folders or the Work settings pages, comments and tests included', () => {
    expect(Object.entries(everything).filter(([, s]) => s.includes('—')).map(([f]) => f)).toEqual([]);
  });
});
