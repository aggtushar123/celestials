import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { approveReview } from '../rules/ruleApi';
import { fetchAnomalies } from '../anomalies/anomaliesApi';
import { fetchRequest, fetchRequests } from '../requests/requestsApi';
import {
  createCompanyInitiative,
  editInitiative,
  fetchBrainGraph,
  fetchBrief,
  fetchChanged,
  fetchCustomers,
  fetchDoing,
  fetchExplanation,
  fetchMembers,
  fetchMetricCut,
  fetchMetricList,
  fetchScopes,
  isScopeRefusal,
  startInitiative,
  writeBrief,
  writeExplanation,
} from './brainApi';
import { bodies, requests, stubBrain } from './testBrain';
import { COMPANY_BRIEF, COMPANY_EXPLANATION, TEAM } from './testBrainFixtures';
import type { ScopeKey } from './brainTypes';
import { ME_GRAPH, REQUEST_ROWS, TEAM_CUSTOMERS } from './testCustomersFixtures';
import { ALICE_PLAN, BOOK_BODY, CARL_READABLE_RULE, COMPANY_BODY, doingWorld, FIRST_NEW_ID, MEMBERS } from './testDoingFixtures';
import { ALICE, CARL } from './testDeskFixtures';

const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as ApiError);

describe('brain API on the contract stub (spec §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers only the reader’s scopes, narrowest first, with the widest as default', async () => {
    stubBrain({ offered: ['me', 'team'] });
    expect(await fetchScopes()).toEqual({ scopes: [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }], default: 'team' });
  });

  it('reads what changed and the kept brief for a scope', async () => {
    const { spy } = stubBrain();
    expect(await fetchChanged('team')).toEqual(TEAM);
    expect(await fetchBrief('company')).toEqual({ brief: COMPANY_BRIEF });
    expect(await fetchBrief('team')).toEqual({ brief: null });
    expect(requests(spy, 'GET', '/brain/')).toEqual(['/brain/changed/?scope=team', '/brain/brief/?scope=company', '/brain/brief/?scope=team']);
  });

  it('answers an unknown scope 400 before a refused one 403', async () => {
    const { revoke } = stubBrain();
    revoke('company');
    const unknown = await refusal(fetchChanged('everything' as never));
    expect([unknown?.status, (unknown?.body as { code: string }).code]).toEqual([400, 'SCOPE_UNKNOWN']);
    const refused = await refusal(fetchChanged('company'));
    expect([refused?.status, (refused?.body as { code: string }).code]).toEqual([403, 'SCOPE_NOT_ALLOWED']);
    expect(isScopeRefusal(refused)).toBe(true);
    expect(isScopeRefusal(unknown)).toBe(false);
    expect(isScopeRefusal(new ApiError(403, { detail: 'No.' }, 'No.'))).toBe(false);
  });

  it('checks the scope before the metric (Contract note 2)', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    expect((await refusal(fetchExplanation('nope', 'team')))?.status).toBe(403);
    const missing = await refusal(fetchExplanation('nope', 'company'));
    expect([missing?.status, missing?.message]).toEqual([404, 'No such metric.']);
  });

  it('writes a brief and an explanation, then reads them back', async () => {
    stubBrain({ hidden: 2 });
    const { brief } = await writeBrief('team');
    expect(brief).toMatchObject({ scope: 'team', generated_by: 'Alice Admin', stale: false });
    expect(await fetchBrief('team')).toEqual({ brief });
    expect(await fetchExplanation('arr_at_risk', 'company')).toEqual({ explanation: COMPANY_EXPLANATION });
    const { explanation } = await writeExplanation('arr_at_risk', 'team');
    expect(explanation).toMatchObject({ metric: 'arr_at_risk', scope: 'team', hidden: 2 });
  });

  it('refuses the next write with the server’s detail, once', async () => {
    stubBrain({ refuseNextWrite: { status: 429, detail: 'The AI budget for this month is spent.' } });
    const refused = await refusal(writeBrief('company'));
    expect([refused?.status, refused?.message]).toEqual([429, 'The AI budget for this month is spent.']);
    expect((await writeBrief('company')).brief.scope).toBe('company');
  });

  it('holds writes until released', async () => {
    const { releaseWrites } = stubBrain({ holdWrites: true });
    let done = false;
    const write = writeBrief('me').then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    releaseWrites();
    await write;
    expect(done).toBe(true);
  });

  it('fails the first reads when asked', async () => {
    stubBrain({ failScopes: 1, failChanged: 1 });
    expect((await refusal(fetchScopes()))?.status).toBe(500);
    expect((await fetchScopes()).default).toBe('company');
    expect((await refusal(fetchChanged('me')))?.status).toBe(500);
    expect((await fetchChanged('me')).scope).toBe('me');
  });
});

describe('requests outside /brain/ on the contract stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('passes every request outside /brain/ to passThrough, untouched', async () => {
    const other = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ survey_send_id: 77 }) }));
    stubBrain({ passThrough: other });
    expect(await approveReview(14)).toEqual({ survey_send_id: 77 });
    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe('What’s being done on the contract stub (Doing §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads each scope’s initiatives, plans and rules for Alice (Decision 2)', async () => {
    const { spy } = stubBrain();
    const me = await fetchDoing('me');
    expect(me.initiatives.map((i) => i.id)).toEqual([1]);
    expect(me.plans).toEqual([ALICE_PLAN]);
    expect((await fetchDoing('team')).initiatives.map((i) => i.id)).toEqual([1, 3]);
    const company = await fetchDoing('company');
    expect(company.initiatives.map((i) => i.id)).toEqual([1, 3, 4, 5]);
    expect(company.hidden).toBe(2);
    expect(requests(spy, 'GET', '/brain/doing/')).toEqual(['/brain/doing/?scope=me', '/brain/doing/?scope=team', '/brain/doing/?scope=company']);
  });

  it('answers an unknown scope 400 before a refused one 403, and refuses a Company start (§3)', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    expect((await refusal(fetchDoing('everything' as never)))?.status).toBe(400);
    expect(isScopeRefusal(await refusal(fetchDoing('team')))).toBe(true);
    expect(isScopeRefusal(await refusal(startInitiative('company' as never, BOOK_BODY)))).toBe(true);
  });

  it('refuses a Company start with its own sentence, a lost scope with the generic one, and an unknown scope 400 first (fix round 1, progress.md Ruling)', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    expect((await refusal(startInitiative('nope' as never, BOOK_BODY)))?.status).toBe(400);
    expect((await refusal(startInitiative('team', BOOK_BODY)))?.message).toBe("You can't see that view.");
    expect((await refusal(startInitiative('company' as never, BOOK_BODY)))?.message).toBe(
      'Company initiatives are started from the Company initiatives page.',
    );
  });

  it('starts an initiative on the reader’s own book, and their manager sees it in My team (Decision 3)', async () => {
    const world = doingWorld();
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, world });
    const made = await startInitiative('me', BOOK_BODY);
    expect(made).toMatchObject({
      id: FIRST_NEW_ID, for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, owner: CARL, can_edit: true, metric_label: 'ARR at risk',
    });
    expect(bodies(spy, 'POST', '/brain/initiatives/')).toEqual([BOOK_BODY]);
    vi.unstubAllGlobals();
    stubBrain({ reader: ALICE, offered: ['me', 'team'], viewAll: false, world });
    expect((await fetchDoing('team')).initiatives.find((i) => i.id === made.id)?.can_edit).toBe(true);
    expect((await fetchDoing('me')).initiatives.some((i) => i.id === made.id)).toBe(false);
  });

  it('refuses a metric with no owner cut and a book outside the team, in the server’s words (§1.3)', async () => {
    stubBrain({ offered: ['me', 'team'] });
    expect((await refusal(startInitiative('me', { ...BOOK_BODY, metric: 'active_customers' })))?.message).toBe(
      "That number can't be tracked for one person's book.",
    );
    const teamRefused = await refusal(startInitiative('team', { ...BOOK_BODY, for_user: 7 }));
    expect(teamRefused?.status).toBe(400);
    expect(teamRefused?.message).toBe('Choose yourself or someone below you.');
    expect((await startInitiative('team', { ...BOOK_BODY, for_user: 5 })).for?.label).toBe('Carl CSM');
  });

  it('refuses a Me start naming someone else, rather than pinning it back to the reader (controller item (b))', async () => {
    stubBrain({ offered: ['me', 'team'] });
    const refused = await refusal(startInitiative('me', { ...BOOK_BODY, for_user: 5 }));
    expect(refused?.status).toBe(400);
    expect(refused?.message).toBe('Choose yourself or someone below you.');
  });

  it('lets the owner, anyone above them and view_all edit; 403 otherwise (§1.3)', async () => {
    stubBrain({ offered: ['me', 'team'], viewAll: false });
    expect((await editInitiative(3, { title: 'Renamed' })).title).toBe('Renamed');
    const refused = await refusal(editInitiative(5, { status: 'abandoned' }));
    expect(refused?.status).toBe(403);
    expect(refused?.message).toBe("You can't change this initiative.");
  });

  it('refuses a PATCH that tries to move metric, dimension, member, owner_id or for_user (fix round 1, dispatch)', async () => {
    stubBrain({ offered: ['me', 'team'], viewAll: false });
    const asPatch = (body: Record<string, unknown>) => body as unknown as Parameters<typeof editInitiative>[1];
    expect((await refusal(editInitiative(3, asPatch({ title: 'Renamed', metric: 'nrr' }))))?.status).toBe(400);
    expect((await refusal(editInitiative(3, asPatch({ dimension: 'owner' }))))?.status).toBe(400);
    expect((await refusal(editInitiative(3, asPatch({ member: '7' }))))?.status).toBe(400);
    expect((await refusal(editInitiative(3, asPatch({ owner_id: 7 }))))?.status).toBe(400);
    const lockedForUser = await refusal(editInitiative(3, asPatch({ for_user: 7 })));
    expect(lockedForUser?.status).toBe(400);
    // The backend's own wording (controller item (a)): "This can't be
    // changed here.", not "This field can't be changed here.".
    expect(lockedForUser?.message).toBe("This can't be changed here.");
    // A disallowed field on an initiative the reader may not edit answers 403, not 400 (permission checked first).
    const refused = await refusal(editInitiative(5, asPatch({ metric: 'nrr' })));
    expect(refused?.status).toBe(403);
    // A clean patch on the same initiative still goes through.
    expect((await editInitiative(3, { title: 'Still allowed' })).title).toBe('Still allowed');
  });

  it('answers a PATCH to an unknown initiative with the backend’s own 404 (controller item (a))', async () => {
    stubBrain({ offered: ['me', 'team'], viewAll: false });
    const refused = await refusal(editInitiative(9999, { title: 'Nope' }));
    expect(refused?.status).toBe(404);
    expect(refused?.body).toEqual({ detail: 'No Initiative matches the given query.' });
  });

  it('starts a Company initiative through /metrics/initiatives/, for view_all only (Contract note 8)', async () => {
    const { spy } = stubBrain();
    const { id } = await createCompanyInitiative(COMPANY_BODY);
    expect((await fetchDoing('company')).initiatives.find((i) => i.id === id)).toMatchObject({
      for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, owner: CARL,
    });
    expect(bodies(spy, 'POST', '/metrics/initiatives/')).toEqual([COMPANY_BODY]);
    vi.unstubAllGlobals();
    stubBrain({ offered: ['me'] });
    expect((await refusal(createCompanyInitiative(COMPANY_BODY)))?.status).toBe(403);
  });

  it('links a rule the reader may read though they don’t own it, not only their own (fix round 1: readable vs mine)', async () => {
    stubBrain();
    const team = await fetchDoing('team');
    expect(team.rules).toContainEqual(CARL_READABLE_RULE);
    expect(CARL_READABLE_RULE.mine).toBe(false);
    expect(CARL_READABLE_RULE.readable).toBe(true);
  });

  it('lists the members, the metrics and one cut (Contract notes 4, 8)', async () => {
    stubBrain();
    expect(await fetchMembers()).toEqual(MEMBERS);
    expect((await fetchMetricList()).metrics.map((m) => m.key)).toEqual(['at_risk_arr', 'nrr', 'active_customers']);
    expect((await fetchMetricCut('at_risk_arr', 'owner')).members.map((m) => m.label)).toEqual(['Alice Admin', 'Bob Lead', 'Carl CSM', 'Dana CSM']);
  });
});

describe('What customers are saying on the contract stub (customers spec §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the section data and the graph for a scope', async () => {
    const { spy } = stubBrain();
    expect(await fetchCustomers('team')).toEqual(TEAM_CUSTOMERS);
    expect(await fetchBrainGraph('me')).toEqual(ME_GRAPH);
    expect(requests(spy, 'GET', '/brain/')).toEqual(['/brain/customers/?scope=team', '/brain/graph/?scope=me']);
  });

  it('refuses an unknown scope with 400 before a scope not offered with 403', async () => {
    stubBrain({ offered: ['me'] });
    expect((await refusal(fetchRequests('all', 'galaxy' as ScopeKey)))?.status).toBe(400);
    expect((await refusal(fetchRequests('all', 'team')))?.status).toBe(403);
    expect(isScopeRefusal(await refusal(fetchAnomalies('all', 'company')))).toBe(true);
    expect(isScopeRefusal(await refusal(fetchCustomers('team')))).toBe(true);
    expect((await refusal(fetchBrainGraph('galaxy' as ScopeKey)))?.body).toEqual({ code: 'SCOPE_UNKNOWN', detail: 'Choose me, team or company.' });
  });

  it('narrows /requests/ and /anomalies/ to the scope, keeps today’s list without one, and 404s a request outside it', async () => {
    stubBrain();
    expect((await fetchRequests('all', 'team')).map((r) => r.title)).toEqual(['SSO with Okta', 'Slack alerts']);
    expect((await fetchRequests('planned', 'company')).map((r) => r.id)).toEqual([2]);
    expect(await fetchRequests()).toHaveLength(REQUEST_ROWS.company.length);
    expect((await fetchRequests('all', 'team'))[0].arr).toBe('182000');
    expect((await fetchAnomalies('all', 'team'))[0].title).toBe('Similar reports across 2 of your companies');
    expect((await fetchRequest(5, 'company')).companies_asking).toEqual([]);
    expect((await refusal(fetchRequest(5, 'team')))?.status).toBe(404);
  });

  it('fails a read on request so pages can show Try again', async () => {
    stubBrain({ failCustomers: 1, failGraph: 1 });
    expect((await refusal(fetchCustomers('me')))?.status).toBe(500);
    expect((await refusal(fetchBrainGraph('me')))?.status).toBe(500);
    expect((await fetchCustomers('me')).scope).toBe('me');
  });
});
