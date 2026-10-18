import { describe, expect, it } from 'vitest';
import { houseRuleSuite, uiRuleSuite } from '../test/houseRules';

// The Impact surface (UI foundations spec §9.2 row 3): Segments, Surveys,
// Scenarios with its rules, Plans, Campaigns and Canvas, on every
// foundations rule (§9.4). Each area's own houseRules.test.ts keeps the
// house rules, the 44px targets and the area's own rules; this file adds
// the foundations rules over all of them, the em-dash ban, the live-region
// rule, and the house rules over the legacy Scenarios pages, restyled in
// this PR (spec §11 answer 4).
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob(['./{segments,surveys,rules,plans,campaigns,canvas}/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/{segments,surveys,scenarios,rules,plans,campaigns,canvas}/*.{ts,tsx}', '!../pages/**/*.test.{ts,tsx}'], { query: '?raw', eager: true, import: 'default' })),
};

// The public pages (/s/:token, /u/:token: no shell, light only, their own
// round) keep their one hand-written card and their loading region.
const PUBLIC = ['../pages/surveys/HostedForm.tsx', '../pages/campaigns/Unsubscribe.tsx'];
// The five areas whose UI files hold no em dash at all.
const NO_EM_DASH = /^(?:\.\/|\.\.\/pages\/)(?:plans|segments|rules|campaigns|canvas)\//;
// A role="status" element rendered only under a condition, or hidden when
// empty: it must always be in the DOM, only its children change.
const CONDITIONAL_STATUS = /(?:\?|&&)\s*\(?\s*<\w+[^>]*\brole="status"/;
const HIDDEN_STATUS = /role="status"[^>]*\bempty:hidden\b/;

const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
const legacyScenarios = Object.fromEntries(Object.entries(files).filter(([file]) => file.startsWith('../pages/scenarios/')));

uiRuleSuite('Impact: foundations rules', files, { cards: PUBLIC });
houseRuleSuite('Impact: the legacy Scenarios pages', legacyScenarios);

describe('Impact: copy, live regions and coverage', () => {
  it('writes no em dash in the plans, segments, rules, campaigns or canvas UI files', () => {
    expect(sources.filter(([file, source]) => NO_EM_DASH.test(file) && source.includes('\u2014')).map(([file]) => file)).toEqual([]);
  });

  it('never hides or unmounts a role="status" region between updates', () => {
    expect(
      sources.filter(([file, source]) => !PUBLIC.includes(file) && (CONDITIONAL_STATUS.test(source) || HIDDEN_STATUS.test(source))).map(([file]) => file),
    ).toEqual([]);
  });

  it('animates no colour in the legacy Scenarios pages (transition-colors or transition-all)', () => {
    expect(Object.entries(legacyScenarios).filter(([, source]) => /\btransition-(?:colors|all)\b/.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('writes no no-op hover in the legacy Scenarios pages (a muted text hovering to muted)', () => {
    expect(Object.entries(legacyScenarios).filter(([, source]) => /\btext-ink-muted hover:text-ink-muted\b/.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('draws no table: every Impact list is a list card of rows', () => {
    expect(sources.filter(([, source]) => /<table\b/.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('covers every migrated folder', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        './segments/SegmentRow.tsx',
        './segments/segmentGrid.ts',
        '../pages/segments/Builder.tsx',
        './surveys/AnswersSection.tsx',
        '../pages/surveys/SurveysPage.tsx',
        '../pages/surveys/SurveyTrendChart.tsx',
        './rules/RuleHeader.tsx',
        '../pages/rules/RuleBuilder.tsx',
        '../pages/scenarios/ScenariosList.tsx',
        '../pages/scenarios/EditNodePane.tsx',
        './plans/PlansBoard.tsx',
        '../pages/plans/TemplatesPage.tsx',
        './campaigns/SendsSection.tsx',
        '../pages/campaigns/CampaignsHome.tsx',
        './canvas/MapHeader.tsx',
        '../pages/canvas/MapEditor.tsx',
      ]),
    );
  });
});
