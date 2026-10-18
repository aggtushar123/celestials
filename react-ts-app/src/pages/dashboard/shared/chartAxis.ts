// Axis furniture every dashboard chart shares: titles, tick style, margins
// and tick formatters. A plain `.ts` file (the truncating tick uses
// `createElement`) so it can sit beside `chartPalette.ts` as data, not UI.
//
// Axis-title recipe. A title goes *outside* its axis's tick band, in margin
// the chart reserves for it, so it can never sit on the tick numbers:
//
//   <BarChart margin={chartMargin({ left: true, x: true })}>
//     <XAxis {...AXIS_BASE} dataKey="month" label={axisLabel('Month', 'x')} />
//     <YAxis {...AXIS_BASE} width={38} label={axisLabel('Accounts')} />
//
// `axisLabel` uses Recharts' outside positions (`left` / `right` / `bottom`),
// which place the label relative to the axis's own box, beyond its outer
// edge (the y titles' centre 10px out, the x title's top 4px down). `chartMargin` widens the same side by
// `TITLE_ROOM`, which holds that offset plus one 11px line. The `inside*`
// positions are anchored inside the tick band and overlap the ticks on a
// narrow axis, so they are not used. Keep the axis `width` to what the ticks
// need; the title does not share it.

import { createElement } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';

export type AxisSide = 'x' | 'left' | 'right';

/** Distance from an axis's outer edge to its title: to the centre of a
 *  rotated y title, to the top of the x title. */
const TITLE_OFFSET = { x: 4, y: 10 } as const;

/** An axis title, for `<XAxis label={axisLabel('Month', 'x')}>` or
 *  `<YAxis label={axisLabel('Accounts')}>`. Always pair it with
 *  `chartMargin` for the same side, which reserves the room it lands in
 *  (see the recipe at the top of this file). */
export function axisLabel(value: string, side: AxisSide = 'left') {
  return {
    value,
    position: side === 'x' ? 'bottom' : side,
    angle: side === 'x' ? 0 : side === 'left' ? -90 : 90,
    offset: side === 'x' ? TITLE_OFFSET.x : TITLE_OFFSET.y,
    fill: 'var(--text-secondary)',
    fontSize: 11,
    textAnchor: 'middle',
  } as const;
}

/** Tick text: 10px is the floor, never 9. */
export const AXIS_TICK = { fill: 'var(--text-tertiary)', fontSize: 10 } as const;

/** Spread onto any axis: `<XAxis {...AXIS_BASE} dataKey="month" />`. */
export const AXIS_BASE = { axisLine: false, tickLine: false, tick: AXIS_TICK } as const;

/** No negative sides: a negative left margin is how tick labels got clipped. */
export const CHART_MARGIN = { top: 16, right: 16, bottom: 8, left: 8 } as const;

/** Room an axis title takes beside its axis: its offset plus one 11px line
 *  (a y title is rotated, so its line height is its width). */
const TITLE_ROOM = 20;

/** `CHART_MARGIN`, widened on each side that carries an `axisLabel`. */
export function chartMargin(titles: { x?: boolean; left?: boolean; right?: boolean } = {}) {
  return {
    top: CHART_MARGIN.top,
    right: CHART_MARGIN.right + (titles.right ? TITLE_ROOM : 0),
    bottom: CHART_MARGIN.bottom + (titles.x ? TITLE_ROOM : 0),
    left: CHART_MARGIN.left + (titles.left ? TITLE_ROOM : 0),
  };
}

/** Money ticks in the app's one compact format ("$1.8M"). */
export const moneyTick = (currency: CurrencyCode) => (value: number) => formatCompactMoney(value, currency);

/** Zero in `currency` with no decimals ("$0"): compact notation prints it
 *  as "$0.0", which reads like a rounded non-zero. */
export const zeroMoney = (currency: CurrencyCode) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(0);

export const pctTick = (value: number) => `${value}%`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-01" → "1 Sep", "2026-09" → "Sep '26". Read from the string, not a
 *  `Date`, so a UTC midnight never shifts a day in the viewer's timezone.
 *  The backend's pre-formatted labels read the same way: "Aug 2026" →
 *  "Aug '26", "Jun 15, 2025" → "15 Jun". Anything else is returned unchanged. */
export function dateTick(iso: string): string {
  const label = /^([A-Z][a-z]{2}) (?:(\d{1,2}), )?(\d{4})$/.exec(iso);
  if (label && MONTHS.includes(label[1])) {
    return label[2] ? `${Number(label[2])} ${label[1]}` : `${label[1]} '${label[3].slice(2)}`;
  }
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return iso;
  return match[3] ? `${Number(match[3])} ${month}` : `${month} '${match[1].slice(2)}`;
}

/** Cuts `text` to `max` characters, the last being an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  textAnchor?: string;
}

/** A category tick that shortens long names and keeps the full one in a
 *  `<title>` (the hover tooltip): `<YAxis type="category" tick={truncTick(18)} />`.
 *  Pass an `angle` (e.g. -35) to slant crowded x-axis names:
 *  `<XAxis tick={truncTick(14, -35)} interval={0} height={64} />`; a slanted
 *  name rotates about its tick and ends there, hanging below the axis. */
export function truncTick(max = 14, angle = 0) {
  return function TruncatedTick({ x = 0, y = 0, payload, textAnchor = 'end' }: TickProps) {
    const full = String(payload?.value ?? '');
    const short = truncate(full, max);
    const slanted = angle !== 0;
    return createElement(
      'text',
      {
        x,
        y,
        dy: slanted ? '0.71em' : '0.355em',
        textAnchor: slanted ? 'end' : textAnchor,
        transform: slanted ? `rotate(${angle}, ${x}, ${y})` : undefined,
        fill: AXIS_TICK.fill,
        fontSize: AXIS_TICK.fontSize,
      },
      short !== full ? createElement('title', null, full) : null,
      short,
    );
  };
}

/** A category tick for a horizontal bar list (`layout="vertical"`) that
 *  wraps a long name onto a second line instead of cutting it, and only
 *  shortens past two lines, keeping the whole name in a `<title>`:
 *  `<YAxis type="category" tick={wrapTick(20)} width={20 * 6 + 10} />`.
 *  Two 10px lines fit a 28px row. */
export function wrapTick(perLine = 20) {
  return function WrappedTick({ x = 0, y = 0, payload }: TickProps) {
    const full = String(payload?.value ?? '');
    const { lines, cut } = wrapLabel(full, perLine, 2);
    return createElement(
      'text',
      { x, y, textAnchor: 'end', fill: AXIS_TICK.fill, fontSize: AXIS_TICK.fontSize },
      cut ? createElement('title', null, full) : null,
      ...lines.map((line, i) =>
        // The first line lifts by half a line per extra line, so the block
        // stays centred on its bar.
        createElement('tspan', { key: i, x, dy: i === 0 ? `${(0.355 - (lines.length - 1) * 0.6).toFixed(3)}em` : '1.2em' }, line),
      ),
    );
  };
}

/** Average width of a 10px tick character, rounded up so estimates err
 *  towards wrapping rather than overlapping the next band. */
const TICK_CHAR_PX = 6;
/** Height of one tick line at 10px. */
const TICK_LINE_PX = 12;
/** Below this many characters per line a flat name reads worse than a
 *  slanted one, so the tick slants instead. */
const MIN_FLAT_CHARS = 7;
const SLANT = -35;

/** Word-wraps `text` into at most `maxLines` lines of `perLine` characters.
 *  A newline in `text` always starts a new line ("Low\n25–50%"). A word
 *  longer than a line is cut; text left over after the last line ends that
 *  line with an ellipsis, and `cut` says so. */
export function wrapLabel(text: string, perLine: number, maxLines: number): { lines: string[]; cut: boolean } {
  const words = text.replace(/\n/g, ' \n ').split(/[ \t]+/).filter(Boolean);
  const lines: string[] = [];
  let next = 0;
  while (next < words.length && lines.length < maxLines) {
    if (words[next] === '\n') {
      next++;
      continue;
    }
    let line = words[next++];
    while (next < words.length && words[next] !== '\n' && `${line} ${words[next]}`.length <= perLine) {
      line += ` ${words[next++]}`;
    }
    lines.push(line);
  }
  const leftOver = words.slice(next).some((word) => word !== '\n');
  let cut = false;
  const shown = lines.map((line, i) => {
    if (line.length <= perLine && !(leftOver && i === lines.length - 1)) return line;
    cut = true;
    return `${line.slice(0, Math.max(1, perLine - 1))}…`;
  });
  return { lines: shown, cut };
}

interface CategoryTickProps extends TickProps {
  /** The axis's width and height, which Recharts hands every custom tick. */
  width?: number | string;
  height?: number | string;
  visibleTicksCount?: number;
}

/**
 * A category x-axis that reads at a glance: full names, flat and centred,
 * wrapping onto more lines when a name is long, and slanted and shortened
 * only when each category's band is too narrow for flat text. The band is
 * measured per render (axis width ÷ category count), so the same chart is
 * flat on a wide screen and slanted on a narrow one.
 *
 *   <XAxis {...AXIS_BASE} dataKey="name" {...categoryAxis(data.length)} />
 *
 * `height` reserves two lines for up to six categories and three beyond,
 * which also holds a slanted, shortened name. A shortened name keeps the
 * full one in a `<title>`.
 */
export function categoryAxis(count: number) {
  const maxLines = count <= 6 ? 2 : 3;
  const height = TICK_LINE_PX * maxLines + 14;

  function CategoryTick({ x = 0, y = 0, payload, width = 0, visibleTicksCount }: CategoryTickProps) {
    const given = String(payload?.value ?? '');
    // A two-part name ("Low\n25–50%") reads as one line when slanted or
    // hovered.
    const full = given.replace(/\n/g, ' ');
    const widestLine = Math.max(...given.split('\n').map((line) => line.length));
    const band = Number(width) / Math.max(1, visibleTicksCount ?? count);
    const perLine = Math.floor((band - 6) / TICK_CHAR_PX);
    const style = { fill: AXIS_TICK.fill, fontSize: AXIS_TICK.fontSize };

    // A name that fits its band as it is stays flat, however narrow the band.
    if (perLine < MIN_FLAT_CHARS && widestLine > Math.max(0, perLine)) {
      // How many characters a slanted name can run before leaving the axis.
      const room = Math.floor((height - 8) / Math.sin((-SLANT * Math.PI) / 180) / TICK_CHAR_PX);
      const short = truncate(full, Math.max(4, room));
      return createElement(
        'text',
        { x, y, dy: '0.71em', textAnchor: 'end', transform: `rotate(${SLANT}, ${x}, ${y})`, ...style },
        short !== full ? createElement('title', null, full) : null,
        short,
      );
    }

    const { lines, cut } = wrapLabel(given, perLine, maxLines);
    return createElement(
      'text',
      { x, y, textAnchor: 'middle', ...style },
      cut ? createElement('title', null, full) : null,
      ...lines.map((line, i) =>
        createElement('tspan', { key: i, x, dy: i === 0 ? '0.71em' : '1.2em' }, line),
      ),
    );
  }

  return { tick: CategoryTick, height, interval: 0 as const };
}
