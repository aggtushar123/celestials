import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES_KIND, RISKS_KIND } from './pipelineKinds';
import {
  boardPipelineParams,
  defaultStages,
  hasPipelineFilters,
  parsePipelineParams,
  pipelineApiQuery,
  pipelineUrlSearch,
  withKind,
} from './pipelineParams';

const parse = (query: string) => parsePipelineParams(new URLSearchParams(query));

describe('the Pipelines URL state', () => {
  it('defaults to opportunities, open stages, -mrr and grouping by stage', () => {
    expect(parse('')).toEqual({
      kind: 'opportunities',
      search: '',
      organisation: [],
      account: [],
      owner: '',
      stage: [],
      priority: [],
      department: [],
      date: '',
      changed: '',
      ids: [],
      sort: '-mrr',
      group: 'stage',
    });
    expect(pipelineUrlSearch(parse('')).toString()).toBe('');
  });

  it('keeps what it understands and drops the rest, as the backend does', () => {
    const p = parse(
      'kind=risks&owner=outside&stage=open,closed_won,mitigated&priority=high,urgent&department=cs,none,bogus&date=overdue&changed=quarter&organisation=7,x&account=12&sort=-date&group=month&ids=4,5',
    );
    expect(p).toMatchObject({
      kind: 'risks',
      owner: 'outside',
      stage: ['open', 'mitigated'],
      priority: ['high'],
      department: ['cs', 'none'],
      date: 'overdue',
      changed: 'quarter',
      organisation: ['7'],
      account: ['12'],
      sort: '-date',
      group: 'month',
      ids: [4, 5],
    });
    expect(parse('kind=deals&sort=-arr&group=health&date=45&owner=me')).toMatchObject({
      kind: 'opportunities',
      sort: '-mrr',
      group: 'stage',
      date: '',
      owner: '',
    });
    expect(parse('group=none').group).toBe('');
  });

  it('writes the URL with the defaults left out', () => {
    const p = { ...parse(''), kind: 'risks' as const, owner: 'unassigned', group: '' as const, sort: 'title' };
    expect(pipelineUrlSearch(p).toString()).toBe('kind=risks&owner=unassigned&sort=title&group=none');
  });

  it("sends the view's stages: none on the List (the server's open default), every one on the Board", () => {
    expect(defaultStages(OPPORTUNITIES_KIND, 'list')).toEqual(OPPORTUNITIES_KIND.openStages);
    expect(defaultStages(RISKS_KIND, 'board')).toEqual(['open', 'mitigated', 'realised', 'abandoned']);
    const list = new URLSearchParams(pipelineApiQuery(parse('owner=2'), 'list', { limit: '1' }));
    expect(list.get('stage')).toBeNull();
    expect(list.get('sort')).toBe('-mrr');
    expect(list.get('group')).toBe('stage');
    expect(list.get('limit')).toBe('1');
    expect(list.get('kind')).toBeNull();
    const board = new URLSearchParams(pipelineApiQuery(parse('kind=risks'), 'board'));
    expect(board.get('stage')).toBe('open,mitigated,realised,abandoned');
    // An explicit stage filter passes straight through on the Board too,
    // rather than being replaced by the view's default (every stage).
    expect(new URLSearchParams(pipelineApiQuery(parse('stage=discovery'), 'board')).get('stage')).toBe('discovery');
  });

  it('knows when a filter is on, and gives the Board a group', () => {
    expect(hasPipelineFilters(parse('kind=risks&sort=title&group=owner'))).toBe(false);
    expect(hasPipelineFilters(parse('date=none'))).toBe(true);
    expect(boardPipelineParams(parse('group=none')).group).toBe('stage');
    const grouped = parse('group=owner');
    expect(boardPipelineParams(grouped)).toBe(grouped);
  });

  it('switches kind keeping the shared filters and dropping stage, changed and ids', () => {
    const next = withKind(new URLSearchParams('owner=2&stage=negotiation&changed=quarter&ids=41&group=month&search=emea'), 'risks');
    expect(next.toString()).toBe('owner=2&group=month&search=emea&kind=risks');
    expect(withKind(new URLSearchParams('kind=risks&owner=2'), 'opportunities').toString()).toBe('owner=2');
  });

  it("carries a Closing / Due tile's open-stage narrowing over to the other kind, and only that one", () => {
    const opportunityOpen = OPPORTUNITIES_KIND.openStages.join(',');
    expect(withKind(new URLSearchParams(`stage=${opportunityOpen}&date=30`), 'risks').toString()).toBe('date=30&kind=risks&stage=open');
    expect(withKind(new URLSearchParams('kind=risks&stage=open&date=90'), 'opportunities').get('stage')).toBe(opportunityOpen);
    // Not a tile's narrowing: a chosen stage, or a window the tile never writes.
    expect(withKind(new URLSearchParams('stage=negotiation&date=30'), 'risks').has('stage')).toBe(false);
    expect(withKind(new URLSearchParams(`stage=${opportunityOpen}&date=180`), 'risks').has('stage')).toBe(false);
    expect(withKind(new URLSearchParams(`stage=${opportunityOpen}`), 'risks').has('stage')).toBe(false);
  });

  it('never parses a cursor into the params, so rewriting the URL from them always drops one', () => {
    expect(parse('cursor=40')).not.toHaveProperty('cursor');
    // A stale cursor sitting in the URL never survives a rewrite built from
    // the parsed params (controller ruling 1: a cursor never outlives the
    // query it paged).
    expect(pipelineUrlSearch(parse('cursor=40&owner=2')).toString()).toBe('owner=2');
  });
});
