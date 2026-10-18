import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleared,
  columnQuery,
  DEFAULT_PARAMS,
  isFiltered,
  listQuery,
  parsePlanParams,
  readView,
  scopeOf,
  templateParam,
  toPlanSearch,
  writeView,
} from './planParams';

const parse = (query: string) => parsePlanParams(new URLSearchParams(query));

describe('/projects URL state (Decision 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reads the defaults, and ignores what it does not know', () => {
    expect(parse('')).toEqual(DEFAULT_PARAMS);
    expect(parse('scope=everyone&kind=party&owner=0&status=lost')).toEqual(DEFAULT_PARAMS);
    expect(parse('scope=tasks&kind=save&owner=4&status=all&q=%20pizza%20&cancelled=1')).toEqual({
      scope: 'tasks', kind: 'save', owner: 4, status: 'all', q: 'pizza', cancelled: true, drafts: false,
    });
  });

  it('writes only what differs from the defaults', () => {
    expect(toPlanSearch(DEFAULT_PARAMS)).toEqual({});
    expect(toPlanSearch({ ...DEFAULT_PARAMS, scope: 'mine', status: 'done', q: 'globex', cancelled: true })).toEqual({ scope: 'mine', status: 'done', q: 'globex', cancelled: '1' });
  });

  it('defaults the scope to All with reports, else Mine', () => {
    expect(scopeOf(DEFAULT_PARAMS, true)).toBe('all');
    expect(scopeOf(DEFAULT_PARAMS, false)).toBe('mine');
    expect(scopeOf({ ...DEFAULT_PARAMS, scope: 'tasks' }, false)).toBe('tasks');
  });

  it('asks the server for the list and for each column', () => {
    expect(listQuery(DEFAULT_PARAMS, 'all')).toBe('status=open');
    expect(listQuery({ ...DEFAULT_PARAMS, owner: 4 }, 'mine')).toBe('owner=me&status=open');
    expect(listQuery({ ...DEFAULT_PARAMS, owner: 4, kind: 'save', q: 'pizza', status: 'all' }, 'tasks')).toBe(
      'owner=4&mine=tasks&kind=save&q=pizza&status=open&status=draft&status=done&status=cancelled',
    );
    expect(columnQuery({ ...DEFAULT_PARAMS, status: 'done', kind: 'qbr' }, 'all', 'on_track')).toBe('kind=qbr&status=on_track');
  });

  it('knows a filtered list, and clears it but keeps the scope and the board choice', () => {
    expect(isFiltered(DEFAULT_PARAMS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_PARAMS, scope: 'mine' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_PARAMS, status: 'done' })).toBe(true);
    expect(cleared({ scope: 'tasks', kind: 'save', owner: 4, status: 'all', q: 'x', cancelled: true, drafts: true })).toEqual({ ...DEFAULT_PARAMS, scope: 'tasks', cancelled: true, drafts: true });
  });

  it('reads and writes the Draft filter and the board Show drafts (Decision 11)', () => {
    expect(parse('status=draft&drafts=1')).toEqual({ ...DEFAULT_PARAMS, status: 'draft', drafts: true });
    expect(toPlanSearch({ ...DEFAULT_PARAMS, status: 'draft', drafts: true })).toEqual({ status: 'draft', drafts: '1' });
    expect(listQuery({ ...DEFAULT_PARAMS, status: 'draft' }, 'all')).toBe('status=draft');
    expect(columnQuery(DEFAULT_PARAMS, 'all', 'draft')).toBe('status=draft');
  });

  it('remembers the view, List by default, and survives storage that throws', () => {
    expect(readView()).toBe('list');
    writeView('board');
    expect(readView()).toBe('board');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readView()).toBe('list');
    expect(() => writeView('list')).not.toThrow();
  });

  it('reads a template to start from', () => {
    expect(templateParam(new URLSearchParams('template=3'))).toBe(3);
    expect(templateParam(new URLSearchParams('template=abc'))).toBeNull();
  });
});
