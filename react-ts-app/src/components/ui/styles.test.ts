import { describe, expect, it } from 'vitest';
import * as portfolio from '../organizations/portfolio/styles';
import { BUTTON, CHECKBOX, CHOICE, CODE, DANGER, FIELD_ERROR, FOCUS, FORM_ALERT, ICON_BUTTON, META_DANGER, INLINE_TARGET, INPUT, NUM, OVERLAY, PRIMARY, QUIET, SELECT } from './styles';
import { TYPE } from './type';

const CONTROLS = { BUTTON, QUIET, PRIMARY, DANGER, ICON_BUTTON, SELECT, INPUT };

describe('ui/styles (UI foundations spec §3, §5.1)', () => {
  it('gives every control a 44px target below sm and the focus ring', () => {
    for (const [name, value] of Object.entries(CONTROLS)) {
      expect(value, name).toMatch(/\bmin-h-11\b/);
      expect(value, name).toContain(FOCUS);
    }
  });

  it('gives an inline link a 44px hit area below sm that takes no room in its line', () => {
    const classes = INLINE_TARGET.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['relative', 'before:absolute', 'before:h-11', 'before:top-1/2', 'before:-translate-y-1/2', 'sm:before:hidden']));
    // Nothing that adds height to the line itself.
    expect(INLINE_TARGET).not.toMatch(/(^|\s)(min-h-|h-|py-|-my-)/);
  });

  it('never dims a disabled control with opacity', () => {
    for (const [name, value] of Object.entries(CONTROLS)) expect(value, name).not.toMatch(/opacity/);
  });

  it('draws disabled buttons with tokens', () => {
    expect(PRIMARY).toContain('disabled:border-line disabled:bg-subtle disabled:text-ink-faint disabled:cursor-not-allowed');
    expect(PRIMARY).toContain('aria-disabled:border-line aria-disabled:bg-subtle aria-disabled:text-ink-faint aria-disabled:cursor-not-allowed');
    expect(BUTTON).toContain('disabled:bg-surface disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed');
    expect(QUIET).toContain('disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed');
  });

  it('draws an aria-disabled button like a disabled one (a Save that keeps focus)', () => {
    expect(BUTTON).toContain('aria-disabled:bg-surface aria-disabled:text-ink-faint aria-disabled:hover:bg-surface aria-disabled:cursor-not-allowed');
    expect(QUIET).toContain('aria-disabled:text-ink-faint aria-disabled:hover:bg-transparent aria-disabled:cursor-not-allowed');
    expect(DANGER).toContain('aria-disabled:text-ink-faint aria-disabled:hover:bg-surface aria-disabled:cursor-not-allowed');
    expect(ICON_BUTTON).toContain('aria-disabled:text-ink-faint aria-disabled:hover:bg-transparent aria-disabled:cursor-not-allowed');
  });

  it('keeps DANGER for destructive actions and ICON_BUTTON square', () => {
    expect(DANGER).toContain('text-danger-ink hover:bg-danger-dim');
    expect(ICON_BUTTON).toContain('min-w-11 sm:min-h-9 sm:min-w-9');
  });

  it('sets figures in the body font and code in DM Mono', () => {
    expect(NUM).toBe('tabular-nums');
    expect(CODE).toBe('font-mono-brand');
  });

  it('keeps the only shadow on overlays', () => {
    expect(OVERLAY).toBe('rounded-xl border border-line bg-elevated shadow-lg');
    for (const value of Object.values(CONTROLS)) expect(value).not.toMatch(/shadow/);
  });

  it('re-exports the shared buttons from the portfolio styles, so old imports get the new look', () => {
    expect(portfolio.BUTTON).toBe(BUTTON);
    expect(portfolio.QUIET).toBe(QUIET);
    expect(portfolio.PRIMARY).toBe(PRIMARY);
    expect(portfolio.FOCUS).toBe(FOCUS);
  });

  it('turns the old MONO into NUM, so every figure leaves DM Mono at once', () => {
    expect(portfolio.MONO).toBe(NUM);
  });
});

describe('ui/type (UI foundations spec §2)', () => {
  const all = Object.values(TYPE).join(' ');

  it('uses only the four sizes', () => {
    const sizes = new Set([...all.matchAll(/text-\[(\d+)px\]/g)].map((match) => match[1]));
    expect([...sizes].sort()).toEqual(['11', '13', '15', '22']);
  });

  it('uses only the regular and semibold weights', () => {
    expect(all).not.toMatch(/font-(?:bold|medium|black|light)/);
  });

  it('keeps uppercase to the eyebrow, and the eyebrow to 11px semibold', () => {
    for (const [key, value] of Object.entries(TYPE)) {
      if (key === 'eyebrow') expect(value).toBe('text-[11px] leading-4 font-semibold uppercase tracking-wider text-ink-muted');
      else expect(value, key).not.toMatch(/uppercase/);
    }
  });

  it('writes the roles as the spec does', () => {
    expect(TYPE.display).toBe('text-[22px] leading-7 font-semibold tracking-tight text-ink');
    expect(TYPE.title).toBe('text-[15px] leading-6 font-semibold text-ink');
    expect(TYPE.body).toBe('text-[13px] leading-5 text-ink');
    expect(TYPE.meta).toBe('text-[11px] leading-4 text-ink-muted');
    expect(TYPE.label).toBe('text-[13px] leading-5 font-semibold text-ink');
  });
});

describe('ui/styles form pieces (Settings PR)', () => {
  it('sets field and form errors in the readable danger ink, on the scale', () => {
    expect(FIELD_ERROR).toBe('mt-1 text-[11px] leading-4 text-danger-ink');
    expect(FORM_ALERT).toBe('text-[13px] leading-5 text-danger-ink');
    expect(META_DANGER).toBe('text-[11px] leading-4 text-danger-ink');
  });

  it('gives a checkbox or radio label a 44px target below sm, and the box the accent and the focus ring', () => {
    expect(CHOICE).toMatch(/\bmin-h-11\b/);
    expect(CHOICE).toMatch(/\bsm:min-h-9\b/);
    expect(CHECKBOX).toContain('accent-accent');
    expect(CHECKBOX).toContain(FOCUS);
    expect(`${CHOICE} ${CHECKBOX}`).not.toMatch(/opacity|font-medium|text-ink-muted/);
  });
});
