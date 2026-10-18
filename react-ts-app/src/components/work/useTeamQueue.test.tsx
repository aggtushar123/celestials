import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FeedChip } from '../../features/work/feed';
import { stubFeed } from '../../features/work/testFeed';
import { TEAM_ITEMS, TEAM_REC } from '../../features/work/testFeedFixtures';
import { RECOMMENDATIONS } from '../../features/work/testWorkFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { B_DEPT, MESSAGE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { useTeamQueue } from './useTeamQueue';

describe('useTeamQueue', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the scope, pages a group, and reads again on reload', async () => {
    const { spy } = stubFeed({ team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC], pageSize: 1 });
    const refused = vi.fn(() => false);
    const { result } = renderHook(() => useTeamQueue('team', null, refused));
    await waitFor(() => expect(result.current.data?.scope).toBe('team'));
    const decide = result.current.data!.groups[0];
    await act(() => result.current.showMore('decide', decide.next as string));
    expect(result.current.data!.groups[0].items).toHaveLength(2);
    act(() => result.current.reload());
    await waitFor(() => expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/feed/team/?scope=team')).length).toBeGreaterThanOrEqual(2));
    expect(refused).not.toHaveBeenCalled();
  });

  it('hands a 403 to the scope and shows no error of its own', async () => {
    stubFeed({ offered: ['me', 'team'] });
    const refused = vi.fn(() => true);
    const { result } = renderHook(() => useTeamQueue('company', null, refused));
    await waitFor(() => expect(refused).toHaveBeenCalled());
    expect(result.current.error).toBeNull();
  });

  it('reads one kind when a chip is chosen, and again when it changes', async () => {
    const { spy } = stubFeed({ team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    const { result, rerender } = renderHook(({ chip }) => useTeamQueue('team', chip, () => false), { initialProps: { chip: 'bundle' as FeedChip | null } });
    await waitFor(() => expect(result.current.data?.groups[0].items.map((i) => i.kind)).toEqual(['bundle']));
    rerender({ chip: 'question' });
    await waitFor(() => expect(result.current.data?.groups[0].items.map((i) => i.kind)).toEqual(['question']));
    const urls = spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/work/feed/team/'));
    expect(urls.map((url) => new URL(url, 'http://localhost').search)).toEqual(['?scope=team&kind=bundle', '?scope=team&kind=question']);
  });

  it('reads a department scope whose key holds a colon (agent bundles D2 §4.6)', async () => {
    const { spy } = stubBundles({ bundles: MESSAGE_BUNDLES, departments: [{ key: 'cs', label: 'Customer Success' }] });
    const { result } = renderHook(() => useTeamQueue('department:cs', null, () => false));
    await waitFor(() => expect(result.current.data?.groups[0].items.map((i) => i.key)).toEqual([`bundle:${B_DEPT.id}`]));
    expect(spy.mock.calls.some(([url]) => String(url).includes('scope=department%3Acs'))).toBe(true);
  });
});
