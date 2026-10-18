import { describe, it, expect } from 'vitest';
import * as ai from '../tabs/ai-trending/chartTheme';
import * as tickets from '../tabs/ticket-overview/chartTheme';
import * as usage from '../tabs/usage-overview/chartTheme';
import {
  niceMax,
  compact,
  percentOf,
  ticksTo,
  barListHeight,
  DONUT,
  TOOLTIP_STYLE,
} from './chartPalette';

const HEX = /#[0-9a-f]{3,8}\b|rgb\(/i;

describe('chart colours', () => {
  it('are tokens only', () => {
    for (const mod of [ai, tickets, usage]) {
      for (const value of Object.values(mod)) {
        if (value && typeof value === 'object') {
          expect(JSON.stringify(value)).not.toMatch(HEX);
        }
      }
    }
  });

  it('keep semantic colours for meaning only', () => {
    expect(ai.SOURCE_COLORS.Email).not.toMatch(/danger|success/);
    expect(ai.SENTIMENT_COLORS.Negative).toBe('var(--danger)');
    expect(tickets.PRIORITY_COLORS.Critical).toBe('var(--danger)');
  });

  // AssigneesStackedBar stacks all five statuses in one bar with no room for
  // a colour that repeats; UsageScatter plots six bands as bare dots with no
  // shape/pattern to fall back on. Both charts also carry a legend now (see
  // AssigneesStackedBar.test.tsx / UsageScatter.test.tsx), but the legend
  // only works if the colours it's keying off are actually distinct.
  it('no two ticket statuses share a colour', () => {
    const values = Object.values(tickets.STATUS_COLORS);
    expect(new Set(values).size).toBe(values.length);
    expect(tickets.STATUS_COLORS['On Hold']).not.toBe(tickets.STATUS_COLORS.Closed);
  });

  it('no two usage bands share a colour', () => {
    const values = Object.values(usage.BAND_COLORS);
    expect(new Set(values).size).toBe(values.length);
    expect(usage.BAND_COLORS.at_capacity).not.toBe(usage.BAND_COLORS.over);
  });
});

describe('helpers', () => {
  it('niceMax rounds up to a clean boundary', () => expect(niceMax([0, 37])).toBe(40));
  it('compact leaves small numbers plain', () => expect(compact(300)).toBe('300'));
  it('percentOf handles an empty total', () => expect(percentOf(1, 0)).toBe('0'));
  it('ticksTo spaces evenly', () => expect(ticksTo(40)).toEqual([0, 10, 20, 30, 40]));
});

// The three checks above only look at the three tab-local `chartTheme.ts`
// modules. Everything else that draws a chart — the `charts/*.tsx` files
// that call `fill`/`stroke`/`contentStyle` directly, and the Health tab's
// own page — is just as capable of smuggling a literal colour back in, and
// none of it is re-exported anywhere a targeted import would catch. This
// scans every non-test source file under both trees for the same pattern, so
// a regression in any chart file (not just the palette modules) fails here
// instead of at design review.
describe('tokens only, everywhere', () => {
  it('no dashboard or health source file has a raw hex or rgb()/rgba() colour', () => {
    const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

    const modules = {
      ...import.meta.glob('../**/*.ts', { query: '?raw', eager: true, import: 'default' }),
      ...import.meta.glob('../**/*.tsx', { query: '?raw', eager: true, import: 'default' }),
      ...import.meta.glob('../../health/**/*.ts', {
        query: '?raw',
        eager: true,
        import: 'default',
      }),
      ...import.meta.glob('../../health/**/*.tsx', {
        query: '?raw',
        eager: true,
        import: 'default',
      }),
    } as Record<string, string>;

    const offenders = Object.entries(modules)
      .filter(([file]) => !file.includes('.test.'))
      .filter(([, source]) => RAW_COLOR.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});

// `ROLE` has no `info` entry — only a monochrome scale plus the three
// semantic tokens (loss/gain/caution). `info` (blue) is a leftover Tailwind
// colour with no meaning in this app's rubric, so anywhere it shows up in the
// dashboard it can only be decoration wearing a semantic-looking class —
// exactly finding 5's bug (the forecast range bar and its Likely marker) and
// the shape a regression would take. Covers `src/pages/health` too: its
// Distribution page is now Health's Distribution view inside the dashboard.
describe('no info role in the dashboard', () => {
  it('no dashboard or health source file reaches for bg/text/border-info or var(--info)', () => {
    const NO_INFO = /\b(?:bg|text|border|ring|fill|stroke)-info(?:-dim)?\b|var\(--(?:color-)?info\)/;

    const modules = {
      ...import.meta.glob('../**/*.ts', { query: '?raw', eager: true, import: 'default' }),
      ...import.meta.glob('../**/*.tsx', { query: '?raw', eager: true, import: 'default' }),
      ...import.meta.glob('../../health/**/*.ts', { query: '?raw', eager: true, import: 'default' }),
      ...import.meta.glob('../../health/**/*.tsx', { query: '?raw', eager: true, import: 'default' }),
    } as Record<string, string>;

    const offenders = Object.entries(modules)
      .filter(([file]) => !file.includes('.test.'))
      .filter(([, source]) => NO_INFO.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});

describe('chart sizing', () => {
  it('barListHeight grows with the rows and never drops under the floor', () => {
    expect(barListHeight(3)).toBe(200);
    expect(barListHeight(12)).toBe(12 * 28);
    expect(barListHeight(10, 32, 240)).toBe(320);
    expect(barListHeight(0, 32, 240)).toBe(240);
  });

  it('DONUT is one ring for every donut', () => expect(DONUT).toEqual({ innerRadius: '58%', outerRadius: '80%' }));
});

describe('tooltips', () => {
  it('TOOLTIP_STYLE carries its own background and ink, so it reads in dark mode', () => {
    expect(TOOLTIP_STYLE.background).toBe('var(--bg-elevated)');
    expect(TOOLTIP_STYLE.color).toBe('var(--text-primary)');
  });

  // A `contentStyle` literal without a background falls back to Recharts'
  // white box, which leaves light ink on white in dark mode. Spreading
  // TOOLTIP_STYLE is the fix; a literal that sets its own background passes too.
  it('no dashboard or health chart passes a contentStyle without a background', () => {
    const modules = {
      ...import.meta.glob('../**/*.tsx', { query: '?raw', eager: true, import: 'default' }),
      ...import.meta.glob('../../health/**/*.tsx', { query: '?raw', eager: true, import: 'default' }),
    } as Record<string, string>;

    // The literal's body, braces balanced, so a nested object or a template
    // expression inside it does not end the match early.
    const bodies = (source: string) => {
      const out: string[] = [];
      for (let at = source.indexOf('contentStyle={'); at >= 0; at = source.indexOf('contentStyle={', at + 1)) {
        const open = source.indexOf('{', at + 'contentStyle='.length);
        let depth = 0;
        let end = open;
        for (; end < source.length; end++) {
          if (source[end] === '{') depth++;
          else if (source[end] === '}' && --depth === 0) break;
        }
        out.push(source.slice(open + 1, end));
      }
      return out;
    };
    // An inline literal must spread TOOLTIP_STYLE or set its own background;
    // a bare reference (`contentStyle={TOOLTIP_STYLE}`) passes as the name.
    const ok = (body: string) => /TOOLTIP_STYLE|\bbackground(Color)?\s*:/.test(body);

    expect(bodies('<Tooltip contentStyle={{ fontSize: 12, padding: { x: 1 } }} />')).toEqual([
      '{ fontSize: 12, padding: { x: 1 } }',
    ]);
    expect(ok('{ padding: { x: 1 }, background: "var(--bg-elevated)" }')).toBe(true);
    expect(ok('{ padding: { x: 1 }, fontSize: 12 }')).toBe(false);

    const offenders: string[] = [];
    for (const [file, source] of Object.entries(modules)) {
      if (file.includes('.test.')) continue;
      for (const body of bodies(source)) if (!ok(body)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
