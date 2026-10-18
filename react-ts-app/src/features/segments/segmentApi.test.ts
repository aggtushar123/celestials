import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  createSegment,
  deleteSegment,
  duplicateSegment,
  fetchChanges,
  fetchMembers,
  fetchRecordNames,
  fetchSegment,
  fetchSegments,
  previewSegment,
  searchRecords,
  setMemberState,
  updateSegment,
} from './segmentApi';
import { DANA_PRIVATE, RENEWAL_RISK, SEGMENTS, requests, stubSegments, type SegmentsSpy } from './testSegments';

/** "METHOD /path?query" for every request so far, oldest first. */
function called(spy: SegmentsSpy): string[] {
  return spy.mock.calls.map(([input, init]) => {
    const url = new URL(String(input));
    return `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
  });
}

describe('segment API (backend PR #84)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists with no query for All, and sends scope and search only when set', async () => {
    const spy = stubSegments();
    await fetchSegments('all', '');
    await fetchSegments('shared', 'risk');
    expect(called(spy)).toEqual(['GET /segments/', 'GET /segments/?scope=shared&search=risk']);
  });

  it('reads, creates, edits, duplicates and deletes on the contract paths, with the edit body as given', async () => {
    const spy = stubSegments();
    expect((await fetchSegment(7)).name).toBe('Renewal risk');
    await createSegment({
      name: 'Quiet',
      kind: 'customer',
      description: '',
      rules: { match: 'all', conditions: [] },
      sharing: 'private',
      shared_with: [],
      alert_on_changes: false,
    });
    await updateSegment(7, { name: 'Renewal risk Q4' });
    await duplicateSegment(7);
    await deleteSegment(7);
    expect(called(spy)).toEqual([
      'GET /segments/7/',
      'POST /segments/',
      'PATCH /segments/7/',
      'POST /segments/7/duplicate/',
      'DELETE /segments/7/',
    ]);
    expect(requests(spy, 'PATCH', /^\/segments\/7\/$/)[0].body).toEqual({ name: 'Renewal risk Q4' });
  });

  it('reads members with the query given, pins with a state, reads changes by days and previews unsaved rules', async () => {
    const spy = stubSegments();
    expect((await fetchMembers(7, 'search=piz&sort=-arr')).summary.members).toBe(3);
    expect(await setMemberState(7, 2, 'pinned')).toEqual({ pinned_ids: [2], excluded_ids: [] });
    await fetchChanges(7, 90);
    await previewSegment({ kind: 'customer', rules: RENEWAL_RISK.rules });
    expect(called(spy)).toEqual([
      'GET /segments/7/members/?search=piz&sort=-arr',
      'PATCH /segments/7/members/2/',
      'GET /segments/7/changes/?days=90',
      'POST /segments/preview/',
    ]);
    expect(requests(spy, 'PATCH', /members\/2\/$/)[0].body).toEqual({ state: 'pinned' });
  });

  it('searches organisations or accounts by name on their own lists', async () => {
    const spy = stubSegments();
    expect(await searchRecords('customer', 'piz')).toEqual([{ id: 7, name: 'Pizza Hut' }]);
    expect(await searchRecords('account', 'emea')).toEqual([{ id: 12, name: 'Pizza EMEA' }]);
    expect(called(spy)).toEqual(['GET /customers/?search=piz', 'GET /accounts/?search=emea']);
  });

  it('404s a segment I cannot read (private, owned by someone else) the same as a missing id', async () => {
    stubSegments({ segments: [...SEGMENTS, DANA_PRIVATE] });
    const missing = (await fetchSegment(999).catch((error: unknown) => error)) as ApiError;
    const unreadable = (await fetchSegment(DANA_PRIVATE.id).catch((error: unknown) => error)) as ApiError;
    expect(missing).toBeInstanceOf(ApiError);
    expect(unreadable).toBeInstanceOf(ApiError);
    expect(unreadable.status).toBe(missing.status);
    expect(unreadable.body).toEqual(missing.body);
    expect(unreadable.status).toBe(404);
  });

  it('names ids from the kind portfolio, asks nothing for none, and leaves out ids that do not come back', async () => {
    const spy = stubSegments();
    expect(await fetchRecordNames('customer', [])).toEqual({});
    expect(spy).not.toHaveBeenCalled();
    expect(await fetchRecordNames('customer', [7])).toEqual({ '7': 'Pizza Hut' });
    expect(await fetchRecordNames('account', [12, 99])).toEqual({ '12': 'Pizza EMEA' });
    expect(called(spy)).toEqual([
      'GET /organizations/portfolio/?ids=7&limit=100',
      'GET /accounts/portfolio/?ids=12%2C99&limit=100',
    ]);
  });
});
