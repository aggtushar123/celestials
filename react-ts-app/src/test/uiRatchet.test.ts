import { describe, expect, it } from 'vitest';
import { UI_OFFENCES, uiOffences, type UiOffence } from './houseRules';

// The whole-app ratchet (UI foundations spec §9.4). Applying the
// foundations rules to every file at once would fail on day one, so this
// counts each offence across every non-test .tsx under src/ and holds each
// count at or below its baseline. Every surface PR lowers the numbers for
// its folders and writes the new, lower baselines here; never raise one.
// When a count reaches zero, its rule moves into uiRuleSuite for the whole
// app and leaves this list.
//
// Exempt, by name: the ui primitives themselves (they own card markup and
// run uiRuleSuite), and for type sizes only the Persuade-mode pages whose
// font-display headings keep their 24/26/34px (spec §2).

const files = import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx', '!../components/ui/**'], {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

const SIZE_EXEMPT = ['../pages/auth/Login.tsx', '../pages/auth/WorkspaceSetup.tsx', '../pages/copilot/HomeView.tsx'];

/** Recorded by the foundations PR. Lower them as you fix; never raise them. */
const BASELINE: Record<UiOffence, number> = {
  sizes: 588,
  cards: 109,
  shadows: 115,
  opacityDisabled: 44,
  mono: 31,
  bold: 351,
};

const perFile = Object.entries(files).map(([file, source]) => {
  const counts = uiOffences(source);
  if (SIZE_EXEMPT.includes(file)) counts.sizes = 0;
  return [file, counts] as const;
});

const totals = Object.fromEntries(UI_OFFENCES.map((rule) => [rule, perFile.reduce((sum, [, counts]) => sum + counts[rule], 0)])) as Record<UiOffence, number>;

/** The ten files with the most offences of one kind, for the failure message. */
function worst(rule: UiOffence): string {
  return perFile
    .filter(([, counts]) => counts[rule] > 0)
    .sort((a, b) => b[1][rule] - a[1][rule])
    .slice(0, 10)
    .map(([file, counts]) => `${file} ${counts[rule]}`)
    .join(', ');
}

describe('UI ratchet (UI foundations spec §9.4)', () => {
  it('reads every .tsx source outside the primitives', () => {
    expect(perFile.length).toBeGreaterThan(400);
    expect(perFile.some(([file]) => file.startsWith('../components/ui/'))).toBe(false);
  });

  it.each(UI_OFFENCES)('has no more %s offences than the baseline', (rule) => {
    expect(totals[rule], `${rule} went up; the worst files: ${worst(rule)}`).toBeLessThanOrEqual(BASELINE[rule]);
  });

  it('keeps every baseline tight: when a count drops, lower its baseline to match', () => {
    expect(totals).toEqual(BASELINE);
  });
});
