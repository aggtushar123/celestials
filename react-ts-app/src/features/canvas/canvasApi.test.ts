import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMap, deleteMap, fetchGallery, fetchMap, fetchRecordMaps, saveMap } from './canvasApi';
import { galleryQuery, parseMapId } from './canvasParams';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<ReturnType<typeof ok>>;

function stub(body: unknown = { results: [], next: null }, status = 200) {
  const spy = vi.fn<FetchLike>(async () => ok(body, status));
  vi.stubGlobal('fetch', spy);
  return spy;
}
const sent = (spy: ReturnType<typeof stub>) =>
  spy.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api\/v1/, '')}`);

describe('canvas api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the gallery with q and the cursor', async () => {
    const spy = stub();
    await fetchGallery('', null);
    await fetchGallery('pizza hut', 'abc');
    expect(sent(spy)).toEqual(['GET /canvases/', 'GET /canvases/?q=pizza+hut&cursor=abc']);
  });

  it("reads a record's maps: the organisation nested, the account flat (Contract note 1)", async () => {
    const spy = stub({ results: [] });
    await fetchRecordMaps({ kind: 'organization', id: 7 });
    await fetchRecordMaps({ kind: 'account', id: 12 });
    expect(sent(spy)).toEqual(['GET /customers/7/canvases/', 'GET /accounts/12/canvases/']);
  });

  it('creates, reads, saves and deletes a map', async () => {
    const spy = stub({});
    await createMap({ name: 'Pizza Hut map', customer: 7, start: 'people' });
    await fetchMap(3);
    await saveMap(3, { name: 'x', nodes: [], edges: [], version: 2 });
    await deleteMap(3);
    expect(sent(spy)).toEqual(['POST /canvases/', 'GET /canvases/3/', 'PATCH /canvases/3/', 'DELETE /canvases/3/']);
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body))).toEqual({ name: 'Pizza Hut map', customer: 7, start: 'people' });
  });

  it('reads a map id from the route', () => {
    expect([parseMapId('12'), parseMapId('0'), parseMapId('create'), parseMapId(undefined)]).toEqual([12, null, null, null]);
    expect(galleryQuery('  ', null)).toBe('');
  });
});
