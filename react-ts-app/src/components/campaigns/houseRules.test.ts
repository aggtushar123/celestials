import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over Campaigns (spec §2.6, Decision 1): both folders whole.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/campaigns/*.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.') && !file.endsWith('/testPages.tsx'));
const UNSUBSCRIBE = '../../pages/campaigns/Unsubscribe.tsx';

houseRuleSuite('campaigns house rules', files);
rowsIconsTargetsSuite('campaigns house rules beyond the shared suite', files);

describe('campaigns: coverage, plain text, copy, and the public page', () => {
  it('covers the pages, the editor, the preview, the sends and the deliveries', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/campaigns/CampaignsHome.tsx',
        '../../pages/campaigns/CampaignBuilder.tsx',
        '../../pages/campaigns/CampaignPage.tsx',
        UNSUBSCRIBE,
        './PreviewPane.tsx',
        './MessageFields.tsx',
        './SendsSection.tsx',
        './Deliveries.tsx',
        './SendDialog.tsx',
      ]),
    );
  });

  it('never renders markup from the server (spec §3: plain text)', () => {
    expect(sources.filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });

  it('writes no em dash in its copy', () => {
    expect(sources.filter(([, source]) => source.includes('—')).map(([file]) => file)).toEqual([]);
  });

  it('keeps the unsubscribe page light, and away from the session (spec §2.4)', () => {
    expect(files[UNSUBSCRIBE]).toBeDefined();
    expect(files[UNSUBSCRIBE]).not.toMatch(/\bdark:/);
    expect(files[UNSUBSCRIBE]).not.toMatch(/useAppSelector|useAppDispatch|useSelector|authSlice/);
  });

  it('never stores anything in the browser', () => {
    expect(sources.filter(([, source]) => /localStorage|sessionStorage/.test(source)).map(([file]) => file)).toEqual([]);
  });
});
