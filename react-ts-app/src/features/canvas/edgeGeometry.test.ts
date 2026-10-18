import { describe, expect, it } from 'vitest';
import { BOW, LABEL_GAP, bowOffset, facingSide, floatingEnds, labelShift, type Box } from './edgeGeometry';

const box = (x: number, y: number): Box => ({ x, y, width: 200, height: 100 });
const line = (id: string, source: string, target: string) => ({ id, source, target });

describe('facingSide', () => {
  it('picks the side that faces the other card', () => {
    expect(facingSide(box(0, 0), box(400, 0))).toBe('right');
    expect(facingSide(box(400, 0), box(0, 0))).toBe('left');
    expect(facingSide(box(0, 0), box(0, 300))).toBe('bottom');
    expect(facingSide(box(0, 300), box(0, 0))).toBe('top');
  });

  it('weighs the gap against the card shape, so a wide card beside another uses its side', () => {
    // Centres 300 apart across and 120 down: the cards sit side by side, overlapping in height.
    expect(facingSide(box(0, 0), box(300, 120))).toBe('right');
    // 60 across and 200 down: one sits under the other.
    expect(facingSide(box(0, 0), box(60, 200))).toBe('bottom');
  });
});

describe('floatingEnds', () => {
  it('starts and ends on the middles of the facing sides', () => {
    expect(floatingEnds(box(0, 0), box(400, 0), 0)).toEqual({ sx: 200, sy: 50, tx: 400, ty: 50, sourcePosition: 'right', targetPosition: 'left' });
    expect(floatingEnds(box(0, 0), box(0, 300), 0)).toEqual({ sx: 100, sy: 100, tx: 100, ty: 300, sourcePosition: 'bottom', targetPosition: 'top' });
  });

  it('shifts both ends sideways to the line by the offset', () => {
    // Left to right: the line's left-hand normal points up (screen y grows down).
    const ends = floatingEnds(box(0, 0), box(400, 0), 10);
    expect(ends).toMatchObject({ sx: 200, sy: 40, tx: 400, ty: 40 });
  });
});

describe('floatingEnds on a slant', () => {
  // Bottom of the first card to the top of the second, on a slant.
  const a = box(0, 0);
  const b = box(300, 260);

  it.each([12, -12])('keeps both shifted ends on their card edges (offset %d)', (offset) => {
    const ends = floatingEnds(a, b, offset);
    expect(ends.sourcePosition).toBe('bottom');
    expect(ends.targetPosition).toBe('top');
    expect(ends.sy).toBe(a.y + a.height);
    expect(ends.ty).toBe(b.y);
    expect(ends.sx).toBeGreaterThanOrEqual(a.x);
    expect(ends.sx).toBeLessThanOrEqual(a.x + a.width);
  });

  it('keeps side-by-side ends on the left and right edges too', () => {
    const ends = floatingEnds(box(0, 0), box(400, 60), 12);
    expect(ends.sx).toBe(200);
    expect(ends.tx).toBe(400);
  });

  it('bows a two-way pair at least BOW apart, measured square to the line', () => {
    const there = line('x', 'n1', 'n2');
    const back = line('y', 'n2', 'n1');
    const edges = [there, back];
    const one = floatingEnds(a, b, bowOffset(there, edges));
    const two = floatingEnds(b, a, bowOffset(back, edges));
    // Distance from the second line's start to the first line, along its normal.
    const dx = one.tx - one.sx;
    const dy = one.ty - one.sy;
    const apart = Math.abs((two.sx - one.sx) * dy - (two.sy - one.sy) * dx) / Math.hypot(dx, dy);
    expect(apart).toBeGreaterThanOrEqual(BOW - 0.001);
  });

  it('never yields NaN for two cards on the same spot', () => {
    const ends = floatingEnds(box(0, 0), box(0, 0), 12);
    expect(Object.values(ends).filter((v) => typeof v === 'number').every(Number.isFinite)).toBe(true);
  });
});

describe('bowOffset', () => {
  it('is zero for a line alone between its two people', () => {
    const edges = [line('a', 'n1', 'n2'), line('b', 'n2', 'n3')];
    expect(bowOffset(edges[0], edges)).toBe(0);
  });

  it('bows a two-way pair apart, to opposite sides on screen', () => {
    const there = line('a', 'n1', 'n2');
    const back = line('b', 'n2', 'n1');
    const edges = [there, back];
    const a = floatingEnds(box(0, 0), box(400, 0), bowOffset(there, edges));
    const b = floatingEnds(box(400, 0), box(0, 0), bowOffset(back, edges));
    expect(bowOffset(there, edges)).not.toBe(0);
    // Same pair, opposite sides of the straight line, a whole BOW apart.
    expect(Math.abs(a.sy - b.ty)).toBe(BOW);
    expect(Math.sign(a.sy - 50)).toBe(-Math.sign(b.ty - 50));
  });

  it('does not depend on the order the lines are listed in', () => {
    const there = line('a', 'n1', 'n2');
    const back = line('b', 'n2', 'n1');
    expect(bowOffset(there, [there, back])).toBe(bowOffset(there, [back, there]));
    expect(bowOffset(back, [there, back])).toBe(bowOffset(back, [back, there]));
  });

  it('spreads three lines between one pair so none share a path', () => {
    const edges = [line('a', 'n1', 'n2'), line('b', 'n2', 'n1'), line('c', 'n1', 'n2')];
    // In one frame (n1 to n2): flip the reverse line's sign.
    const shared = edges.map((e) => (e.source === 'n1' ? 1 : -1) * bowOffset(e, edges));
    expect(new Set(shared).size).toBe(3);
  });
});

describe('labelShift', () => {
  // Where a label lands: the middle of its (bowed) line, plus the shift.
  const labelOf = (from: Box, to: Box, offset: number) => {
    const e = floatingEnds(from, to, offset);
    const shift = labelShift(from, to, offset);
    return { x: (e.sx + e.tx) / 2 + shift.dx, y: (e.sy + e.ty) / 2 + shift.dy };
  };

  it('leaves a lone line\'s label on its line', () => {
    expect(labelShift(box(0, 0), box(400, 0), 0)).toEqual({ dx: 0, dy: 0 });
  });

  it.each([
    ['side by side', box(0, 0), box(400, 0)],
    ['one above the other', box(0, 0), box(0, 300)],
    ['on a slant', box(0, 0), box(300, 260)],
  ])('keeps a two-way pair\'s labels a whole label apart (%s)', (_, a, b) => {
    const there = line('x', 'n1', 'n2');
    const back = line('y', 'n2', 'n1');
    const edges = [there, back];
    const one = labelOf(a, b, bowOffset(there, edges));
    const two = labelOf(b, a, bowOffset(back, edges));
    expect(Math.abs(one.y - two.y)).toBeGreaterThanOrEqual(LABEL_GAP - 0.001);
    expect(LABEL_GAP).toBeGreaterThanOrEqual(44);
  });
});
