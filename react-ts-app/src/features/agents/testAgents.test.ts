import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACT_APPLIED_AUTO,
  ACT_CAMPAIGN_CREATE,
  ACT_CANVAS_CREATE,
  ACT_DRAFT_REPLY,
  ACT_DRAFT_TICKET,
  ACT_LIFECYCLE,
  ACT_PLAN_START,
  ACT_PLAN_TEMPLATE,
  ACT_SCENARIO_CREATE,
  ACT_SEGMENT_CREATE,
  AGENT_SETTINGS,
  BUILT_CAMPAIGN_ID,
  BUILT_CANVAS_ID,
  BUILT_RULE_ID,
  BUILT_SEGMENT_ID,
  BUILT_TEMPLATE_ID,
  DRAFT_EMAIL_ID,
  DRAFT_TICKET_ID,
  FAST_LANE_OFF,
  FAST_LANE_ON,
  STARTED_PLAN_ID,
} from './testAgentsFixtures';
import { stubAgents } from './testAgents';

afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown = {}) =>
  fetch(`http://localhost/api/v1${path}`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const patch = (body: unknown) =>
  fetch('http://localhost/api/v1/agents/settings/', { method: 'PATCH', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('stubAgents: the contract in miniature', () => {
  it('applies a proposed action once; a second decision is 409 ALREADY_DECIDED', async () => {
    stubAgents();
    const first = await post(`/agents/actions/${ACT_LIFECYCLE.id}/approve/`);
    expect(first.status).toBe(200);
    expect(first.body.action.status).toBe('applied');
    const again = await post(`/agents/actions/${ACT_LIFECYCLE.id}/reject/`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_DECIDED');
  });

  it('refuses a level above max_level, a budget over the plan and an unknown agent, all at once', async () => {
    stubAgents();
    const answer = await patch({ agents: { cs: { monthly_credits: 99999 }, bot: { enabled: true } }, levels: { cs: { 'record.owner': 'auto' } } });
    expect(answer.status).toBe(400);
    expect(answer.body).toEqual({
      agents: { cs: { monthly_credits: [`Choose a whole number from 0 to ${AGENT_SETTINGS.plan_monthly_credits}.`] }, bot: ['Unknown agent.'] },
      levels: { cs: { 'record.owner': ["This action can't be set to auto."] } },
    });
  });

  it('undoes an applied action, and refuses CHANGED_SINCE when told to', async () => {
    const { actions } = stubAgents({ changedSince: [ACT_APPLIED_AUTO.id] });
    const refused = await post(`/agents/actions/${ACT_APPLIED_AUTO.id}/undo/`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'CHANGED_SINCE', current: 'Churn', applied: 'Renewal' });
    actions.get(ACT_APPLIED_AUTO.id)!.changed = false;
    const undone = await post(`/agents/actions/${ACT_APPLIED_AUTO.id}/undo/`);
    expect(undone.body.action.status).toBe('undone');
  });

  it('runs an agent, or refuses BUDGET_USED for a spent one', async () => {
    stubAgents({ spent: { sales: 200 } });
    expect((await post('/agents/cs/run/')).status).toBe(200);
    const refused = await post('/agents/sales/run/');
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('BUDGET_USED');
  });
});

describe('stubAgents: delivery 2', () => {
  it('applies a draft and a plan with their result ids', async () => {
    stubAgents({ actions: [ACT_DRAFT_TICKET, ACT_PLAN_START] });
    const draft = await post(`/agents/actions/${ACT_DRAFT_TICKET.id}/approve/`);
    expect(draft.body.action.result).toMatchObject({ draft_id: DRAFT_TICKET_ID, plan_id: null });
    const plan = await post(`/agents/actions/${ACT_PLAN_START.id}/approve/`);
    expect(plan.body.action.result).toMatchObject({ plan_id: STARTED_PLAN_ID, draft_id: null });
  });

  it('refuses to undo a draft that was sent, in the contract words, with nothing to compare', async () => {
    const sentIds = new Set<number>([DRAFT_EMAIL_ID]);
    stubAgents({ actions: [ACT_DRAFT_REPLY], draftSent: (id) => sentIds.has(id) });
    const refused = await post(`/agents/actions/${ACT_DRAFT_REPLY.id}/undo/`);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ code: 'CHANGED_SINCE', detail: 'This draft has been sent.' });
    sentIds.clear();
    const undone = await post(`/agents/actions/${ACT_DRAFT_REPLY.id}/undo/`);
    expect(undone.body.action.status).toBe('undone');
  });
});

describe('stubAgents: delivery 3', () => {
  it('applies each builder kind with the result ids the contract names', async () => {
    stubAgents({ actions: [ACT_SEGMENT_CREATE, ACT_SCENARIO_CREATE, ACT_CAMPAIGN_CREATE, ACT_CANVAS_CREATE, ACT_PLAN_TEMPLATE] });
    const result = async (id: number) => (await post(`/agents/actions/${id}/approve/`)).body.action.result;
    expect(await result(ACT_SEGMENT_CREATE.id)).toMatchObject({ segment_id: BUILT_SEGMENT_ID, rule_id: null, campaign_id: null });
    expect(await result(ACT_SCENARIO_CREATE.id)).toMatchObject({ rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID, campaign_id: null });
    expect(await result(ACT_CAMPAIGN_CREATE.id)).toMatchObject({ campaign_id: BUILT_CAMPAIGN_ID, segment_id: BUILT_SEGMENT_ID, rule_id: null });
    expect(await result(ACT_CANVAS_CREATE.id)).toMatchObject({ canvas_id: BUILT_CANVAS_ID, segment_id: null });
    expect(await result(ACT_PLAN_TEMPLATE.id)).toMatchObject({ template_id: BUILT_TEMPLATE_ID, plan_id: null });
  });

  it('leaves an action proposed when an approval is refused past an owner limit', async () => {
    stubAgents({ actions: [ACT_SEGMENT_CREATE], refuseNextDecision: { status: 409, body: { code: 'OWNER_LIMIT', detail: 'You already own 50 segments.' } } });
    const refused = await post(`/agents/actions/${ACT_SEGMENT_CREATE.id}/approve/`);
    expect(refused).toEqual({ status: 409, body: { code: 'OWNER_LIMIT', detail: 'You already own 50 segments.' } });
    const again = await post(`/agents/actions/${ACT_SEGMENT_CREATE.id}/approve/`);
    expect(again.body.action.status).toBe('applied');
  });
});

describe('stubAgents: signals (agent bundles D2 contract §4.8)', () => {
  it('saves the interval and a source, and refuses bad values with the contract sentences', async () => {
    stubAgents();
    const patch = (body: unknown) => fetch('http://localhost/api/v1/agents/settings/', { method: 'PATCH', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const saved = await patch({ signal_interval: '4h', signal_sources: { slack: false } });
    expect([saved.body.signals.interval, saved.body.signals.sources.find((s: { key: string }) => s.key === 'slack').enabled]).toEqual(['4h', false]);
    expect((await patch({ signal_interval: '2h' })).body).toEqual({ signal_interval: ['Choose every 30 minutes, every hour, every 4 hours or once a day.'] });
    expect((await patch({ signal_sources: { fax: true, slack: 'yes' } })).body).toEqual({ signal_sources: { fax: ['Unknown source.'], slack: ['Choose on or off.'] } });
    expect((await patch({ signal_sources: ['slack'] })).body).toEqual({ signal_sources: ['Send the sources as one object.'] });
  });
});

describe('stubAgents: fast lane (round 2 D3 contract §5)', () => {
  const lane = (body: { signals: { fast_lane: typeof FAST_LANE_ON } }) => body.signals.fast_lane;

  it('reads the lane off, with Jira priority on', async () => {
    stubAgents();
    const read = await fetch('http://localhost/api/v1/agents/settings/').then((r) => r.json());
    expect(lane(read)).toEqual(FAST_LANE_OFF);
  });

  it('merges keys over the stored ones, a list replacing the list', async () => {
    stubAgents();
    await patch({ fast_lane: { on: true, rules: { words: [' Outage ', 'outage', 'Data loss'], senders: ['CEO@bigco.com', '@bigco.com'], slack_connectors: [6] } } });
    const saved = lane((await patch({ fast_lane: { per_hour: 5 } })).body);
    expect(saved).toMatchObject({ on: true, per_hour: 5, per_day: 50, rules: { jira_priority: true, words: ['outage', 'data loss'], senders: ['ceo@bigco.com', '@bigco.com'], slack_connectors: [6] } });
    expect(lane((await patch({ fast_lane: { rules: { words: ['fire'] } } })).body).rules.words).toEqual(['fire']);
  });

  it('refuses under fast_lane with the contract sentences', async () => {
    stubAgents();
    expect(await patch({ fast_lane: { rules: { words: ['x'] } } })).toEqual({ status: 400, body: { fast_lane: { rules: { words: ['Use 2 to 40 characters for each word.'] } } } });
    expect((await patch({ fast_lane: { rules: { senders: ['@bigco'] } } })).body).toEqual({ fast_lane: { rules: { senders: ['Use an email address or @domain for each sender.'] } } });
    expect((await patch({ fast_lane: { per_hour: 10, per_day: 5 } })).body).toEqual({ fast_lane: { per_hour: ["The hourly limit can't be more than the daily limit."] } });
    expect((await patch({ fast_lane: { per_day: 4 } })).body).toEqual({ fast_lane: { per_hour: ["The hourly limit can't be more than the daily limit."] } });
    expect((await patch({ fast_lane: { on: 'yes' } })).body).toEqual({ fast_lane: { on: ['Choose on or off.'] } });
  });
});
