import { describe, expect, it } from 'vitest';

// Fix wave item 4: the links inside phone meta lines take their 44px hit
// area from INLINE_TARGET (layout-neutral), so a wrapped meta line is not
// 44px per wrap. Each file names its meta-line links through it, and none
// writes the old `min-h-11 ... sm:min-h-0` link by hand. The list covers the
// work and agents rows, the pipeline items, mail detail and the Impact
// meta-line links (Impact PR) and the AI skills "Shows on" link (Settings PR).
const files = import.meta.glob(
  [
    '../components/work/TaskRowItem.tsx',
    '../components/work/FeedRowParts.tsx',
    '../components/work/BundleOutsideFields.tsx',
    '../components/pipelines/portfolio/itemParts.tsx',
    '../pages/communications/MailDetail.tsx',
    '../components/agents/AgentActionBody.tsx',
    '../components/plans/parts.tsx',
    '../components/plans/PlanHeader.tsx',
    '../components/plans/DraftPlanBanner.tsx',
    '../components/surveys/AnswersSection.tsx',
    '../components/surveys/SendHeader.tsx',
    '../components/campaigns/SendsSection.tsx',
    '../components/campaigns/Deliveries.tsx',
    '../components/rules/TriggerFields.tsx',
    '../components/canvas/OpenPlansStrip.tsx',
    '../components/canvas/PeopleList.tsx',
    '../pages/brain/Skills.tsx',
  ],
  { query: '?raw', eager: true, import: 'default' },
) as Record<string, string>;

describe('meta-line links (fix wave item 4)', () => {
  it('finds every file it checks', () => {
    expect(Object.keys(files)).toHaveLength(17);
  });

  it('use INLINE_TARGET, never a min-h-11 link that grows its line', () => {
    for (const [file, source] of Object.entries(files)) {
      expect(source, file).toContain('INLINE_TARGET');
      expect(source, file).not.toMatch(/inline-flex min-h-11 items-center[^`'"]*sm:min-h-0/);
    }
  });
});

// Final fix wave item 9: a standalone link alone on its row of a `py-1`
// list is not in a meta line; INLINE_TARGET's 44px hit areas would overlap
// the next row's, so it takes the room itself below sm instead.
const standalone = import.meta.glob(['../components/campaigns/LegacyRecipients.tsx'], { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

describe('standalone list links (final fix wave item 9)', () => {
  it('finds every file it checks', () => {
    expect(Object.keys(standalone)).toHaveLength(1);
  });

  it('take a real 44px row below sm, never INLINE_TARGET', () => {
    for (const [file, source] of Object.entries(standalone)) {
      expect(source, file).not.toContain('INLINE_TARGET');
      expect(source, file).toContain('min-h-11 sm:min-h-0 inline-flex items-center');
    }
  });
});
