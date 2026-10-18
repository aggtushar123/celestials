// Where a line meets its two cards (spec §2.2): on the side of each card that
// faces the other ("floating" ends), so a line never wraps round a card. Lines
// between the same two people (a two-way pair) bow apart, labels and all.
// Pure geometry: the board's edge only feeds it the cards' boxes.

/** A card on the board: its top-left corner and size, in flow coordinates. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Ends {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePosition: Side;
  targetPosition: Side;
}

/** How far apart two lines between the same pair run. */
export const BOW = 24;
/** How far apart, top to bottom, their labels sit: more than a label is tall (44px). */
export const LABEL_GAP = 48;

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** The side of `from` facing `to`. The gap is weighed against the cards'
 *  shape, so wide cards side by side meet on their sides. */
export function facingSide(from: Box, to: Box): Side {
  const a = centre(from);
  const b = centre(to);
  const dx = (b.x - a.x) / ((from.width + to.width) / 2);
  const dy = (b.y - a.y) / ((from.height + to.height) / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function anchor(b: Box, side: Side) {
  const c = centre(b);
  if (side === 'top') return { x: c.x, y: b.y };
  if (side === 'bottom') return { x: c.x, y: b.y + b.height };
  if (side === 'left') return { x: b.x, y: c.y };
  return { x: b.x + b.width, y: c.y };
}

/** The unit normal to the left of travel (screen y grows down). */
function normal(source: Box, target: Box) {
  const a = anchor(source, facingSide(source, target));
  const b = anchor(target, facingSide(target, source));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
}

/** How far both ends move for a sideways `offset`: along the side they sit
 *  on (x on a top or bottom side, y on a left or right one), so they stay on
 *  the card's edge, signed by the line's normal. Scaled so the bowed line
 *  sits `offset` from the straight one measured square to it, but never
 *  past 80% of the way from the side's middle to its corner. */
function endShift(source: Box, target: Box, offset: number): { x: number; y: number } {
  if (offset === 0) return { x: 0, y: 0 };
  const n = normal(source, target);
  const flat = ['top', 'bottom'].includes(facingSide(source, target));
  const across = flat ? n.x : n.y;
  const room = 0.8 * Math.min(...(flat ? [source.width, target.width] : [source.height, target.height])) / 2;
  const size = Math.min(Math.abs(offset) / Math.max(Math.abs(across), 0.1), room);
  const along = (Math.sign(across) || 1) * Math.sign(offset) * size;
  return flat ? { x: along, y: 0 } : { x: 0, y: along };
}

/** Both ends on the facing sides, bowed `offset` to the left of travel. */
export function floatingEnds(source: Box, target: Box, offset: number): Ends {
  const sourcePosition = facingSide(source, target);
  const targetPosition = facingSide(target, source);
  const s = anchor(source, sourcePosition);
  const t = anchor(target, targetPosition);
  const shift = endShift(source, target, offset);
  return {
    sx: s.x + shift.x,
    sy: s.y + shift.y,
    tx: t.x + shift.x,
    ty: t.y + shift.y,
    sourcePosition,
    targetPosition,
  };
}

type Line = { id: string; source: string; target: string };

/** A line's sideways offset (in its own direction's frame). Zero for a line
 *  alone between its people. Lines sharing a pair are spread BOW apart, in a
 *  frame fixed by the pair (lower id to higher), lines that way first, then by
 *  id: the answer depends on the direction, never on the list's order. */
export function bowOffset(edge: Line, edges: Line[]): number {
  const lo = edge.source < edge.target ? edge.source : edge.target;
  const hi = edge.source < edge.target ? edge.target : edge.source;
  const pair = edges.filter((e) => (e.source === lo && e.target === hi) || (e.source === hi && e.target === lo));
  if (pair.length < 2) return 0;
  const rank = (e: Line) => (e.source === lo ? 0 : 1);
  pair.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const slot = pair.findIndex((e) => e.id === edge.id);
  const shared = (slot - (pair.length - 1) / 2) * BOW;
  return edge.source === lo ? shared : -shared;
}

/** What to add to a bowed line's middle to place its label: spread top to
 *  bottom by LABEL_GAP per BOW of offset, so labels of a pair never overlap
 *  however the line runs (on a near-vertical pair the lines are only BOW
 *  apart, closer than a label is wide). */
export function labelShift(source: Box, target: Box, offset: number): { dx: number; dy: number } {
  if (offset === 0) return { dx: 0, dy: 0 };
  const { x: vx, y: vy } = endShift(source, target, offset);
  const sign = Math.sign(Math.abs(vy) > 1e-9 ? vy : vx);
  return { dx: 0, dy: sign * Math.abs(offset) * (LABEL_GAP / BOW) - vy };
}
