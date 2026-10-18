import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/apiClient';
import { bulkUpdatePipeline, fetchPipeline } from './pipelineApi';
import type { PipelineRow } from './pipelineTypes';
import {
  OPPORTUNITY_ROWS,
  PIPELINE_FILTER_OPTIONS,
  RISK_ROWS,
  buildPipelinePage,
  emeaSeats,
  globexUplift,
  initechWin,
  recordWrites,
  stubPipelines,
} from './testPipelines';

// The stub answers as revenact-backend's pipelines_portfolio does (params.py,
// book.py, shape.py), so the page tests prove something.
const read = (query: string, kind: 'opportunities' | 'risks' = 'opportunities', rows?: PipelineRow[]) =>
  buildPipelinePage(kind, new URLSearchParams(query), rows ?? (kind === 'opportunities' ? OPPORTUNITY_ROWS : RISK_ROWS));
const ids = (query: string, kind: 'opportunities' | 'risks' = 'opportunities', rows?: PipelineRow[]) =>
  read(query, kind, rows).results.map((row) => row.id);

describe('the Pipelines stub', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the open stages by default, largest MRR first, with tiles over every stage', () => {
    const page = read('');
    expect(page.results.map((row) => row.id)).toEqual([43, 41, 42]);
    expect(page.count).toBe(3);
    expect(page.summary.items).toBe(5);
    expect(page.summary.mrr).toBe(9600);
    expect(page.summary.open).toEqual({ count: 3, mrr: 7300 });
    expect(page.summary.within['30']).toEqual({ count: 1, mrr: 2000 });
    expect(page.summary.within['90']).toEqual({ count: 1, mrr: 2000 });
    expect(page.summary.overdue).toEqual({ count: 1, mrr: 5000 });
    expect(page.summary.done_this_quarter).toEqual({ stage: 'closed_won', count: 1, mrr: 1500 });
    expect(page.summary.stages.map((stage) => [stage.value, stage.count])).toEqual([
      ['discovery', 1],
      ['qualification', 0],
      ['solution_validation', 0],
      ['proposal_price_review', 1],
      ['negotiation', 1],
      ['closed_won', 1],
      ['closed_lost', 1],
    ]);
  });

  it('keeps the tiles whatever the stage filter, and narrows them by every other filter', () => {
    expect(read('stage=closed_lost').summary).toEqual(read('').summary);
    expect(read('owner=3').summary.items).toBe(1);
    expect(read('owner=3').summary.open).toEqual({ count: 1, mrr: 5000 });
  });

  it('orders rows section first and groups in the backend order, narrowing one group with group_value', () => {
    const byStage = read('group=stage');
    expect(byStage.groups.map((group) => group.label)).toEqual(['Discovery', 'Proposal / Price Review', 'Negotiation']);
    expect(byStage.results.map((row) => row.id)).toEqual([42, 43, 41]);
    expect(read('group=month').groups.map((group) => group.key)).toEqual(['overdue', '2026-10', 'none']);
    const all = 'stage=discovery,qualification,solution_validation,proposal_price_review,negotiation,closed_won,closed_lost';
    expect(read(`${all}&group=owner`).groups.map((group) => group.label)).toEqual(['Carl CSM', 'Priya', 'Not in your book', 'Unassigned']);
    expect(read(`${all}&group=department`).groups.map((group) => group.key)).toEqual(['cs', 'sales', 'none']);
    const column = read('group=stage&group_value=negotiation');
    expect(column.results.map((row) => row.id)).toEqual([41]);
    expect(column.count).toBe(1);
    expect(column.groups).toHaveLength(3);
  });

  it('puts a closed item past its date in its month, not in Overdue', () => {
    expect(read('stage=closed_won&group=month').groups).toEqual([{ key: '2026-09', label: 'September 2026', count: 1, mrr: 1500 }]);
  });

  it('filters by quarter, owner bucket, department, organisation, account and search', () => {
    expect(ids('stage=closed_won&changed=quarter')).toEqual([44]);
    expect(ids('changed=quarter')).toEqual([]);
    expect(ids('owner=outside&stage=closed_won')).toEqual([44]);
    expect(ids('owner=unassigned&stage=closed_lost')).toEqual([45]);
    expect(ids('department=none')).toEqual([42]);
    expect(ids('organisation=7')).toEqual([41, 42]);
    expect(ids('account=12')).toEqual([41]);
    expect(ids('search=  pizza hut emea ')).toEqual([41]);
  });

  it('matches a date window at any stage, and overdue only when open', () => {
    const closingSoon: PipelineRow = { ...initechWin, id: 46, date: { value: '2026-10-05', days: 5 } };
    const rows = [...OPPORTUNITY_ROWS, closingSoon];
    expect(ids('stage=closed_won&date=30', 'opportunities', rows)).toEqual([46]);
    expect(ids('date=180')).toEqual([41]);
    expect(ids('stage=closed_won&date=overdue')).toEqual([]);
    expect(ids('date=overdue', 'risks')).toEqual([72]);
    expect(ids('stage=closed_lost&date=none')).toEqual([45]);
  });

  it('ignores parameter values it does not understand', () => {
    const plain = ids('');
    expect(ids('stage=won')).toEqual(plain);
    expect(ids('priority=urgent')).toEqual(plain);
    expect(ids('date=45')).toEqual(plain);
    expect(ids('owner=someone')).toEqual(plain);
    expect(ids('sort=size')).toEqual(plain);
    expect(ids('changed=year')).toEqual(plain);
    expect(read('group=size&group_value=x').groups).toEqual([]);
    expect(read('group=size&group_value=x').count).toBe(3);
  });

  it('sorts with missing values last either way, ties by title', () => {
    expect(ids('sort=date')).toEqual([43, 41, 42]);
    expect(ids('sort=-date')).toEqual([41, 43, 42]);
    expect(ids('sort=title')).toEqual([42, 41, 43]);
    expect(ids('sort=-priority')).toEqual([41, 42, 43]);
    expect(ids('sort=stage')).toEqual([42, 43, 41]);
    const twin: PipelineRow = { ...emeaSeats, id: 40, title: 'Apac seats' };
    expect(ids('sort=mrr', 'opportunities', [emeaSeats, twin])).toEqual([40, 41]);
  });

  it('reads every stage for ids, and nothing when ids names no usable id', () => {
    expect(ids('ids=44,45')).toEqual([44, 45]);
    expect(ids('ids=44&stage=closed_lost')).toEqual([]);
    expect(ids('ids=x')).toEqual([]);
  });

  it('pages by cursor, 50 rows by default and at most 100', () => {
    const many: PipelineRow[] = Array.from({ length: 120 }, (_, index) => ({ ...globexUplift, id: 100 + index, mrr: 1000 - index }));
    const first = read('limit=2', 'opportunities', many);
    expect(first.results.map((row) => row.id)).toEqual([100, 101]);
    expect(first.next_cursor).not.toBeNull();
    const second = read(`limit=2&cursor=${first.next_cursor}`, 'opportunities', many);
    expect(second.results.map((row) => row.id)).toEqual([102, 103]);
    expect(read('', 'opportunities', many).results).toHaveLength(50);
    expect(read('limit=500', 'opportunities', many).results).toHaveLength(100);
    expect(read('limit=500', 'opportunities', many).count).toBe(120);
    expect(read('limit=200&cursor=100', 'opportunities', many).next_cursor).toBeNull();
  });

  it('offers filters from the whole book, whatever the query', () => {
    const stages = read('').filters.stages;
    expect(stages.map((stage) => stage.name)).toEqual([
      'Discovery',
      'Qualification',
      'Solution Validation',
      'Proposal / Price Review',
      'Negotiation',
      'Closed Won',
      'Closed Lost',
    ]);
    expect(read('owner=3&search=globex').filters).toEqual({ ...PIPELINE_FILTER_OPTIONS, stages });
    const risks = read('', 'risks').filters;
    expect(risks.owners).toEqual([
      { value: '2', name: 'Carl CSM' },
      { value: '3', name: 'Priya' },
    ]);
    expect(risks.departments).toEqual([
      { value: 'cs', name: 'Customer Success' },
      { value: 'none', name: 'No department' },
    ]);
    expect(risks.stages.map((stage) => stage.name)).toEqual(['Open', 'Mitigated', 'Realised', 'Abandoned']);
  });

  it('answers a bulk edit per id, restamping a moved stage so it counts this quarter', async () => {
    stubPipelines();
    expect(await bulkUpdatePipeline('opportunities', { ids: [41, 41, 72], action: 'set_stage', value: 'closed_won' })).toEqual({
      updated: [41],
      failed: [{ id: 72, reason: 'Not found.' }],
    });
    const page = await fetchPipeline('opportunities', 'stage=closed_won&changed=quarter');
    expect(page.results.map((row) => row.id)).toEqual([41, 44]);
    expect(page.summary.done_this_quarter).toEqual({ stage: 'closed_won', count: 2, mrr: 3500 });
  });

  it('rejects a bulk value the backend would, with its 400', async () => {
    stubPipelines();
    await expect(bulkUpdatePipeline('risks', { ids: [71], action: 'set_stage', value: 'closed_won' })).rejects.toMatchObject({
      status: 400,
      body: { value: ['Not a stage.'] },
    });
    await expect(
      apiFetch('/pipelines/risks/bulk/', { method: 'POST', body: { ids: [71], action: 'set_date' } }),
    ).rejects.toMatchObject({ status: 400, body: { value: ['A date is YYYY-MM-DD, or null to clear it.'] } });
    await expect(bulkUpdatePipeline('risks', { ids: [71], action: 'set_date', value: '30/10/2026' })).rejects.toMatchObject({ status: 400 });
    await expect(bulkUpdatePipeline('risks', { ids: [71], action: 'set_department', value: 'none' })).rejects.toMatchObject({
      body: { value: ['Not a department.'] },
    });
  });

  it("applies a PATCH to its row, recomputing the date's days and overdue, and records the write", async () => {
    const spy = stubPipelines();
    const saved = await apiFetch<Record<string, unknown>>('/opportunities/41/', { method: 'PATCH', body: { expected_close: '2026-09-20' } });
    expect(saved).toMatchObject({ id: 41, expected_close: '2026-09-20', mrr: '2000.00' });
    const row = (await fetchPipeline('opportunities', 'ids=41')).results[0];
    expect(row).toMatchObject({ date: { value: '2026-09-20', days: -10 }, overdue: true, signal: { kind: 'overdue' } });
    expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { expected_close: '2026-09-20' } }]);
  });

  it('creates an item on the parent it names, at the kind\'s first stage', async () => {
    stubPipelines();
    const created = await apiFetch<Record<string, unknown>>('/risks/', { method: 'POST', body: { title: 'Seat cut', account_id: 12, mrr: '400' } });
    expect(created).toMatchObject({ title: 'Seat cut', stage: 'open', account_id: 12, account_name: 'Pizza Hut EMEA', companies: [{ id: 7, name: 'Pizza Hut' }] });
    const page = await fetchPipeline('risks', 'search=seat cut');
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({ mrr: 400, owner: { id: 2, name: 'Carl CSM' }, date: { value: null, days: null }, priority: { value: 'medium' } });
  });

  it('creates on the parent a scoped route names, and records those writes', async () => {
    const spy = stubPipelines();
    await apiFetch('/customers/1/opportunities/', { method: 'POST', body: { title: 'On Globex' } });
    await apiFetch('/customers/7/accounts/12/opportunities/', { method: 'POST', body: { title: 'On EMEA' } });
    await apiFetch('/accounts/14/risks/', { method: 'POST', body: { title: 'On APAC' } });
    const parents = async (kind: 'opportunities' | 'risks', search: string) =>
      (await fetchPipeline(kind, `search=${search}`)).results.map((row) => [row.title, row.parent.type, row.parent.id]);
    expect(await parents('opportunities', 'on globex')).toEqual([['On Globex', 'organisation', 1]]);
    expect(await parents('opportunities', 'on emea')).toEqual([['On EMEA', 'account', 12]]);
    expect(await parents('risks', 'on apac')).toEqual([['On APAC', 'account', 14]]);
    expect(recordWrites(spy).map((write) => write.path)).toEqual(['/customers/1/opportunities/', '/customers/7/accounts/12/opportunities/', '/accounts/14/risks/']);
  });

  it('answers the Add picker\'s searches by name, and an organisation\'s accounts', async () => {
    stubPipelines();
    const names = (page: { results: { name: string }[] }) => page.results.map((row) => row.name);
    expect(names(await apiFetch('/customers/?search=GLOB'))).toEqual(['Globex']);
    expect(names(await apiFetch('/accounts/?search=apac'))).toEqual(['Initech APAC']);
    expect(names(await apiFetch('/accounts/'))).toEqual(['Pizza Hut EMEA', 'Initech APAC']);
    expect((await apiFetch<{ name: string }[]>('/customers/7/accounts/')).map((row) => row.name)).toEqual(['Pizza Hut EMEA']);
  });
});
