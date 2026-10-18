import { afterEach, describe, expect, it, vi } from 'vitest';
import { B_CAMPAIGN, B_DEPT, B_DONE, B_MAIL, B_PARTLY, B_PIZZA, B_TICKET, B_UNASSIGNED, BUNDLES, MESSAGE_BUNDLES, OUTSIDE_BUNDLES, B_OUTSIDE, B_COMMENT, B_LIVE } from './testBundleFixtures';
import { stubBundles } from './testBundles';

const call = async (method: string, path: string, body?: unknown) => {
  const response = (await fetch(`http://localhost/api/v1${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })) as unknown as { status: number; json: () => Promise<unknown> };
  return [response.status, await response.json()] as const;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (path: string) => (await call('GET', path))[1] as Record<string, any>;

describe('stubBundles (agent bundles D1 contract §5, §9, §10)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists waiting bundles on Mine and runs one: applied, skipped, and the row leaves', async () => {
    stubBundles();
    const feed = await read('/work/feed/?kind=bundle');
    expect(feed.groups[0].items.map((i: { key: string }) => i.key)).toEqual(['bundle:12']);
    const company = await read('/work/feed/team/?scope=company&kind=bundle');
    expect(company.groups[0].items.map((i: { key: string; for: unknown }) => [i.key, i.for])).toEqual([['bundle:13', null], ['bundle:14', null]]);
    const [status, body] = await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }, { id: 43, selected: false }] });
    expect(status).toBe(200);
    const ran = (body as { bundle: typeof B_PIZZA }).bundle;
    expect(ran.status).toBe('done');
    expect(ran.steps.map((s) => s.status)).toEqual(['applied', 'skipped', 'skipped']);
    expect(ran.steps[0].title).toBe('Call today');
    expect(ran.steps[0].outputs).toEqual({ task_id: 990, task_url: '/work/mine?task=990' });
    expect((await read('/work/feed/?kind=bundle')).groups[0].items).toEqual([]);
  });

  it('refuses a body that does not name every waiting step, nothing selected, or a step it may not run', async () => {
    stubBundles();
    expect(await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: true }] })).toEqual([400, { steps: ['List every waiting step once.'] }]);
    expect(await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: false }, { id: 42, selected: false }, { id: 43, selected: false }] })).toEqual([400, { steps: ['Choose at least one step to run.'] }]);
    const [status, body] = await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: false }, { id: 42, selected: false }, { id: 43, selected: true }] });
    expect([status, body]).toEqual([403, { code: 'CANT_RUN_STEP', detail: "You can't run step 3.", step: 43 }]);
  });

  it('fails a step, fills placeholders, and retries', async () => {
    stubBundles({ failSteps: { 51: 'Nobody to send to.' } });
    const [, body] = await call('POST', '/agents/bundles/13/run/', { steps: [{ id: 51, selected: true }, { id: 52, selected: true }] });
    const ran = (body as { bundle: typeof B_CAMPAIGN }).bundle;
    expect(ran.status).toBe('partly_done');
    expect(ran.steps.map((s) => [s.status, s.error])).toEqual([
      ['failed', 'Nobody to send to.'],
      ['failed', "Needs step 1, which didn't run."],
    ]);
    const [, again] = await call('POST', '/agents/bundles/13/steps/51/retry/', {});
    expect((again as { bundle: typeof B_CAMPAIGN }).bundle.steps[0].status).toBe('applied');
    const [, last] = await call('POST', '/agents/bundles/13/steps/52/retry/', {});
    const done = (last as { bundle: typeof B_CAMPAIGN }).bundle;
    expect(done.status).toBe('done');
    expect(done.steps[1].title).toBe('Follow up on the campaign');
    expect(done.steps[1].preview.task?.title).toBe('Follow up on /campaigns/990');
    expect(done.steps[1].placeholders).toEqual([]);
  });

  it('answers 409 for a finished bundle with who ran it, and rejects a waiting one', async () => {
    stubBundles();
    const [status, body] = await call('POST', `/agents/bundles/${B_DONE.id}/run/`, { steps: [] });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'BUNDLE_RAN', detail: 'Carl CSM ran this at 10:42.' });
    expect(await call('POST', '/agents/bundles/12/reject/', { reason: 'nope' })).toEqual([400, { reason: ['Choose already handled, not relevant, wrong person or other.'] }]);
    const [ok, rejected] = await call('POST', '/agents/bundles/12/reject/', { reason: 'not_relevant' });
    expect([ok, (rejected as { bundle: typeof B_PIZZA }).bundle.status]).toEqual([200, 'rejected']);
  });

  it('lists History with filters and pages, and finds an action bundle', async () => {
    stubBundles({ actions: { 81: B_PARTLY.id } });
    const all = await read('/agents/bundles/history/');
    expect(all.results.map((b: { id: number }) => b.id)).toEqual([16, 15, 17]);
    expect((await read('/agents/bundles/history/?status=done')).results.map((b: { id: number }) => b.id)).toEqual([15]);
    expect((await call('GET', '/agents/bundles/history/?status=waiting'))[0]).toBe(400);
    expect((await read('/agents/actions/81/')).bundle).toBe(16);
  });

  it('answers the queues and filters a Team queue by kind', async () => {
    stubBundles();
    expect((await read('/work/queues/')).queues.map((q: { key: string }) => q.key)).toEqual(['mine', 'team', 'company', 'history']);
    expect((await call('GET', '/work/feed/team/?scope=team&kind=todo'))).toEqual([400, { kind: ['Choose bundle, rule_review, question, task or suggestion.'] }]);
  });

  it('empties a send step\'s audience once it leaves proposed', async () => {
    stubBundles();
    const [, body] = await call('POST', '/agents/bundles/13/run/', { steps: [{ id: 51, selected: true }, { id: 52, selected: true }] });
    expect((body as { bundle: typeof B_CAMPAIGN }).bundle.steps[0].preview.campaign?.audience).toBeNull();
    stubBundles({ failSteps: { 61: 'Nobody to send to.' } });
    const [, failed] = await call('POST', '/agents/bundles/14/run/', { steps: [{ id: 61, selected: true }] });
    expect((failed as { bundle: { steps: { preview: { survey?: { audience: unknown } } }[] } }).bundle.steps[0].preview.survey?.audience).toBeNull();
  });

  it('fails a send step again, as a step error, when someone other than the runner retries it', async () => {
    const send = { ...B_PARTLY.steps[1], id: 82, status: 'failed' as const };
    stubBundles({ bundles: [{ ...B_PARTLY, steps: [B_PARTLY.steps[0], send] }] });
    const [status, body] = await call('POST', '/agents/bundles/16/steps/82/retry/', {});
    expect(status).toBe(200);
    const step = (body as { bundle: typeof B_PARTLY }).bundle.steps[1];
    expect([step.status, step.error]).toEqual(['failed', 'Only the person who ran this step can retry it.']);
  });

  it('empties the audience of a send step that fails for a step it needs', async () => {
    const first = B_CAMPAIGN.steps[0];
    const send = {
      ...first,
      placeholders: [{ field: 'name', step: 2, key: 'task_url', label: 'Task link from step 2' }],
      preview: { campaign: { ...first.preview.campaign!, name: 'Send {{step 2.task_url}}' } },
    };
    stubBundles({ bundles: [{ ...B_CAMPAIGN, steps: [send, B_CAMPAIGN.steps[1]] }] });
    const [, body] = await call('POST', '/agents/bundles/13/run/', { steps: [{ id: 51, selected: true }, { id: 52, selected: false }] });
    const step = (body as { bundle: typeof B_CAMPAIGN }).bundle.steps[0];
    expect([step.status, step.error, step.preview.campaign?.audience]).toEqual(['failed', "Needs step 2, which didn't run.", null]);
  });
});

describe('stubBundles: live Slack channel (round 2 D2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a run with a chosen channel posts there: the preview, connector and thread flag follow', async () => {
    stubBundles({ bundles: [B_LIVE] });
    const [status, body] = await call('POST', `/agents/bundles/${B_LIVE.id}/run/`, { steps: [{ id: 471, selected: true, fields: { channel_choice: '5:C0ESCALATE' } }] });
    expect(status).toBe(200);
    const done = (body as { bundle: typeof B_LIVE }).bundle.steps[0];
    expect(done.preview.slack).toMatchObject({ channel: '#escalations', in_thread: false, synced: false });
    expect(done.fields.connector_id).toBe(5);
  });
});

describe('stubBundles: delivery 2 (contract §4.1 to §4.7)', () => {
  const send = async (method: string, path: string, body?: unknown) => {
    const answer = await fetch(`http://localhost/api/v1${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: answer.status, body: await answer.json() };
  };

  it('saves a waiting step and marks it edited; refuses a key it may not change', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    const saved = await send('PATCH', '/agents/bundles/20/steps/202/', { fields: { title: 'Fix the login loop today' } });
    expect(saved.status).toBe(200);
    const step = saved.body.bundle.steps.find((s: { id: number }) => s.id === 202);
    expect([step.fields.title, step.edited, saved.body.bundle.edited_by]).toEqual(['Fix the login loop today', true, { id: 1, name: 'Alice' }]);
    expect((await send('PATCH', '/agents/bundles/20/steps/202/', { fields: { body: 'x' } })).body).toEqual({ steps: { 202: { body: ["This can't be changed here."] } } });
    expect((await send('PATCH', '/agents/bundles/20/steps/202/', {})).body).toEqual({ steps: ['Send fields or selected.'] });
    expect((await send('PATCH', '/agents/bundles/20/steps/202/', { fields: {} })).body).toEqual({ steps: ['Send fields or selected.'] });
    expect((await send('PATCH', '/agents/bundles/15/steps/71/', { selected: false })).status).toBe(409);
  });

  it('refreshes a message bundle, keeping edited steps, and refuses a nightly one', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    const fresh = await send('POST', '/agents/bundles/21/refresh/');
    expect(fresh.status).toBe(200);
    expect(fresh.body.bundle.has_newer_message).toBe(false);
    expect(fresh.body.bundle.steps.map((s: { id: number; position: number }) => [s.id, s.position])).toEqual([
      [211, 1],
      [290, 2],
    ]);
    expect(await send('POST', '/agents/bundles/12/refresh/')).toEqual({ status: 409, body: { code: 'NOT_A_THREAD', detail: 'Only a bundle made from a message can be refreshed.' } });
  });

  it('answers a run that names replaced steps with BUNDLE_REFRESHED', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    await send('POST', '/agents/bundles/21/refresh/');
    const run = await send('POST', '/agents/bundles/21/run/', { steps: [{ id: 211, selected: true }, { id: 212, selected: true }] });
    expect([run.status, run.body.code, run.body.detail]).toEqual([409, 'BUNDLE_REFRESHED', 'This bundle was updated with a newer message. Review it again.']);
  });

  it('adds needs_customer to every rail row: null unless the stub names it', async () => {
    stubBundles({ departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true, needsCustomer: { 'department:cs': 3 } });
    const rows = (await send('GET', '/work/queues/')).body.queues.map((q: { key: string; needs_customer: number | null }) => [q.key, q.needs_customer]);
    expect(rows).toContainEqual(['department:cs', 3]);
    expect(rows).toContainEqual(['unassigned', null]);
    expect(rows.every(([, n]: [string, number | null]) => n === 3 || n === null)).toBe(true);
  });

  it('lists department and Unassigned queues, reads them, and counts the reader department in the badge', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true });
    const rows = (await send('GET', '/work/queues/')).body.queues.map((q: { key: string; count: number | null }) => [q.key, q.count]);
    expect(rows.slice(-3)).toEqual([
      ['department:cs', 1],
      ['unassigned', 1],
      ['history', null],
    ]);
    const dept = (await send('GET', '/work/feed/team/?scope=department%3Acs')).body;
    expect([dept.scope, dept.groups[0].items.map((i: { key: string }) => i.key)]).toEqual(['department:cs', [`bundle:${B_DEPT.id}`]]);
    expect([dept.groups[0].items[0].detail.routed_to, dept.groups[0].items[0].detail.department]).toEqual(['department', { key: 'cs', label: 'Customer Success' }]);
    const unassigned = (await send('GET', '/work/feed/team/?scope=unassigned')).body;
    expect(unassigned.groups[0].items.map((i: { key: string }) => i.key)).toEqual([`bundle:${B_UNASSIGNED.id}`]);
    expect((await send('GET', '/work/feed/team/?scope=department%3Asales')).status).toBe(403);
    const before = (await send('GET', '/work/feed/count/')).body.badge;
    await send('POST', `/agents/bundles/${B_DEPT.id}/run/`, { steps: [{ id: 221, selected: true }] });
    expect((await send('GET', '/work/feed/count/')).body.badge).toBe(before - 1);
  });

  it('keeps department and Unassigned bundles off Mine and My team, and names the rejecter', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    const mine = (await send('GET', '/work/feed/?kind=bundle')).body.groups[0].items.map((i: { key: string }) => i.key);
    expect(mine).toContain(`bundle:${B_TICKET.id}`);
    expect(mine).not.toContain(`bundle:${B_DEPT.id}`);
    const rejected = await send('POST', `/agents/bundles/${B_MAIL.id}/reject/`, { reason: 'other' });
    expect(rejected.body.bundle.rejected_by).toEqual({ id: 1, name: 'Alice' });
  });

  it('answers 400 to a run naming a non-integer or boolean step id, and BUNDLE_REFRESHED reads only integer ids (contract change 5)', async () => {
    stubBundles();
    const listed = [{ id: 41, selected: true }, { id: 42, selected: false }];
    for (const bad of ['43', true, 43.5, null]) {
      expect(await call('POST', '/agents/bundles/12/run/', { steps: [...listed, { id: bad, selected: false }] })).toEqual([400, { steps: ['List every waiting step once.'] }]);
    }
    stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    await call('POST', `/agents/bundles/${B_MAIL.id}/refresh/`);
    const [status, body] = await call('POST', `/agents/bundles/${B_MAIL.id}/run/`, { steps: [{ id: '999', selected: true }] });
    expect([status, body]).toEqual([400, { steps: ['List every waiting step once.'] }]);
  });

  it('answers a stale cursor on a department or Unassigned queue with the cursor 400 (contract change 6)', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true });
    const stale = [400, { cursor: ['That list has changed. Reload Work.'] }];
    expect(await call('GET', '/work/feed/team/?scope=department%3Acs&group=decide&cursor=decide%3A5')).toEqual(stale);
    expect(await call('GET', '/work/feed/team/?scope=unassigned&group=decide&cursor=junk')).toEqual(stale);
  });

  it('answers 409 STEP_NOT_WAITING with the bundle when a save names a step a Refresh removed (contract change 9)', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refreshAnswer: [] });
    await call('POST', `/agents/bundles/${B_MAIL.id}/refresh/`);
    const [status, body] = await call('PATCH', `/agents/bundles/${B_MAIL.id}/steps/212/`, { fields: { title: 'x' } });
    const refused = body as { code: string; detail: string; bundle: { id: number; steps: { id: number }[] } };
    expect([status, refused.code, refused.detail, refused.bundle.id]).toEqual([409, 'STEP_NOT_WAITING', 'Only a waiting step can be changed.', B_MAIL.id]);
    expect(refused.bundle.steps.map((st) => st.id)).not.toContain(212);
  });

  it('counts Mine without department-queue bundles; only the badge adds the reader department queue (contract change 3)', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true });
    const rows = async () => Object.fromEntries((await read('/work/queues/')).queues.map((q: { key: string; count: number | null }) => [q.key, q.count]));
    const before = await rows();
    const badge = (await read('/work/feed/count/')).badge;
    expect(before['department:cs']).toBe(1);
    expect(badge).toBe(before.mine + before['department:cs']);
    await call('POST', `/agents/bundles/${B_DEPT.id}/run/`, { steps: [{ id: 221, selected: true }] });
    expect((await rows()).mine).toBe(before.mine);
    expect((await read('/work/feed/count/')).badge).toBe(badge - 1);
  });
});

type Answer = { bundle: typeof B_OUTSIDE };

describe('agent bundles D3 stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers a step pick list, and its refusals', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_priorities: { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } } } });
    const get = (path: string) => fetch(`http://localhost/api/v1${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));
    expect((await get('/agents/bundles/401/steps/413/options/jira_projects/')).body.options.map((o: { id: string }) => o.id)).toEqual(['SUP', 'ENG']);
    expect((await get('/agents/bundles/401/steps/413/options/jira_issue_types/')).body).toEqual({ project: ['Choose a project first.'] });
    expect((await get('/agents/bundles/401/steps/413/options/jira_issue_types/?project=ENG')).body.options.map((o: { name: string }) => o.name)).toEqual(['Bug']);
    expect((await get('/agents/bundles/401/steps/413/options/slack_channels/')).body).toEqual({ list: ['This step has no such list.'] });
    expect(await get('/agents/bundles/401/steps/413/options/jira_priorities/')).toEqual({ status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } });
    expect((await get('/agents/bundles/401/steps/413/options/jira_priorities/')).status).toBe(200);
    expect((await get('/agents/bundles/401/steps/414/options/jira_assignees/?query=eri')).body.options.map((o: { name: string }) => o.name)).toEqual(['Erin Eng']);
  });

  it('refuses a pick list in the contract order: list, then project, then query', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const get = (path: string) => fetch(`http://localhost/api/v1${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));
    const long = 'x'.repeat(101);
    expect((await get(`/agents/bundles/401/steps/413/options/slack_channels/?query=${long}`)).body).toEqual({ list: ['This step has no such list.'] });
    expect((await get(`/agents/bundles/401/steps/413/options/jira_issue_types/?query=${long}`)).body).toEqual({ project: ['Choose a project first.'] });
    expect((await get(`/agents/bundles/401/steps/413/options/jira_issue_types/?project=ENG&query=${long}`)).body).toEqual({ query: ['Keep the search under 100 characters.'] });
  });

  it('a saved Jira assignee changes the preview: none clears the model member, a person is no longer matched later', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const [, cleared] = await call('PATCH', '/agents/bundles/401/steps/413/', { fields: { assignee: null } });
    const create = (cleared as Answer).bundle.steps.find((s) => s.id === 413)!;
    expect(create.fields.assignee).toBeNull();
    expect(create.preview.jira?.assignee).toBeNull();
    const [, chosen] = await call('PATCH', '/agents/bundles/401/steps/414/', { fields: { assignee: { id: 'acc-priya', name: 'Priya Shah' } } });
    const assign = (chosen as Answer).bundle.steps.find((s) => s.id === 414)!;
    expect(assign.preview.jira_assign?.assignee).toEqual({ name: 'Priya Shah', matched_later: false });
  });

  it('a run gives outside steps their outputs and links, and fails one on request', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOutside: { 412: 'Slack refused the post: the app isn\'t in #support.' } });
    const body = { steps: B_OUTSIDE.steps.map((s) => ({ id: s.id, selected: true })) };
    const answer = await fetch('http://localhost/api/v1/agents/bundles/401/run/', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
    const [mail, slack, create, assign] = answer.bundle.steps;
    expect(mail.status).toBe('applied');
    expect(slack).toMatchObject({ status: 'failed', error: "Slack refused the post: the app isn't in #support." });
    expect(create.outputs).toEqual({ ticket_key: 'SUP-501', ticket_url: 'https://acme.atlassian.net/browse/SUP-501' });
    expect(create.links).toEqual([{ label: 'Open SUP-501 in Jira', url: 'https://acme.atlassian.net/browse/SUP-501', external: true }]);
    expect(assign.outputs).toEqual({ ticket_key: 'SUP-501', ticket_url: 'https://acme.atlassian.net/browse/SUP-501' });
  });

  it('runs a Jira comment and links to it (round 2 D1 contract §2, R2D1-6)', async () => {
    stubBundles({ bundles: [B_COMMENT] });
    const [, body] = await call('POST', '/agents/bundles/405/run/', { steps: [{ id: 451, selected: true }] });
    const [s] = (body as { bundle: typeof B_COMMENT }).bundle.steps;
    expect(s.outputs).toEqual({ ticket_key: 'SUP-12', ticket_url: 'https://acme.atlassian.net/browse/SUP-12', comment_url: 'https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031' });
    expect(s.links).toEqual([{ label: 'Open the comment on SUP-12 in Jira', url: 'https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031', external: true }]);
  });
});
