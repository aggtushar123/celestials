import { describe, expect, it } from 'vitest';
import { houseRuleSuite, sizeAndTokenSuite, uiRuleSuite } from '../test/houseRules';

// The Ops surface (UI foundations spec §9.2 row 2): Pipelines,
// Communications, Brain and Work, on every house rule and every
// foundations rule (§9.4). Out of this PR and not globbed: the create and
// edit modals (PipelineModals and the forms beside it), the task panel and
// its forms, the draft form, the Work and Agents settings pieces, and the
// AI usage, skills and feedback pages (pages/brain/Agents, Skills,
// Feedback, routed under Settings; components/settings.houseRules.test.ts holds them
// since the Settings PR).
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob(['./pipelines/portfolio/*.{ts,tsx}', '!./pipelines/portfolio/PipelineModals.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../pages/pipelines/**/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../pages/communications/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('./brain/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(['../pages/brain/*.{ts,tsx}', '../pages/brain/ask/*.{ts,tsx}', '!../pages/brain/Agents.tsx', '!../pages/brain/Skills.tsx', '!../pages/brain/Feedback.tsx'], {
      query: '?raw',
      eager: true,
      import: 'default',
    }),
  ),
  ...raw(import.meta.glob(['../pages/work/*.tsx', '!../pages/work/testPages.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(
      [
        './work/WorkFrame.tsx',
        './work/TaskRowItem.tsx',
        './work/TeamRow.tsx',
        './work/TeamSkeleton.tsx',
        './work/FeedGroups.tsx',
        './work/FeedTaskRow.tsx',
        './work/FeedDecideRows.tsx',
        './work/FeedSuggestionRow.tsx',
        './work/FeedRowParts.tsx',
        './work/FeedSkeleton.tsx',
      ],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
  ...raw(
    import.meta.glob(
      [
        './agents/AgentActionBody.tsx',
        './agents/AgentActionDecision.tsx',
        './agents/UndoAction.tsx',
        './agents/DraftLine.tsx',
        './agents/AgentDraftsList.tsx',
        './agents/DraftPanel.tsx',
      ],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
  ...raw(import.meta.glob(['./layout/BrainTabs.tsx'], { query: '?raw', eager: true, import: 'default' })),
};

// The owner-approved glass (spec §4.1, §11): the Communications shell. Its
// three files hold every rule but the house suite's "glass off".
const GLASS = ['../pages/communications/CommunicationsPage.tsx', '../pages/communications/MailboxView.tsx'];
// Legacy constants other surfaces still import (spec §9.4: exemptions are
// files, not patterns): brain/styles' LIST and SECTION_TITLE, kept for the
// task panel and the Work settings pieces until their PRs.
const LEGACY = { brainStyles: './brain/styles.ts' };

const outside = (names: string[]) => Object.fromEntries(Object.entries(files).filter(([file]) => !names.includes(file)));
const inside = (names: string[]) => Object.fromEntries(Object.entries(files).filter(([file]) => names.includes(file)));

houseRuleSuite('Ops: house rules', outside(GLASS));
sizeAndTokenSuite('Ops: the Communications glass shell', inside(GLASS));
uiRuleSuite('Ops: foundations rules', files, {
  cards: [LEGACY.brainStyles],
  uppercase: [LEGACY.brainStyles],
});

describe('Ops: glass and coverage', () => {
  it('keeps glass to the Communications shell, every row inside it flat', () => {
    const glassy = Object.entries(files).filter(([file, source]) => !file.includes('.test.') && /rv-card-glass|rv-glass-inner/.test(source));
    expect(glassy.map(([file]) => file).sort()).toEqual([...GLASS].sort());
    expect(glassy.filter(([, source]) => source.includes('rv-glass-inner')).map(([file]) => file)).toEqual([]);
  });

  it('covers every migrated folder', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../pages/pipelines/List.tsx',
        './pipelines/portfolio/pipelineColumns.ts',
        './pipelines/portfolio/PipelineItem.tsx',
        '../pages/communications/CommunicationsPage.tsx',
        '../pages/communications/queueColumns.ts',
        '../pages/communications/InboxList.tsx',
        '../pages/brain/WhatChanged.tsx',
        '../pages/brain/Graph.tsx',
        './brain/KnowledgeByFunctionPanel.tsx',
        '../pages/work/History.tsx',
        '../pages/work/MyWork.tsx',
        './work/TaskRowItem.tsx',
        './work/TeamRow.tsx',
        './work/TeamSkeleton.tsx',
        './work/FeedGroups.tsx',
        './work/FeedTaskRow.tsx',
        './work/FeedDecideRows.tsx',
        './work/FeedSuggestionRow.tsx',
        './work/FeedRowParts.tsx',
        './work/FeedSkeleton.tsx',
        './agents/AgentActionBody.tsx',
        './layout/BrainTabs.tsx',
      ]),
    );
  });
});
