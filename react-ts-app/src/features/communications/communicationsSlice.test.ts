import { describe, expect, it } from 'vitest';
import reducer, {
  buildQuery,
  resolveSelected,
  selectRow,
  setMode,
  setScope,
  setSearch,
  toggleKind,
  waitingTone,
} from './communicationsSlice';
import type { CommunicationRow } from './communicationsSlice';

function row(id: string, waiting = 1): CommunicationRow {
  return {
    id,
    kind: 'email',
    who: 'Dana',
    detail: '',
    subject: 'Subject',
    snippet: 'Snippet',
    preview: 'Preview',
    sentiment: 'neutral',
    waiting_since: '2026-09-09',
    waiting_days: waiting,
    account: { id: 1, name: 'Pizza Hut', type: 'customer' },
    context: null,
    action: 'reply',
    external_url: '',
  };
}

const initial = reducer(undefined, { type: '@@INIT' });

describe('buildQuery', () => {
  it('asks for the queue by default, with no parameters at all', () => {
    expect(buildQuery({ scope: 'mine', mode: 'needs', kind: null, search: '' })).toBe(
      '/communications/'
    );
  });

  it('carries every chosen filter', () => {
    const url = buildQuery({ scope: 'team', mode: 'everything', kind: 'ticket', search: ' sso ' });
    expect(url).toContain('scope=team');
    expect(url).toContain('needs=false');
    expect(url).toContain('kind=ticket');
    // Trimmed, so a stray space is not a different search.
    expect(url).toContain('q=sso');
  });
});

describe('the three controls', () => {
  it('clicking the chosen tile again clears it, so one control both narrows and widens', () => {
    const narrowed = reducer(initial, toggleKind('question'));
    expect(narrowed.kind).toBe('question');
    expect(reducer(narrowed, toggleKind('question')).kind).toBeNull();
    expect(reducer(narrowed, toggleKind('call')).kind).toBe('call');
  });

  it('changing any filter drops the selection, since it may point at a row that has gone', () => {
    const selected = reducer(initial, selectRow('email:1'));
    expect(selected.selectedId).toBe('email:1');

    expect(reducer(selected, toggleKind('ticket')).selectedId).toBeNull();
    expect(reducer(selected, setScope('team')).selectedId).toBeNull();
    expect(reducer(selected, setMode('everything')).selectedId).toBeNull();
    expect(reducer(selected, setSearch('renewal')).selectedId).toBeNull();
  });
});

describe('resolveSelected', () => {
  it('falls back to the first row rather than showing an empty pane beside a full list', () => {
    const rows = [row('email:1'), row('email:2')];
    expect(resolveSelected(rows, null)?.id).toBe('email:1');
    expect(resolveSelected(rows, 'email:2')?.id).toBe('email:2');
    // A selection the current filter removed is stale, not a reason to show nothing.
    expect(resolveSelected(rows, 'ticket:99')?.id).toBe('email:1');
  });

  it('has nothing to show when the queue is empty', () => {
    expect(resolveSelected([], 'email:1')).toBeNull();
  });
});

describe('waitingTone', () => {
  it('turns amber at three days and red at seven, on the boundary', () => {
    expect(waitingTone(0)).toBe('muted');
    expect(waitingTone(2)).toBe('muted');
    expect(waitingTone(3)).toBe('warning');
    expect(waitingTone(6)).toBe('warning');
    expect(waitingTone(7)).toBe('danger');
    expect(waitingTone(40)).toBe('danger');
  });
});
