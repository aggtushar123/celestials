import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Read from disk: Vitest's CSS handling empties a `?raw` stylesheet import.
const css = readFileSync('src/index.css', 'utf8');

// UI broken-things fix 17: native checkboxes and radios rendered the
// browser's blue in both themes. The root takes the accent token, which
// html.dark redefines, so one rule covers light and dark.
describe('native control accent', () => {
  it('sets accent-color on the root from the accent token', () => {
    expect(css).toMatch(/:root\s*\{\s*accent-color:\s*var\(--color-accent\);\s*\}/);
  });

  it('has an accent token in both themes for it to read', () => {
    const light = css.slice(css.indexOf('@theme'), css.indexOf('html.dark, [data-theme="dark"]'));
    const dark = css.slice(css.indexOf('html.dark, [data-theme="dark"]'));
    expect(light).toMatch(/--color-accent:\s*#/);
    expect(dark).toMatch(/--color-accent:\s*#/);
  });
});
