import { describe, expect, it } from 'vitest';
import {
  askAboutQuestion,
  detailContext,
  detailIdOf,
  detailLabel,
  detailPath,
  parseOrganizationId,
  isStoryFocus,
  storyFocusLabel,
  type DetailNames,
} from './detailAskContext';
import { parseDetailParams } from './detailParams';

const params = (query: string) => parseDetailParams(new URLSearchParams(query));
const NAMES: DetailNames = { organization: 7, name: 'Pizza Hut', accounts: { 31: 'EMEA', 32: 'North America' } };
const base = { surface: 'organizations' as const, view: 'detail' as const, organization: 7 };

describe('the organisation page as a question carries it', () => {
  it('reads the organisation id from the path only', () => {
    expect(detailIdOf('/organizations/7')).toBe(7);
    expect(detailIdOf('/organizations/list')).toBeNull();
    expect(detailIdOf('/organizations/board')).toBeNull();
    expect(detailIdOf('/organizations/007')).toBeNull();
    expect(detailIdOf('/organizations/7/story')).toBeNull();
    expect(detailIdOf('/organizations/0')).toBeNull();
    expect(detailIdOf('/organizations/7/plans/new')).toBe(7);
  });

  it('parses a route id as a positive integer, the one rule the page and its Ask share', () => {
    expect(parseOrganizationId('7')).toBe(7);
    expect(parseOrganizationId('120')).toBe(120);
    for (const bad of ['0', '007', '-1', '1.5', 'abc', '', ' 7', undefined]) expect(parseOrganizationId(bad)).toBeNull();
  });

  it('carries the account chip on the tabs that show it, and never "none"', () => {
    expect(detailContext(7, params(''))).toEqual({ ...base, account: null, focus: null });
    expect(detailContext(7, params('account=31'))).toEqual({ ...base, account: 31, focus: null });
    expect(detailContext(7, params('account=31&tab=people')).account).toBe(31);
    expect(detailContext(7, params('account=31&tab=files')).account).toBe(31);
    expect(detailContext(7, params('account=none')).account).toBeNull();
    // Details and Knowledge are the whole organisation's: no chips, no account.
    expect(detailContext(7, params('account=31&tab=details')).account).toBeNull();
    expect(detailContext(7, params('account=31&tab=knowledge')).account).toBeNull();
  });

  it('tells a story focus from a Dashboard or List one', () => {
    expect(isStoryFocus({ kind: 'note', id: 4 })).toBe(true);
    expect(isStoryFocus({ kind: 'calendar_event', id: 4 })).toBe(true);
    expect(isStoryFocus({ kind: 'companies', ids: [7] })).toBe(false);
    expect(isStoryFocus({ kind: 'attention', key: 'renewal' })).toBe(false);
    expect(isStoryFocus(null)).toBe(false);
  });

  it('words the focus and the question it prefills', () => {
    expect(storyFocusLabel({ kind: 'note', id: 4 })).toBe('This note');
    expect(storyFocusLabel({ kind: 'calendar_event', id: 4 })).toBe('This calendar event');
    expect(askAboutQuestion({ kind: 'health', id: 2 })).toBe('What should I know about this health change?');
  });

  it('names the chip from the page, then the focus', () => {
    expect(detailLabel({ ...base, account: null, focus: null }, NAMES)).toBe('Pizza Hut');
    expect(detailLabel({ ...base, account: 31, focus: null }, NAMES)).toBe('Pizza Hut · EMEA');
    expect(detailLabel({ ...base, account: 31, focus: { kind: 'email', id: 41 } }, NAMES)).toBe('Pizza Hut · EMEA · This email');
    // Before the page has loaded, or names for another organisation.
    expect(detailLabel({ ...base, account: 31, focus: null })).toBe('This organization · Account');
    expect(detailLabel({ ...base, organization: 9, account: null, focus: null }, NAMES)).toBe('This organization');
  });

  it("uses the server's label on a stored context, whatever the page reported", () => {
    expect(detailLabel({ ...base, account: 31, focus: null, label: 'Pizza Hut · EMEA' })).toBe('Pizza Hut · EMEA');
    expect(detailLabel({ ...base, account: null, focus: { kind: 'note', id: 4 }, label: 'Pizza Hut' }, { ...NAMES, name: 'Renamed' })).toBe(
      'Pizza Hut · This note',
    );
  });

  it('reopens the page with its account chip', () => {
    expect(detailPath({ ...base, account: null, label: 'Pizza Hut' })).toBe('/organizations/7');
    expect(detailPath({ ...base, account: 31, label: 'Pizza Hut · EMEA' })).toBe('/organizations/7?account=31');
  });
});
