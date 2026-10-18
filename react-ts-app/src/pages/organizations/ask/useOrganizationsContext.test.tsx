import { describe, expect, it } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { parseOrganizationsView, useOrganizationsContext } from './useOrganizationsContext';

const at = (url: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };

describe('useOrganizationsContext', () => {
  it.each([
    ['/organizations/list', { view: 'list', filters: {} }],
    [
      '/organizations/list?owner=2&lifecycle=live,renewal&sort=name&include_churned=1',
      { view: 'list', filters: { owner: '2', lifecycle: 'live,renewal', include_churned: '1', sort: 'name' } },
    ],
    // An explicit "None" is sent as '', never omitted.
    ['/organizations/list?group=none&ids=3,7', { view: 'list', filters: { ids: '3,7', group: '' } }],
    // The List's own default (health) and the Board's (lifecycle) are omitted, never sent as themselves.
    ['/organizations/board', { view: 'board', filters: {} }],
    // The Board never asks ungrouped: group=none there reads back as lifecycle, its own default, so it too is omitted.
    ['/organizations/board?group=none&owner=unassigned', { view: 'board', filters: { owner: 'unassigned' } }],
    ['/organizations/board?group=owner&search=pizza', { view: 'board', filters: { search: 'pizza', group: 'owner' } }],
  ])('%s', (url, expected) => {
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at(url) });
    expect(result.current).toEqual({ surface: 'organizations', focus: null, ...expected });
  });

  it.each([
    ['/organizations/7', { organization: 7, account: null }],
    ['/organizations/7?account=31', { organization: 7, account: 31 }],
    ['/organizations/7?account=31&tab=people&q=renewal', { organization: 7, account: 31 }],
    // "Organization" (records on the organisation itself) and the whole-organisation tabs carry no account.
    ['/organizations/7?account=none', { organization: 7, account: null }],
    ['/organizations/7?account=31&tab=details', { organization: 7, account: null }],
  ])("%s: an organisation's page", (url, expected) => {
    expect(parseOrganizationsView(url.split('?')[0])).toBe('detail');
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at(url) });
    expect(result.current).toEqual({ surface: 'organizations', view: 'detail', focus: null, ...expected });
  });

  it('has no context off the list, the board and an organisation', () => {
    for (const path of ['/organizations', '/organizations/new', '/dashboard/overview']) expect(parseOrganizationsView(path)).toBeNull();
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at('/organizations/new') });
    expect(result.current).toBeNull();
  });

  it("holds the same context object across a story filter or search keystroke, on an organisation's page", async () => {
    const seen: unknown[] = [];
    function Harness() {
      const context = useOrganizationsContext();
      useEffect(() => {
        seen.push(context);
      });
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/organizations/7?account=31&q=renewal')}>
          search
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/organizations/7?account=31']}>
        <Harness />
      </MemoryRouter>,
    );
    const before = seen.at(-1);
    await userEvent.click(screen.getByRole('button', { name: 'search' }));
    expect(seen.at(-1)).toBe(before);
  });
});
