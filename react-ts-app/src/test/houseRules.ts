import { describe, expect, it } from 'vitest';

// Spec §1 "House rules" and .claude/skills/revenact-design/SKILL.md §4, as one
// suite each folder points at its own sources (import.meta.glob must be
// written in the test file itself).

// The whole Tailwind colour palette, plus every prefix that can carry a
// colour utility. `-white`/`-black` are checked separately since they take
// no numeric shade.
const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone';
const PREFIXES = 'bg|text|border|fill|stroke|ring|outline|from|via|to|divide|decoration|shadow|accent';
export const RAW = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|rgba?\\(|\\b(?:${PREFIXES})-(?:${PALETTE})-\\d+\\b|\\b(?:${PREFIXES})-(?:white|black)\\b`,
);

// Only 11/13/15/22 px arbitrary sizes are allowed; every other unit
// (rem/em/%) and every named Tailwind size is a violation.
const PX_SIZE = /text-\[(\d+(?:\.\d+)?)px\]/g;
const NON_PX_SIZE = /text-\[[\d.]+(?:rem|em|%)\]/g;
const NAMED_SIZE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/;

// Icons are lucide-react only, never emoji. `\p{Extended_Pictographic}`
// covers real emoji (🚀, ✨, ...) but leaves the house glyphs alone: ✦ (the
// Ask mark), ·, —, › and ‹ all test false against it, so no allow-list is
// needed today; if a future glyph does trip it, add it here rather than
// weakening the rule.
export const EMOJI = /\p{Extended_Pictographic}/u;

// `h-screen` (and any variant of it, e.g. `md:h-screen`) ignores mobile
// browser chrome; `min-h-[100dvh]` is the house rule. The lookbehind rejects
// a `-` or word character right before the `h` so `min-h-screen` (a
// different utility) is not a false positive.
export const H_SCREEN = /(?<![\w-])h-screen\b/;

export function sizeOffenders(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(PX_SIZE)) {
    if (!['11', '13', '15', '22'].includes(match[1])) offenders.push(match[0]);
  }
  for (const match of source.matchAll(NON_PX_SIZE)) offenders.push(match[0]);
  if (NAMED_SIZE.test(source)) offenders.push('named text size');
  return offenders;
}

/** Only the colour-token and type-size rules, for older shared files whose
 *  other habits (e.g. an avatar image) belong to pages this suite does not
 *  cover. */
export function sizeAndTokenSuite(title: string, files: Record<string, string>): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

  describe(title, () => {
    it('has sources to check', () => expect(sources.length).toBeGreaterThan(0));

    it('uses tokens only: no hex, rgb() or named palette colours', () => {
      expect(sources.filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('uses only the 11/13/15/22 px type sizes', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        for (const bad of sizeOffenders(source)) offenders.push(`${file}: ${bad}`);
      }
      expect(offenders).toEqual([]);
    });
  });
}

/** The house rules over `files` (path → raw source); tests are skipped. */
export function houseRuleSuite(title: string, files: Record<string, string>): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

  describe(title, () => {
    it('has sources to check', () => expect(sources.length).toBeGreaterThan(0));

    it('uses tokens only: no hex, rgb() or named palette colours', () => {
      expect(sources.filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('uses only the 11/13/15/22 px type sizes', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        for (const bad of sizeOffenders(source)) offenders.push(`${file}: ${bad}`);
      }
      expect(offenders).toEqual([]);
    });

    it('keeps glass off (the Ask rail is the only glass surface)', () => {
      expect(sources.filter(([, s]) => /rv-card-glass|rv-glass-inner|backdrop-blur/.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('dims behind sheets with the scrim token, which darkens in both themes', () => {
      expect(sources.filter(([, s]) => /\bbg-ink\/\d+/.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('loads no third-party image (no Clearbit logo, no pravatar avatar)', () => {
      expect(sources.filter(([, s]) => /clearbit|pravatar/i.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('uses no emoji as icons', () => {
      expect(sources.filter(([, s]) => EMOJI.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('never fills the viewport with h-screen (use min-h-[100dvh])', () => {
      expect(sources.filter(([, s]) => H_SCREEN.test(s)).map(([f]) => f)).toEqual([]);
    });
  });
}

// Style constants already proven 44px-compliant by the folders that define
// them (components/ui/styles.ts, components/organizations/portfolio/styles.ts,
// filterParts.tsx, components/plans/styles.ts), and already covered by their
// own tests. A file reaching for one of these needs no touch-target class of
// its own.
// INLINE_TARGET (ui/styles.ts) is an inline link's layout-neutral 44px hit
// area: a centred `before:h-11` pseudo-element below sm.
const KNOWN_COMPLIANT = ['BUTTON', 'PRIMARY', 'QUIET', 'DANGER', 'ICON_BUTTON', 'COLUMN_ICON_BUTTON', 'FILTER_SELECT', 'INPUT', 'LINK', 'INLINE_TARGET'];
const TARGET = /\bmin-h-11\b|\bmin-w-11\b|\bh-11\b[^`'"]*\bw-11\b|\bw-11\b[^`'"]*\bh-11\b/;
const CONST = /\bconst ([A-Z][A-Z0-9_]*)\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
const CONTROL_START = /<(button|select|textarea|input|Link)\b/g;

/** Every control tag's name and attribute text, scanning braces (not just
 *  the next `>`) so an `onClick={() => …}` arrow's own `>` does not end the
 *  tag early. */
function controlTags(source: string): { tag: string; attrs: string }[] {
  const tags: { tag: string; attrs: string }[] = [];
  for (const match of source.matchAll(CONTROL_START)) {
    const tag = match[1];
    const attrsStart = match.index + match[0].length;
    let depth = 0;
    let i = attrsStart;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
      i++;
    }
    tags.push({ tag, attrs: source.slice(attrsStart, i) });
  }
  return tags;
}

/** The expression inside a tag's `className={...}`, balancing the braces a
 *  template literal's `${…}` opens (a plain regex stops at the first `}`).
 *  `null` when the tag has no className at all. */
function classExpression(attrs: string): string | null {
  const plain = /className="([^"]*)"/.exec(attrs);
  if (plain) return plain[1];
  const start = attrs.indexOf('className={');
  if (start === -1) return null;
  let depth = 1;
  let i = start + 'className={'.length;
  let out = '';
  while (i < attrs.length && depth > 0) {
    const ch = attrs[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Every ALL_CAPS identifier referenced in an expression (a style constant
 *  or a `${…}` interpolation), ignoring the Tailwind classes around it. */
function identifiersIn(expression: string): string[] {
  return [...expression.matchAll(/\b[A-Z][A-Z0-9_]*\b/g)].map((match) => match[0]);
}

/** A file's own style constants that resolve to a 44px target, directly or
 *  by referencing an already-compliant one (fixed point: `SELECT` references
 *  `FILTER_SELECT`, so it is compliant without repeating the class). */
function localCompliance(source: string): Set<string> {
  const consts = [...source.matchAll(CONST)].map(([, name, value]) => [name, value] as const);
  const compliant = new Set(KNOWN_COMPLIANT);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, value] of consts) {
      if (compliant.has(name)) continue;
      if (TARGET.test(value) || identifiersIn(value).some((id) => compliant.has(id))) {
        compliant.add(name);
        grew = true;
      }
    }
  }
  return compliant;
}

/** Every button, link, select and text control in `source` that reaches no
 *  44px touch target on phones, directly or through a compliant constant. A
 *  checkbox or radio's target is its wrapping label, not the box itself. */
export function controlsMissingTarget(source: string): string[] {
  const compliant = localCompliance(source);
  const offenders: string[] = [];
  for (const { tag, attrs } of controlTags(source)) {
    if (tag === 'input' && /\btype=["'](checkbox|radio|hidden)["']/.test(attrs)) continue;
    const expression = classExpression(attrs);
    const compliesDirectly = expression !== null && (TARGET.test(expression) || identifiersIn(expression).some((id) => compliant.has(id)));
    if (!compliesDirectly) offenders.push(`<${tag} ${attrs.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
  }
  return offenders;
}

/** Rows not tables, Lucide icons hidden from screen readers, and a 44px
 *  target on every button, link, select and text control (Ruling G18).
 *  First written for Segments; Surveys runs it too. */
export function rowsIconsTargetsSuite(title: string, files: Record<string, string>, allowTables: string[] = []): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

  describe(title, () => {
    it('lays every list out as rows, never a table or grid', () => {
      // `allowTables` is a narrow, named exception for a genuine two-way matrix (Actions & approvals: kinds by agents), never a list.
      expect(sources.filter(([file, source]) => !allowTables.includes(file) && /<table|role="(table|grid)"/.test(source)).map(([file]) => file)).toEqual([]);
    });

    it('hides every Lucide icon from screen readers', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        const icons = [...source.matchAll(/import \{([^}]+)\} from 'lucide-react'/g)].flatMap((m) => m[1].split(',').map((name) => name.trim()).filter(Boolean));
        for (const icon of icons) {
          for (const use of source.matchAll(new RegExp(`<${icon}\\b[^>]*>`, 'g'))) {
            if (!use[0].includes('aria-hidden')) offenders.push(`${file}: ${use[0]}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('gives every button, link, select and text control a 44px touch target on phones', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        for (const bad of controlsMissingTarget(source)) offenders.push(`${file}: ${bad}`);
      }
      expect(offenders).toEqual([]);
    });
  });
}

// ---------------------------------------------------------------------------
// UI foundations (spec 2026-10-09 §9.4): the rules the primitives make
// possible. `uiRuleSuite` applies them to a folder that has moved onto the
// primitives; `uiOffences` counts them for the whole-app ratchet
// (src/test/uiRatchet.test.ts) until a count reaches zero.

/** Every quoted class string in a source: "…", '…' and `…`. */
const CLASS_STRING = /`[^`]*`|"[^"\n]*"|'[^'\n]*'/g;
/** A control's height marks a string as a button or input, not a card. */
const CONTROL_HEIGHT = /(?<![\w-])(?:min-h-(?:6|8|9|10|11|12)|h-(?:6|7|8|9|10|11|12))(?![\w-])/;
/** Input markers, and the hair-thin padding of a segmented toggle's track
 *  (a card pads p-3 or more). */
const CONTROL_MARK = /(?<![\w-])(?:focus(?:-visible|-within)?:[\w-]+|placeholder:[\w-]+|p-(?:0\.5|1))(?![\w-])/;
/** Overlays (popovers, menus, modals) float and cast shadow-lg: not cards. */
const OVERLAY_MARK = /(?<![\w-])(?:absolute|fixed|shadow-(?:lg|xl))(?![\w-])/;
const SURFACE = /(?<![\w-])bg-surface(?![\w-])/;
const CARD_RADIUS = /(?<![\w-])rounded-(?:lg|xl|2xl)(?![\w-])/;
const EDGE = /(?<![\w-])(?:border|shadow(?:-sm|-md|-lg)?)(?![\w-])/;
const RV_CARD = /(?<![\w-])rv-card(?![\w-])/g;

export const CARD_SHADOW = /(?<![\w-])shadow-(?:sm|md)(?![\w-])/g;
export const OPACITY_DISABLED = /disabled:opacity-/g;
export const MONO_FONT = /(?<![\w-])font-mono-brand(?![\w-])/g;
export const BOLD = /(?<![\w-])font-bold(?![\w-])/g;
export const HEAVY_WEIGHT = /(?<![\w-])font-(?:bold|medium|black)(?![\w-])/g;
export const UPPERCASE = /(?<![\w-])uppercase(?![\w-])/g;
const NAMED_SIZE_ALL = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/g;

/** Card markup written by hand: a class string holding `bg-surface`, a
 *  `rounded-lg|xl|2xl` and a `border` or shadow (and no control height), or
 *  the legacy `rv-card` class (`rv-card-glass` is the Ask rail's, allowed). */
export function cardOffenders(source: string): string[] {
  const offenders: string[] = [];
  for (const [value] of source.matchAll(CLASS_STRING)) {
    if (SURFACE.test(value) && CARD_RADIUS.test(value) && EDGE.test(value) && !CONTROL_HEIGHT.test(value) && !CONTROL_MARK.test(value) && !OVERLAY_MARK.test(value)) offenders.push(value.slice(0, 90));
  }
  offenders.push(...Array.from(source.matchAll(RV_CARD), () => 'rv-card'));
  return offenders;
}

/** Every off-scale type size, counted one by one (sizeOffenders reports a
 *  named size once per file). */
export function sizeOffenceCount(source: string): number {
  let count = 0;
  for (const match of source.matchAll(PX_SIZE)) if (!['11', '13', '15', '22'].includes(match[1])) count++;
  count += [...source.matchAll(NON_PX_SIZE)].length;
  count += [...source.matchAll(NAMED_SIZE_ALL)].length;
  return count;
}

/** A `<button>` styled with ICON_BUTTON and no aria-label: an icon alone
 *  names nothing (spec §5.1). */
export function iconButtonsWithoutLabel(source: string): string[] {
  return controlTags(source)
    .filter(({ tag, attrs }) => tag === 'button' && /\bICON_BUTTON\b/.test(classExpression(attrs) ?? '') && !/\baria-label(?:ledby)?=/.test(attrs))
    .map(({ attrs }) => `<button ${attrs.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
}

export const UI_OFFENCES = ['sizes', 'cards', 'shadows', 'opacityDisabled', 'mono', 'bold'] as const;
export type UiOffence = (typeof UI_OFFENCES)[number];

const countOf = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

/** What the ratchet counts in one source. */
export function uiOffences(source: string): Record<UiOffence, number> {
  return {
    sizes: sizeOffenceCount(source),
    cards: cardOffenders(source).length,
    shadows: countOf(source, CARD_SHADOW),
    opacityDisabled: countOf(source, OPACITY_DISABLED),
    mono: countOf(source, MONO_FONT),
    bold: countOf(source, BOLD),
  };
}

export type UiRule = 'cards' | 'shadows' | 'opacityDisabled' | 'mono' | 'weights' | 'uppercase' | 'iconLabels';

/** The foundations rules over a migrated folder (spec §9.4). `exempt` names
 *  files a rule skips: the ui folder owns card markup, `ui/styles.ts` owns
 *  `CODE`, `ui/type.ts` owns the eyebrow's uppercase. Tests are skipped. */
export function uiRuleSuite(title: string, files: Record<string, string>, exempt: Partial<Record<UiRule, string[]>> = {}): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
  const offenders = (rule: UiRule, find: (source: string) => string[]) => {
    const found: string[] = [];
    for (const [file, source] of sources) {
      if (exempt[rule]?.includes(file)) continue;
      for (const bad of find(source)) found.push(`${file}: ${bad}`);
    }
    return found;
  };
  const matches = (pattern: RegExp) => (source: string) => source.match(pattern) ?? [];

  describe(title, () => {
    it('has sources to check', () => expect(sources.length).toBeGreaterThan(0));

    it('writes no card markup by hand (Card, ListCard and Tile own it)', () => {
      expect(offenders('cards', cardOffenders)).toEqual([]);
    });

    it('puts no shadow on a card (shadow-lg is for overlays)', () => {
      expect(offenders('shadows', matches(CARD_SHADOW))).toEqual([]);
    });

    it('never dims a disabled control with opacity', () => {
      expect(offenders('opacityDisabled', matches(OPACITY_DISABLED))).toEqual([]);
    });

    it('sets figures in the body font: DM Mono only through CODE', () => {
      expect(offenders('mono', matches(MONO_FONT))).toEqual([]);
    });

    it('uses only the regular and semibold weights', () => {
      expect(offenders('weights', matches(HEAVY_WEIGHT))).toEqual([]);
    });

    it('keeps uppercase to the eyebrow', () => {
      expect(offenders('uppercase', matches(UPPERCASE))).toEqual([]);
    });

    it('names every icon button', () => {
      expect(offenders('iconLabels', iconButtonsWithoutLabel)).toEqual([]);
    });
  });
}
