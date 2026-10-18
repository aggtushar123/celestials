import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createScenario,
  deleteScenario,
  fetchScenario,
  fetchScenarios,
  fetchScenarioRuns,
  runScenario,
  updateScenario,
} from './scenarioApi';

// Integration tier (see the `testing` skill): only the fetch boundary
// is mocked — same convention as SettingsPage.test.tsx's own.
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface FetchOptions {
  method?: string;
  body?: string;
}

// Untyped params — nothing here branches on url/options, so there's
// nothing to name; toHaveBeenCalledWith/.mock.calls still capture every
// argument a caller actually passed regardless of this mock's own
// declared arity.
function fetchMockReturning(body: unknown, status = 200) {
  return vi.fn(() => Promise.resolve(jsonResponse(status, body))) as ReturnType<
    typeof vi.fn<(url: string, options?: FetchOptions) => Promise<ReturnType<typeof jsonResponse>>>
  >;
}

const scenario = {
  id: 1,
  name: 'Onboarding Flow',
  apply_to: 'organizations',
  apply_to_display: 'Organizations',
  nodes: [],
  edges: [],
  is_active: false,
  created_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:00:00Z',
};

describe('scenarioApi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchScenarios GETs the plain-array list endpoint', async () => {
    const fetchMock = fetchMockReturning([scenario]);
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchScenarios()).toEqual([scenario]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/scenarios/'), expect.anything());
  });

  it('fetchScenario GETs by id', async () => {
    vi.stubGlobal('fetch', fetchMockReturning(scenario));
    expect(await fetchScenario(1)).toEqual(scenario);
  });

  it('createScenario POSTs the write payload', async () => {
    const fetchMock = fetchMockReturning(scenario, 201);
    vi.stubGlobal('fetch', fetchMock);

    const payload = { name: 'Onboarding Flow', apply_to: 'organizations' as const, nodes: [], edges: [], is_active: false };
    await createScenario(payload);

    const [, options] = fetchMock.mock.calls[0];
    expect(options!.method).toBe('POST');
    expect(JSON.parse(options!.body!)).toEqual(payload);
  });

  it('updateScenario PATCHes by id', async () => {
    const fetchMock = fetchMockReturning(scenario);
    vi.stubGlobal('fetch', fetchMock);

    await updateScenario(1, { name: 'Renamed', apply_to: 'organizations', nodes: [], edges: [], is_active: true });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/scenarios/1/');
    expect(options!.method).toBe('PATCH');
  });

  it('deleteScenario DELETEs by id', async () => {
    const fetchMock = fetchMockReturning(null, 204);
    vi.stubGlobal('fetch', fetchMock);

    await deleteScenario(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/scenarios/1/');
    expect(options!.method).toBe('DELETE');
  });

  it('runScenario POSTs the target customer_id', async () => {
    const run = { id: 5, scenario: 1, customer: { id: 9, name: 'Globex' }, triggered_by: 'manual', status: 'success', log: [], started_at: '2026-09-04T00:00:00Z', finished_at: '2026-09-04T00:00:01Z' };
    const fetchMock = fetchMockReturning(run, 201);
    vi.stubGlobal('fetch', fetchMock);

    expect(await runScenario(1, 9)).toEqual(run);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/scenarios/1/run/');
    expect(JSON.parse(options!.body!)).toEqual({ customer_id: 9 });
  });

  it('fetchScenarioRuns GETs the run history', async () => {
    const fetchMock = fetchMockReturning([]);
    vi.stubGlobal('fetch', fetchMock);

    await fetchScenarioRuns(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/scenarios/1/runs/'), expect.anything());
  });
});
