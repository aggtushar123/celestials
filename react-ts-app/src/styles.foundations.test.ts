import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Read from disk: Vitest's CSS handling empties a `?raw` stylesheet import.
const css = readFileSync('src/index.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

/** The declarations of the first rule whose selector starts at `selector`. */
function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

const light = block('@theme {');
const dark = block('html.dark, [data-theme="dark"] {');

describe('UI foundations tokens and styles (spec §5.7, §8, §2)', () => {
  it.each([
    ['success-ink', '#047857', '#34D399'],
    ['warning-ink', '#B45309', '#FBBF24'],
    ['danger-ink', '#B91C1C', '#F87171'],
    ['info-ink', '#1D4ED8', '#60A5FA'],
  ])('defines --color-%s in both themes', (name, lightValue, darkValue) => {
    expect(light).toMatch(new RegExp(`--color-${name}:\\s*${lightValue};`));
    expect(dark).toMatch(new RegExp(`--color-${name}:\\s*${darkValue};`));
  });

  it('leaves the legacy .rv-card alone (account settings are out of scope this round)', () => {
    const card = block('.rv-card {');
    expect(card).toMatch(/box-shadow:\s*var\(--rv-card-shadow\);/);
  });

  it('keeps the dark bridge off disabled PRIMARY controls only', () => {
    const bridge = css.slice(css.indexOf('html.dark :where(.bg-accent'));
    const selector = bridge.slice(0, bridge.indexOf('{'));
    // Controls carrying the ink-faint disabled classes escape the bridge...
    expect(selector).toContain('.disabled\\:text-ink-faint:disabled');
    expect(selector).toContain('.aria-disabled\\:text-ink-faint[aria-disabled="true"]');
    // ...but a plain disabled bg-accent button is not excluded wholesale.
    expect(selector).not.toMatch(/:not\(\s*:disabled/);
    expect(selector).not.toMatch(/(^|,\s*):disabled/);
    // PRIMARY really does carry both classes.
    const styles = readFileSync('src/components/ui/styles.ts', 'utf8');
    expect(styles).toMatch(/PRIMARY =[^\n]*\bdisabled:text-ink-faint\b/);
    expect(styles).toMatch(/PRIMARY =[^\n]*\baria-disabled:text-ink-faint\b/);
  });

  it('fades an overflowing row with an alpha mask', () => {
    const fade = block('.rv-scroll-fade[data-overflow] {');
    expect(fade).toMatch(/-webkit-mask-image:\s*linear-gradient/);
    expect(fade).toMatch(/\bmask-image:\s*linear-gradient/);
  });

  it('loads DM Serif Display and DM Mono, and no longer Lato', () => {
    expect(html).toMatch(/family=DM\+Serif\+Display/);
    expect(html).toMatch(/family=DM\+Mono/);
    expect(html).not.toMatch(/Lato/);
  });
});
