import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';
import { ASK_AFTER_SCOPE, ASK_FROM_A_TAB, BRAIN_STARTERS, VIEW_CHANGED } from '../../features/brain/askContext';

// The house rules over What changed, What's being done,
// What customers are saying, Feature Requests and Anomalies: every Brain
// component and these five pages. The Graph keeps its own styling (owner's
// 2026-10-06 brain-polish brief, item 2/3 only) and stays outside the suite.
// Knowledge by function moved onto a table card in the Ops PR and joins the suite.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const all = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/WhatChanged.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Doing.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Customers.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/FeatureRequests.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Anomalies.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/ask/*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../features/brain/askContext.ts', { query: '?raw', eager: true, import: 'default' })),
};
const shared = raw(import.meta.glob(['../rules/ReviewDecision.tsx', '../agents/AgentActionDecision.tsx'], { query: '?raw', eager: true, import: 'default' }));

// Every Brain route's page, the Graph included (brain UI spec 2026-10-06 §1.4,
// §1.5): the frame, the controls and the title rules hold on all six.
const pages = {
  ...raw(import.meta.glob('../../pages/brain/WhatChanged.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Doing.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Customers.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/FeatureRequests.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Anomalies.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Graph.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const files = all;
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

houseRuleSuite('brain house rules', files);
rowsIconsTargetsSuite('brain rows, icons and targets', files, ['./KnowledgeByFunctionPanel.tsx']);

describe('brain: coverage, figures, states, storage, copy', () => {
  it('covers the page and every new component', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/brain/WhatChanged.tsx',
        './ScopeSwitch.tsx',
        './ScopeBriefCard.tsx',
        './MovesList.tsx',
        './WhyPanel.tsx',
        './MeasureTable.tsx',
        './ChangedSkeleton.tsx',
        './LostAccessNotice.tsx',
        '../../pages/brain/Doing.tsx',
        './InitiativeForm.tsx',
        './InitiativeRow.tsx',
        './DoingPlanRow.tsx',
        './DoingRuleRow.tsx',
        './DoingSkeleton.tsx',
        '../../pages/brain/Customers.tsx',
        './CustomerLists.tsx',
        './ScoresPanel.tsx',
        './SentimentPanel.tsx',
        './CustomersSkeleton.tsx',
        './Figured.tsx',
        '../../pages/brain/FeatureRequests.tsx',
        '../../pages/brain/Anomalies.tsx',
        './BrainFrame.tsx',
        './BrainControls.tsx',
        './BrainBackLink.tsx',
        './ChangedTiles.tsx',
        './DoingTiles.tsx',
        './CustomerTiles.tsx',
        '../../pages/brain/ask/BrainAskLayout.tsx',
        '../../features/brain/askContext.ts',
      ]),
    );
  });

  it('uses at most four type sizes across the page', () => {
    const sizes = new Set(sources.flatMap(([, s]) => [...s.matchAll(/text-\[(\d+)px\]/g)].map((m) => m[1])));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });

  it('sets every figure with tabular figures (NUM)', () => {
    for (const file of [
      './MovesList.tsx',
      './MeasureTable.tsx',
      './WhyPanel.tsx',
      './InitiativeRow.tsx',
      './DoingPlanRow.tsx',
      './DoingRuleRow.tsx',
      './ScoresPanel.tsx',
      './Figured.tsx',
    ]) {
      expect(files[file]).toMatch(/\bNUM\b/);
      expect(files[file]).not.toMatch(/\bMONO\b/);
    }
  });

  it('designs loading, empty and error states', () => {
    const page = files['../../pages/brain/WhatChanged.tsx'];
    expect(page).toMatch(/<ChangedSkeleton \/>/);
    expect(page).toMatch(/<UiEmptyState /);
    expect(page).toMatch(/<UiErrorState /);
    expect(files['./MovesList.tsx']).toMatch(/nothingMoved\(/);
    expect(files['./ScopeBriefCard.tsx']).toMatch(/<LoadingState /);
    expect(files['./ScopeBriefCard.tsx']).toMatch(/Try again/);
    expect(files['./WhyPanel.tsx']).toMatch(/animate-pulse/);
    expect(files['./WhyPanel.tsx']).toMatch(/Try again/);
  });

  it('nests no card in a card: the Why? panel is a flat block', () => {
    expect(files['./WhyPanel.tsx']).not.toMatch(/rounded-(lg|xl)/);
  });

  it('touches localStorage only in features/brain/brainScope.ts', () => {
    expect(sources.filter(([, s]) => /localStorage|sessionStorage/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('writes no em dash in its copy', () => {
    expect(sources.filter(([, s]) => s.includes('—')).map(([f]) => f)).toEqual([]);
  });

  it('sends every decision once', () => {
    for (const source of [shared['../agents/AgentActionDecision.tsx'], shared['../rules/ReviewDecision.tsx']]) {
      expect(source).toMatch(/useSubmitOnce\(/);
    }
  });

  it('designs What’s being done’s loading, empty and error states', () => {
    const page = files['../../pages/brain/Doing.tsx'];
    expect(page).toMatch(/<DoingSkeleton \/>/);
    expect(page).toMatch(/<UiErrorState /);
    expect(page).toMatch(/initiativesEmpty\(/);
    expect(page).toMatch(/DO\.NO_PLANS/);
    expect(page).toMatch(/DO\.NO_RULES/);
    expect(files['./DoingSkeleton.tsx']).toMatch(/<LoadingState /);
  });

  it('nests no card in a card: initiative, plan and rule rows are flat inside one bordered list', () => {
    for (const file of ['./InitiativeRow.tsx', './DoingPlanRow.tsx', './DoingRuleRow.tsx']) {
      expect(files[file]).not.toMatch(/rounded-xl|border border-line|shadow/);
    }
    expect(files['../../pages/brain/Doing.tsx']).toMatch(/<ListCard /);
  });

  it('sends every initiative write once', () => {
    for (const file of ['./InitiativeForm.tsx', './InitiativeRow.tsx']) expect(files[file]).toMatch(/useSubmitOnce\(/);
  });

  it('keeps one primary on What’s being done: New initiative', () => {
    expect(files['../../pages/brain/Doing.tsx']).toMatch(/className=\{PRIMARY\}/);
    for (const file of ['./InitiativeForm.tsx', './InitiativeRow.tsx', './DoingPlanRow.tsx', './DoingRuleRow.tsx']) {
      expect(files[file]).not.toMatch(/\bPRIMARY\b/);
    }
  });

  it('sets What customers are saying’s figures through Figured or MONO', () => {
    for (const file of ['./CustomerLists.tsx', './ScoresPanel.tsx', './SentimentPanel.tsx']) expect(files[file]).toMatch(/<Figured /);
  });

  it('designs What customers are saying’s loading, empty and error states', () => {
    const page = files['../../pages/brain/Customers.tsx'];
    expect(page).toMatch(/<CustomersSkeleton \/>/);
    expect(page).toMatch(/<UiErrorState /);
    expect(files['./CustomerLists.tsx']).toMatch(/asksEmpty\(/);
    expect(files['./CustomerLists.tsx']).toMatch(/CS\.NO_ANOMALIES/);
    expect(files['./ScoresPanel.tsx']).toMatch(/noCommentsText\(/);
    expect(files['./SentimentPanel.tsx']).toMatch(/turnedEmpty\(/);
    expect(files['./CustomersSkeleton.tsx']).toMatch(/<LoadingState /);
  });

  it('nests no card in a card: asks, anomalies, comments and sentiment rows are flat inside one bordered list', () => {
    for (const file of ['./CustomerLists.tsx', './ScoresPanel.tsx', './SentimentPanel.tsx']) {
      expect(files[file]).not.toMatch(/rounded-xl|border border-line|shadow/);
      expect(files[file]).toMatch(/<ListCard |<Card /);
    }
  });

  it('keeps What customers are saying free of a primary button: it only reads', () => {
    for (const file of ['../../pages/brain/Customers.tsx', './CustomerLists.tsx', './ScoresPanel.tsx', './SentimentPanel.tsx']) {
      expect(files[file]).not.toMatch(/\bPRIMARY\b/);
    }
  });

  it('sets Feature Requests and Anomalies’s figures through Figured', () => {
    for (const file of ['../../pages/brain/FeatureRequests.tsx', '../../pages/brain/Anomalies.tsx']) {
      expect(files[file]).toMatch(/<Figured /);
    }
  });

  it('draws no DM Serif Display title and no h1 on any Brain page: "Brain" in the bar is the title', () => {
    expect(Object.keys(pages)).toHaveLength(6);
    expect(Object.entries(pages).filter(([, s]) => /font-display|<h1\b/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('frames every Brain page with BrainFrame, full width, with no centred column', () => {
    for (const [file, source] of Object.entries(pages)) {
      expect(source, file).toMatch(/<BrainFrame>/);
      expect(source, file).not.toMatch(/\bmx-auto\b|max-w-(4xl|6xl)/);
    }
  });

  it('puts every scope switch through BrainControls, never inline on a page', () => {
    for (const [file, source] of Object.entries(pages)) {
      expect(source, file).not.toMatch(/<ScopeSwitch\b/);
      expect(source, file).toMatch(/<BrainControls brain=\{brain\} \/>/);
    }
  });

  it('opens each of the questions with ui tiles', () => {
    expect(files['./ChangedTiles.tsx']).toMatch(/<Tile\s/);
    expect(files['./DoingTiles.tsx']).toMatch(/<Tile\s/);
    expect(files['./CustomerTiles.tsx']).toMatch(/<Tile\s/);
    expect(files['../../pages/brain/WhatChanged.tsx']).toMatch(/variant="tiles"/);
    expect(files['../../pages/brain/Doing.tsx']).toMatch(/variant="tiles"/);
    expect(files['../../pages/brain/Customers.tsx']).toMatch(/variant="tiles"/);
  });
});

describe('brain: Ask Revenact copy (brain ask spec §2)', () => {
  const copy = [...Object.values(BRAIN_STARTERS).flat(), ASK_AFTER_SCOPE, ASK_FROM_A_TAB, VIEW_CHANGED];

  it('has three starters on each of the four tabs', () => {
    expect(Object.keys(BRAIN_STARTERS)).toEqual(['changed', 'waiting', 'doing', 'customers']);
    for (const questions of Object.values(BRAIN_STARTERS)) expect(questions).toHaveLength(3);
  });

  it('writes its copy in sentence case, with no em dash', () => {
    for (const line of copy) {
      expect(line[0]).toBe(line[0].toUpperCase());
      // Sentence case: no capital after the first word except the house acronyms and the proper noun.
      expect(line.slice(1).match(/\b[A-Z][a-z]+/g) ?? []).toEqual(line === ASK_FROM_A_TAB ? ['Brain'] : []);
      expect(line).not.toContain('—');
    }
  });

  it('ends every starter as a question', () => {
    for (const question of Object.values(BRAIN_STARTERS).flat()) expect(question.endsWith('?')).toBe(true);
  });
});
