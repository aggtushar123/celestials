import { describe, expect, it } from 'vitest';
import { RAW, houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules (revenact-design §4) over every Agents component and the
// History page; and, for tokens, targets and copy only (their
// frame is SettingsFrame since the Settings PR; components/settings.houseRules.test.ts
// holds them to the foundations rules), the Agent settings pages and their frame.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/work/History.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const settingsPages = raw(
  import.meta.glob(['../../pages/settings/AgentsSettingsPage.tsx', '../../pages/settings/AgentActionsPage.tsx', '../../pages/settings/AgentSettingsFrame.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }),
);
// The new Agents files in features/ (delivery 1 and the delivery 2 drafts) and the components folder's .ts files,
// for the copy rule (the older agentAccessApi.ts and agentsSlice.ts are left alone).
const copy = {
  ...files,
  ...settingsPages,
  ...raw(
    import.meta.glob(
      ['./*.ts', '../../features/agents/agentTypes.ts', '../../features/agents/agentsApi.ts', '../../features/agents/agentsText.ts', '../../features/agents/testAgents*.ts', '../../features/agents/agents*.test.ts', '../../features/agents/draft*.ts', '../../features/agents/testDrafts.ts'],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
};
// Agents delivery 3: the surfaces that say an agent made an object, each
// through the one shared line so its words and tokens stay in one place.
const madeBySurfaces = raw(
  import.meta.glob(
    [
      '../segments/SegmentHeader.tsx',
      '../rules/RuleHeader.tsx',
      '../campaigns/CampaignHeader.tsx',
      '../canvas/MapHeader.tsx',
      '../../pages/plans/TemplatesPage.tsx',
      '../../pages/plans/TemplateEditor.tsx',
    ],
    { query: '?raw', eager: true, import: 'default' },
  ),
);
// One primary per surface: each settings form's Save changes, and a draft's Send or Copy and open,
// and an unconfirmed draft's It was sent.
const PRIMARY_OWNERS = ['./DraftForm.tsx', './DraftPanel.tsx'];
// The settings forms reach their one primary through SettingsSave (one section) or, on the page's own bar, through useSettingsDraft.
const SAVE_OWNERS = ['./ActionsGridForm.tsx'];
// AgentsForm has no bar of its own: it hands its budgets to the page's save bar.
const DRAFT_OWNERS = ['./AgentsForm.tsx'];
// The only tables: Actions & approvals (form and read-only view) is kinds by agents, a real matrix.
const MATRIX = ['./ActionsGridForm.tsx', './ActionsGridSummary.tsx'];

houseRuleSuite('agents house rules', files);
rowsIconsTargetsSuite('agents rows, icons and targets', files, MATRIX);
rowsIconsTargetsSuite('agent settings pages: rows, icons and targets', settingsPages);

describe('agents: coverage, primaries, copy', () => {
  it('covers every component, the History page and the settings pages', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/work/History.tsx',
        './AgentActionBody.tsx',
        './AgentActionDecision.tsx',
        './UndoAction.tsx',
        './AgentCard.tsx',
        './AgentsForm.tsx',
        './AgentsSummary.tsx',
        './ActionsGridForm.tsx',
        './ActionsGridSummary.tsx',
        './AiOffNotice.tsx',
        './DraftForm.tsx',
        './DraftPanel.tsx',
        './DraftLine.tsx',
        './AgentDraftsList.tsx',
        './MadeByLine.tsx',
      ]),
    );
    expect(Object.keys(settingsPages)).toHaveLength(3);
  });

  it('says "made by" only through the shared line, on every object an agent can make', () => {
    expect(Object.keys(madeBySurfaces)).toHaveLength(6);
    for (const [file, source] of Object.entries(madeBySurfaces)) {
      expect(source, file).toContain('<MadeByLine');
      expect(source, file).not.toMatch(/Made by the/);
    }
  });

  it('keeps the made-by line a plain line: no live region, no primary', () => {
    expect(files['./MadeByLine.tsx']).not.toMatch(/role="status"|\bPRIMARY\b/);
  });

  it('keeps one primary per settings form and none elsewhere', () => {
    for (const [file, source] of Object.entries(files)) {
      if (file.includes('.test.')) continue;
      if (PRIMARY_OWNERS.includes(file)) expect(source, file).toContain('className={PRIMARY}');
      else expect(source, file).not.toMatch(/\bPRIMARY\b/);
    }
    for (const file of SAVE_OWNERS) expect(files[file], file).toMatch(/<SettingsSave(Bar)? /);
    for (const file of DRAFT_OWNERS) {
      expect(files[file], file).toContain('useSettingsDraft(');
      expect(files[file], file).not.toMatch(/<SettingsSave(Bar)? /);
    }
    for (const [file, source] of Object.entries(settingsPages)) expect(source, file).not.toMatch(/\bPRIMARY\b/);
  });

  it('keeps the settings pages on tokens', () => {
    expect(Object.entries(settingsPages).filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('allows an inline style only for the spend bar width', () => {
    // Any style= at all, however it is written, is caught here.
    const inline = Object.entries({ ...files, ...settingsPages }).flatMap(([file, source]) =>
      [...source.matchAll(/\bstyle=\{/g)].map((m) => `${file}: ${source.slice(m.index, source.indexOf('\n', m.index)).trim()}`),
    );
    // A computed percentage width on the fill is data, not a token.
    expect(inline).toEqual(['./AgentCard.tsx: style={{ width: `${width}%` }} />']);
  });

  it('writes no em dash in any Agents file, tests included', () => {
    for (const [file, source] of Object.entries(copy)) expect(source, file).not.toContain('\u2014');
  });

  it('gives every list a skeleton and an error state', () => {
    expect(files['../../pages/work/History.tsx']).toContain('<LoadingState');
    expect(files['../../pages/work/History.tsx']).toContain('<ErrorState');
    expect(settingsPages['../../pages/settings/AgentSettingsFrame.tsx']).toContain('<LoadingState');
    expect(settingsPages['../../pages/settings/AgentSettingsFrame.tsx']).toContain('<ErrorState');
    expect(files['./DraftPanel.tsx']).toContain('<LoadingState');
    expect(files['./DraftPanel.tsx']).toContain('<UiErrorState');
    expect(files['./AgentDraftsList.tsx']).toContain('<LoadingState');
    // Try again, through the drafts' copy.
    expect(files['./AgentDraftsList.tsx']).toContain('DRAFTS.TRY_AGAIN');
  });
});
