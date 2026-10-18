import { describe, expect, it } from 'vitest';
import { cardOffenders, controlsMissingTarget, EMOJI, H_SCREEN, HEAVY_WEIGHT, iconButtonsWithoutLabel, RAW, sizeOffenceCount, sizeOffenders, uiOffences, UPPERCASE } from './houseRules';

describe('house-rules scanners', () => {
  it('flag real offenders and leave tokens alone', () => {
    expect(RAW.test('bg-orange-500')).toBe(true);
    expect(RAW.test('text-pink-600')).toBe(true);
    expect(RAW.test('bg-white')).toBe(true);
    expect(RAW.test('text-white')).toBe(true);
    expect(RAW.test('border-black')).toBe(true);
    expect(RAW.test('#fff')).toBe(true);
    expect(RAW.test('rgba(0,0,0,.5)')).toBe(true);
    expect(RAW.test('bg-surface')).toBe(false);
    expect(RAW.test('text-ink-muted')).toBe(false);
    expect(RAW.test('bg-danger-dim')).toBe(false);
    expect(RAW.test('accent-accent')).toBe(false);

    expect(sizeOffenders('text-[0.8rem]')).toEqual(['text-[0.8rem]']);
    expect(sizeOffenders('text-[10px]')).toEqual(['text-[10px]']);
    expect(sizeOffenders('text-[13px]')).toEqual([]);
    expect(sizeOffenders('text-sm')).toEqual(['named text size']);
    expect(sizeOffenders('text-[11px] text-ink')).toEqual([]);

    expect(EMOJI.test('<span>🚀</span>')).toBe(true);
    expect(EMOJI.test('<span>✨</span>')).toBe(true);
    expect(EMOJI.test('✦')).toBe(false);
    expect(EMOJI.test('· — › ‹')).toBe(false);

    expect(H_SCREEN.test('<div className="h-screen">')).toBe(true);
    expect(H_SCREEN.test('<div className="md:h-screen">')).toBe(true);
    expect(H_SCREEN.test('<div className="min-h-screen">')).toBe(false);
    expect(H_SCREEN.test('<div className="min-h-[100dvh]">')).toBe(false);
  });
});

describe('44px target scanner', () => {
  it('counts an inline link with INLINE_TARGET as a 44px target, and one without as an offender', () => {
    expect(controlsMissingTarget('<Link to="/x" className={`${INLINE_TARGET} text-ink`}>x</Link>')).toEqual([]);
    expect(controlsMissingTarget('<Link to="/x" className="text-ink">x</Link>')).toHaveLength(1);
  });
});

describe('UI foundations scanners (spec §9.4)', () => {
  it('finds card markup written by hand and the legacy rv-card, not controls, tints or glass', () => {
    expect(cardOffenders('<div className="rounded-xl border border-line bg-surface p-4">')).toHaveLength(1);
    expect(cardOffenders('<div className="bg-surface rounded-lg shadow-sm p-4">')).toHaveLength(1);
    expect(cardOffenders('<div className="rv-card p-4">')).toEqual(['rv-card']);
    expect(cardOffenders('<div className="rv-card-glass p-4">')).toEqual([]);
    expect(cardOffenders('<button className="min-h-11 rounded-lg border border-line bg-surface px-3">')).toEqual([]);
    expect(cardOffenders('<div className="rounded-xl bg-subtle p-4">')).toEqual([]);
    expect(cardOffenders('<div className="rounded-xl border-line bg-surface">')).toEqual([]);
  });

  it('leaves overlays, padded inputs and padded toggles alone', () => {
    expect(cardOffenders('<div className="absolute right-0 top-full rounded-lg border border-line bg-surface shadow-lg">')).toEqual([]);
    expect(cardOffenders('<div className="fixed inset-0 rounded-xl border border-line bg-surface">')).toEqual([]);
    expect(cardOffenders('<div className="rounded-xl border border-line bg-surface shadow-xl">')).toEqual([]);
    expect(cardOffenders('<input className="px-2.5 py-1.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-accent" />')).toEqual([]);
    expect(cardOffenders('<input className="px-3 py-2 bg-surface border border-line rounded-lg placeholder:text-ink-faint" />')).toEqual([]);
    expect(cardOffenders('<div className="flex gap-0.5 bg-surface border border-line-subtle rounded-lg p-0.5">')).toEqual([]);
    expect(cardOffenders('<div className="h-12 rounded-lg border border-line bg-surface px-3">')).toEqual([]);
    expect(cardOffenders('<div className="rounded-xl border border-line bg-surface p-4">')).toHaveLength(1);
  });

  it('counts each off-scale size, named sizes included', () => {
    expect(sizeOffenceCount('text-sm text-sm text-[12px] text-[13px] text-[0.8rem]')).toBe(4);
  });

  it('counts every offence the ratchet tracks', () => {
    expect(uiOffences('text-[12px] text-sm text-[13px] shadow-sm disabled:opacity-50 font-mono-brand font-bold font-semibold')).toEqual({
      sizes: 2,
      cards: 0,
      shadows: 1,
      opacityDisabled: 1,
      mono: 1,
      bold: 1,
    });
  });

  it('flags an ICON_BUTTON with no aria-label', () => {
    expect(iconButtonsWithoutLabel('<button type="button" className={ICON_BUTTON}>x</button>')).toHaveLength(1);
    expect(iconButtonsWithoutLabel('<button type="button" aria-label="Close" className={ICON_BUTTON}>x</button>')).toEqual([]);
    expect(iconButtonsWithoutLabel('<button type="button" className={`${ICON_BUTTON} absolute`} aria-label="Clear search">x</button>')).toEqual([]);
    expect(iconButtonsWithoutLabel('<button type="button" className={BUTTON}>Save</button>')).toEqual([]);
  });

  it('knows the heavy weights and a real uppercase class', () => {
    expect('font-bold font-medium font-black font-semibold'.match(HEAVY_WEIGHT)).toEqual(['font-bold', 'font-medium', 'font-black']);
    expect('uppercase tracking-wider'.match(UPPERCASE)).toEqual(['uppercase']);
    expect('data-uppercase normal-case'.match(UPPERCASE)).toBeNull();
  });
});
