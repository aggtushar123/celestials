import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over the Surveys components and pages, the Logged scores tab
// and its chart included (UI foundations spec §11: restyled, not retired).
const files = {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../pages/surveys/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
};
const HOSTED = '../../pages/surveys/HostedForm.tsx';

houseRuleSuite('surveys house rules', files);
rowsIconsTargetsSuite('surveys house rules beyond the shared suite', files);

describe('the hosted form (spec §2.4)', () => {
  it('is light only: no dark: variant', () => {
    expect(files[HOSTED]).toBeDefined();
    expect(files[HOSTED]).not.toMatch(/\bdark:/);
  });

  it('never reads the session: no store hook, no auth slice', () => {
    expect(files[HOSTED]).not.toMatch(/useAppSelector|useAppDispatch|useSelector|authSlice/);
  });

  it('never renders markup from the server (spec §3: plain text)', () => {
    expect(Object.entries(files).filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });
});
