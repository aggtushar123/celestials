import { describe, it, expect } from 'vitest';

// jsdom does no layout, so this guards the source instead. A flex or grid
// item's minimum width defaults to its content's, so a card holding a wide
// ScrollTable (or a long unbroken header) grew its track and pushed the whole
// dashboard sideways. Every multi-column row in a view lets its children
// shrink, so wide content scrolls inside its own panel instead.
const views = {
  ...import.meta.glob('./tabs/*/ControlsView.tsx', { query: '?raw', eager: true, import: 'default' }),
  ...import.meta.glob('./tabs/*/*View.tsx', { query: '?raw', eager: true, import: 'default' }),
  ...import.meta.glob('../health/HealthDistribution.tsx', { query: '?raw', eager: true, import: 'default' }),
} as Record<string, string>;

const ROW = /className="([^"]*(?:\bgrid-cols-|:flex-row\b)[^"]*)"/g;

describe('dashboard view rows', () => {
  it('finds the views it guards', () => expect(Object.keys(views).length).toBeGreaterThan(10));

  it('let every card in a multi-column row shrink below its content', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(views)) {
      for (const [, classes] of source.matchAll(ROW)) {
        if (!classes.includes('[&>*]:min-w-0')) offenders.push(`${file}: ${classes}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never size flex siblings to fractions that, with the gap, add up past the row', () => {
    // Three `w-1/3 shrink-0` cards plus two gaps are wider than the row.
    const offenders = Object.entries(views)
      .filter(([, source]) => /w-1\/3[^"]*shrink-0|shrink-0[^"]*w-1\/3/.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
