import { describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { DetailTabPanels } from './DetailPage';
import { useDetailVersions, useVisitedTabs } from './useDetailPage';

// Unit tier: the shell both detail pages share (the organisation page's and
// the account page's integration tests cover it in place).

const TABS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }] as const;
type Key = (typeof TABS)[number]['key'];

function Panels() {
  const [active, setActive] = useState<Key>('a');
  const visited = useVisitedTabs(active);
  return (
    <>
      {TABS.map(({ key }) => (
        <button key={key} type="button" onClick={() => setActive(key)}>
          open {key}
        </button>
      ))}
      <DetailTabPanels idBase="t" tabs={TABS} active={active} visited={visited}>
        {(key) => <p>content {key}</p>}
      </DetailTabPanels>
    </>
  );
}

describe('DetailTabPanels with useVisitedTabs', () => {
  it('mounts only the active tab at first, labelled by its tab', () => {
    render(<Panels />);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 't-panel-a');
    expect(panel).toHaveAttribute('aria-labelledby', 't-tab-a');
    expect(panel).toHaveTextContent('content a');
    expect(screen.queryByText('content b')).toBeNull();
  });

  it('keeps a visited tab mounted but hidden once another opens', () => {
    render(<Panels />);
    act(() => screen.getByRole('button', { name: 'open b' }).click());
    expect(screen.getByText('content a').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('content b');
    expect(screen.queryByText('content c')).toBeNull();
  });
});

describe('useDetailVersions', () => {
  it('onAdded bumps the story for any record, and the calls list only for a call', () => {
    const { result } = renderHook(() => useDetailVersions());
    act(() => result.current.onAdded('task'));
    expect([result.current.storyVersion, result.current.callsVersion]).toEqual([1, 0]);
    act(() => result.current.onAdded('call'));
    expect([result.current.storyVersion, result.current.callsVersion]).toEqual([2, 1]);
    expect(result.current.version).toBe(0);
  });

  it('reloadHeader bumps only the row version', () => {
    const { result } = renderHook(() => useDetailVersions());
    act(() => result.current.reloadHeader());
    expect([result.current.version, result.current.storyVersion, result.current.callsVersion]).toEqual([1, 0, 0]);
  });
});
