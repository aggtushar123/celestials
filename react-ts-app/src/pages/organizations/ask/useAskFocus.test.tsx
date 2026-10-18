import { memo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import type { AskSurface } from '../../dashboard/ask/context';
import { useAsk } from '../../dashboard/ask/useAsk';
import { useAskFocusOnOpen } from './useAskFocus';

const surface: AskSurface = {
  name: 'organizations',
  context: { surface: 'organizations', view: 'list', filters: {}, focus: null },
  chipLabel: () => 'Organizations',
};

const renders = vi.fn();
// Stands in for a List row: reads only useAskFocusOnOpen, never the rest of
// AskState. Memoised so a re-render only happens if something it actually
// subscribes to (props, or a context it reads) changes.
const Row = memo(function Row({ openId }: { openId: number | null }) {
  renders();
  useAskFocusOnOpen(openId);
  return <p>row</p>;
});

function AskNow() {
  const ask = useAsk()!;
  return (
    <>
      <p data-testid="title">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.ask('Who renews first?', null)}>
        Ask now
      </button>
    </>
  );
}

describe('useAskFocusOnOpen', () => {
  it("reads only the stable focusOn, so a send never re-renders a caller that only opens an account", async () => {
    stubCopilot();
    renders.mockClear();
    render(
      <MemoryRouter initialEntries={['/organizations/list']}>
        <AskProvider surface={surface}>
          <Row openId={7} />
          <AskNow />
        </AskProvider>
      </MemoryRouter>,
    );
    expect(renders).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Ask now' }));
    // The answer lands: AskState's `thread` and `conversation` both change,
    // once for pending and once for the answer.
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Chat'));
    // Yet the row, which only reads focusOn, never re-rendered.
    expect(renders).toHaveBeenCalledTimes(1);
  });
});
