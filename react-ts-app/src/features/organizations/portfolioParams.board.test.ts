import { describe, expect, it } from 'vitest';
import {
  BOARD_GROUP,
  DEFAULT_GROUP,
  boardParams,
  includesChurned,
  parseParams,
  toUrlSearch,
} from './portfolioParams';

// Owner decision 2026-09-26: the Board shares the List's URL state, but an
// absent `group` means lifecycle there (health on the List).

describe('per-route default group', () => {
  it('reads an absent or unknown group as the route default and leaves the default out of the URL', () => {
    expect(BOARD_GROUP).toBe('lifecycle');
    expect(parseParams(new URLSearchParams('')).group).toBe(DEFAULT_GROUP);
    expect(parseParams(new URLSearchParams(''), BOARD_GROUP).group).toBe('lifecycle');
    expect(parseParams(new URLSearchParams('group=bogus'), BOARD_GROUP).group).toBe('lifecycle');
    expect(parseParams(new URLSearchParams('group=health'), BOARD_GROUP).group).toBe('health');

    const onBoard = parseParams(new URLSearchParams(''), BOARD_GROUP);
    expect(toUrlSearch(onBoard, BOARD_GROUP).toString()).toBe('');
    expect(toUrlSearch({ ...onBoard, group: 'health' }, BOARD_GROUP).toString()).toBe('group=health');
    // Each route writes the other's default out, so a pick survives the switch.
    expect(toUrlSearch({ ...onBoard, group: 'lifecycle' }).toString()).toBe('group=lifecycle');
  });

  it("keeps the route's default in the URL when the URL already named it (an explicit pick)", () => {
    const onBoard = parseParams(new URLSearchParams('group=lifecycle'), BOARD_GROUP);
    expect(toUrlSearch(onBoard, BOARD_GROUP, new URLSearchParams('group=lifecycle')).get('group')).toBe('lifecycle');
    // Changed to the default from something else: omitted as before.
    expect(toUrlSearch(onBoard, BOARD_GROUP, new URLSearchParams('group=health')).has('group')).toBe(false);
  });
});

describe('boardParams', () => {
  it('shows lifecycle columns for group=none but keeps none in the URL for the List', () => {
    const p = parseParams(new URLSearchParams('group=none&owner=2'), BOARD_GROUP);
    expect(p.group).toBe('');
    expect(boardParams(p)).toMatchObject({ group: 'lifecycle', owner: '2' });
    expect(toUrlSearch(p, BOARD_GROUP).get('group')).toBe('none');
  });

  it('returns grouped params untouched', () => {
    const grouped = parseParams(new URLSearchParams('group=owner'), BOARD_GROUP);
    expect(boardParams(grouped)).toBe(grouped);
  });
});

describe('includesChurned', () => {
  it('is the backend rule: include_churned, a churn lifecycle, or named ids', () => {
    const p = parseParams(new URLSearchParams(''));
    expect(includesChurned(p)).toBe(false);
    expect(includesChurned({ ...p, include_churned: true })).toBe(true);
    expect(includesChurned({ ...p, lifecycle: ['live', 'churn'] })).toBe(true);
    expect(includesChurned({ ...p, lifecycle: ['live'] })).toBe(false);
    expect(includesChurned({ ...p, ids: [7] })).toBe(true);
  });
});
