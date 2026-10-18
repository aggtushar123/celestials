import { describe, expect, it } from 'vitest';
import type { PipelinesContext } from '../../pages/copilot/types';
import {
  fromPipelinesFilters,
  isPipelineFocus,
  pipelineAskQuestion,
  pipelineFocusFor,
  pipelineFocusOf,
  pipelinesContextOf,
  pipelinesLabel,
  pipelinesPath,
  pipelinesViewOf,
} from './askContext';
import { OPPORTUNITIES_KIND } from './pipelineKinds';
import { OPPORTUNITY_ROWS, adminLeft, emeaSeats, pipelineFilterOptions } from './testPipelines';

const names = { kind: 'opportunities', options: pipelineFilterOptions(OPPORTUNITY_ROWS, OPPORTUNITIES_KIND) } as const;
const list = (search: string) => pipelinesContextOf('/pipelines/list', search);
const board = (search: string) => pipelinesContextOf('/pipelines/board', search);

describe('pipelinesViewOf', () => {
  it('reads the List and the Board from the path, and nothing else', () => {
    expect(pipelinesViewOf('/pipelines/list')).toBe('list');
    expect(pipelinesViewOf('/pipelines/board/')).toBe('board');
    expect(pipelinesViewOf('/pipelines')).toBeNull();
    expect(pipelinesViewOf('/pipelines/list/41')).toBeNull();
    expect(pipelinesViewOf('/accounts/list')).toBeNull();
  });
});

describe('pipelinesContextOf', () => {
  it('always sends the kind, and only the set filters in the URL spelling', () => {
    expect(list('')).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {} });
    expect(list('?kind=risks&owner=2&priority=high')).toEqual({
      surface: 'pipelines',
      kind: 'risks',
      view: 'list',
      filters: { owner: '2', priority: 'high' },
    });
    expect(board('?organisation=7,9&account=12&date=30&sort=date')).toEqual({
      surface: 'pipelines',
      kind: 'opportunities',
      view: 'board',
      filters: { organisation: '7,9', account: '12', date: '30', sort: 'date' },
    });
    expect(list('?stage=closed_won,closed_lost&changed=quarter')).toMatchObject({ filters: { stage: 'closed_won,closed_lost', changed: 'quarter' } });
  });

  it("drops what the page doesn't read, the default sort and group, and a stage of the other kind", () => {
    expect(list('?kind=bogus&sort=-mrr&group=stage&cursor=abc&owner=bob&stage=open')).toEqual({
      surface: 'pipelines',
      kind: 'opportunities',
      view: 'list',
      filters: {},
    });
  });

  it("sends the List's None as group=none, never from the Board", () => {
    expect(list('?group=none')).toMatchObject({ filters: { group: 'none' } });
    expect(board('?group=none')).toMatchObject({ filters: {} });
    expect(board('?group=owner&owner=2')).toMatchObject({ filters: { group: 'owner', owner: '2' } });
  });

  it('is null off the two views', () => {
    expect(pipelinesContextOf('/pipelines', '')).toBeNull();
    expect(pipelinesContextOf('/accounts/list', '?owner=2')).toBeNull();
  });

  it('reads filters back through the page parser, for the kind given', () => {
    expect(fromPipelinesFilters('risks', { owner: '2', group: 'none' })).toMatchObject({ kind: 'risks', owner: '2', group: '' });
    expect(fromPipelinesFilters('opportunities', { stage: 'open' }).stage).toEqual([]);
  });
});

describe('pipelinesLabel', () => {
  const context = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2', organisation: '7', priority: 'high', date: '30' } } as const;

  it("names a live question from the page's own filter options", () => {
    expect(pipelinesLabel(context, names)).toBe(
      'Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut · Priority: High · Closes within 30 days',
    );
    expect(pipelinesLabel({ ...context, filters: { account: '12' } }, names)).toBe('Pipelines · Opportunities · Account: Pizza Hut EMEA');
    expect(pipelinesLabel({ ...context, view: 'board', filters: {} }, names)).toBe('Pipelines · Opportunities');
  });

  it("guesses no name before the page's read lands, or from the other kind's read", () => {
    expect(pipelinesLabel(context)).toBe(
      'Pipelines · Opportunities · Owner: User 2 · Organization: Organization 7 · Priority: High · Closes within 30 days',
    );
    expect(pipelinesLabel({ surface: 'pipelines', kind: 'risks', view: 'list', filters: { owner: '2', date: '30' } }, names)).toBe(
      'Pipelines · Risks · Owner: User 2 · Due within 30 days',
    );
  });

  it("shows the server's label once stored, and names the focus from the focus alone", () => {
    expect(pipelinesLabel({ ...context, label: 'Pipelines · Opportunities · Owner: Carl CSM' }, null)).toBe(
      'Pipelines · Opportunities · Owner: Carl CSM',
    );
    expect(pipelinesLabel({ ...context, filters: {}, focus: { kind: 'opportunity', id: 41 } }, names)).toBe(
      'Pipelines · Opportunities · This opportunity',
    );
    expect(
      pipelinesLabel({ surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, focus: { kind: 'risk', id: 71 }, label: 'Pipelines · Risks' }),
    ).toBe('Pipelines · Risks · This risk');
  });

  // Ruling F3: the withheld-turn contract strips the whole context to
  // `null` (never a partial one missing just `filters`), but the label
  // function guards against it anyway rather than trusting that contract
  // at every call site. Without the `filters ?? {}` guard this throws
  // (`Object.entries(undefined)`).
  it('does not throw for a context missing filters', () => {
    const bare = { surface: 'pipelines', kind: 'opportunities', view: 'list' } as unknown as PipelinesContext;
    expect(() => pipelinesLabel(bare)).not.toThrow();
    expect(pipelinesLabel(bare)).toBe('Pipelines · Opportunities');
  });
});

describe('pipelinesPath', () => {
  it('reopens the view with the kind first and the filters in the page order', () => {
    expect(pipelinesPath({ surface: 'pipelines', kind: 'risks', view: 'board', filters: { priority: 'high' }, label: 'x' })).toBe(
      '/pipelines/board?kind=risks&priority=high',
    );
    expect(pipelinesPath({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { group: 'none', owner: '2' }, label: 'x' })).toBe(
      '/pipelines/list?owner=2&group=none',
    );
    expect(pipelinesPath({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, label: 'Pipelines · Opportunities' })).toBe(
      '/pipelines/list',
    );
  });

  it('restores exactly the page a context was built from', () => {
    for (const [view, search] of [
      ['list', '?kind=risks&owner=unassigned&group=none'],
      ['board', '?organisation=7&stage=negotiation&sort=title'],
      ['list', ''],
    ] as const) {
      const context = pipelinesContextOf(`/pipelines/${view}`, search)!;
      const path = pipelinesPath({ ...context, label: 'x' });
      expect(pipelinesContextOf(path.split('?')[0], path.split('?')[1] ?? '')).toEqual(context);
    }
  });

  // Ruling F2: the List's Closing/Due tile writes an explicit `stage` of
  // the view's own open stages alongside `date` (PipelineTiles). On the
  // List those are exactly the default stages, so the server's `canonical`
  // drops that redundant `stage` before storing the origin. A History
  // reopen then starts from a context that never had a `stage` key at all.
  // This proves the reopened page lists the same rows (the List's default
  // *is* the open stages the tile meant); it does not prove the tile's own
  // highlight is restored — `withinOn` needs the explicit stage array to
  // match, which a stage-less URL does not supply. That loss is accepted,
  // not fixed, by this task.
  it('reopens the same rows from a server-canonical context with no stage', () => {
    const canonical = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { date: '30' } } as const;
    const path = pipelinesPath({ ...canonical, label: 'x' });
    expect(path).toBe('/pipelines/list?date=30');
    expect(pipelinesContextOf(path.split('?')[0], path.split('?')[1] ?? '')).toEqual(canonical);
  });
});

describe('the Pipelines focus', () => {
  it('is an opportunity or a risk, of the page kind only', () => {
    expect(pipelineFocusOf(emeaSeats)).toEqual({ kind: 'opportunity', id: 41 });
    expect(pipelineFocusOf(adminLeft)).toEqual({ kind: 'risk', id: 71 });
    expect(isPipelineFocus({ kind: 'risk', id: 71 })).toBe(true);
    expect(isPipelineFocus({ kind: 'email', id: 141 })).toBe(false);
    expect(isPipelineFocus({ kind: 'companies', ids: [7] })).toBe(false);
    expect(isPipelineFocus(null)).toBe(false);
    expect(pipelineFocusFor({ kind: 'risk', id: 71 }, 'risks')).toEqual({ kind: 'risk', id: 71 });
    expect(pipelineFocusFor({ kind: 'opportunity', id: 41 }, 'risks')).toBeNull();
    expect(pipelineFocusFor({ kind: 'call', id: 112 }, 'opportunities')).toBeNull();
  });

  it("prefills a question in the item's own word", () => {
    expect(pipelineAskQuestion({ kind: 'opportunity', id: 41 })).toBe('What should I know about this opportunity?');
    expect(pipelineAskQuestion({ kind: 'risk', id: 71 })).toBe('What should I know about this risk?');
  });
});
