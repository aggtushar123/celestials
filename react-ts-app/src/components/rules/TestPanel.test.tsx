import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestsOf } from '../../features/surveys/testSurveys';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { NOTIFY_ME_ACTION, stubRules } from '../../features/rules/testRules';
import type { RuleTestRequest } from '../../features/rules/ruleTypes';
import { TestPanel } from './TestPanel';

const REQUEST: RuleTestRequest = { segment: 7, trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null, actions: [NOTIFY_ME_ACTION], cooldown_days: 30 };

function Harness({ check = () => true, onRefused = vi.fn(), crossed = false }: { check?: () => boolean; onRefused?: (errors: RuleErrors) => void; crossed?: boolean }) {
  const [request, setRequest] = useState<RuleTestRequest | null>(REQUEST);
  return (
    <>
      <TestPanel request={request} blocker={request ? null : 'Choose a segment to test.'} kind="customer" cooldownDays={30} crossed={crossed} onCheck={check} onRefused={onRefused} />
      <button type="button" onClick={() => setRequest({ ...REQUEST, cooldown_days: 14 })}>
        Change the rule
      </button>
      <button type="button" onClick={() => setRequest(null)}>
        Clear the segment
      </button>
    </>
  );
}

describe('TestPanel (spec §2.2, Test this rule)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server's dry run on click only, and words the answer as an estimate", async () => {
    const { spy } = stubRules();
    render(<Harness />);
    expect(screen.getByText('Who it would act on, from your segment as it is now. Nothing is changed.')).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    const matches = await screen.findByText(/would match if tonight's run happened now/);
    expect(matches.closest('[data-part="matches"]')).toHaveTextContent("3 organisations would match if tonight's run happened now: Globex, Initech, Pizza Hut.");
    expect(document.querySelector('[data-part="matches"] .tabular-nums')).toHaveTextContent('3');
    expect(screen.getByText(/skipped \(acted on in the last 30 days\)/)).toBeInTheDocument();
    expect(screen.getByText(/in the segment you can't open isn't included/)).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)[0].body).toEqual(REQUEST);
  });

  it('adds the first-night note for a crossing rule', async () => {
    stubRules();
    render(<Harness crossed />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    expect(await screen.findByText(/A score rule never acts on its first night/)).toBeInTheDocument();
  });

  it('drops the answer once the rule changes', async () => {
    stubRules();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    await screen.findByText(/would match/);
    await userEvent.click(screen.getByRole('button', { name: 'Change the rule' }));
    expect(screen.queryByText(/would match/)).toBeNull();
  });

  it('does not ask when the client check fails, and is off with its reason without a segment', async () => {
    const { spy } = stubRules();
    render(<Harness check={() => false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clear the segment' }));
    expect(screen.getByRole('button', { name: 'Test this rule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test this rule' })).toHaveAccessibleDescription('Choose a segment to test.');
  });

  it('applies only its latest answer: a slow older response never overwrites a newer one', async () => {
    const ANSWERS = [
      { count: 99, records: [], hidden_count: 0, skipped: { cooldown: 0, cap: 0, not_visible: 0 } },
      {
        count: 3,
        records: [{ kind: 'customer', id: 1, name: 'Globex' }, { kind: 'customer', id: 2, name: 'Initech' }, { kind: 'customer', id: 7, name: 'Pizza Hut' }],
        hidden_count: 1,
        skipped: { cooldown: 1, cap: 0, not_visible: 1 },
      },
    ];
    const resolvers: Array<() => void> = [];
    let calls = 0;
    const spy = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/rules/test/')) return Promise.reject(new Error(`unexpected fetch ${url.pathname}`));
      const n = calls;
      calls += 1;
      return new Promise((resolve) => {
        resolvers[n] = () => resolve({ ok: true, status: 200, json: async () => ANSWERS[n], blob: async () => new Blob([JSON.stringify(ANSWERS[n])]) });
      });
    });
    vi.stubGlobal('fetch', spy);

    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' })); // dispatches A (slow)
    await userEvent.click(screen.getByRole('button', { name: 'Change the rule' })); // draft changes while A is pending
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' })); // dispatches B
    resolvers[1](); // B (the second, fast request) resolves first
    expect(await screen.findByText(/would match/)).toHaveTextContent("3 organisations would match if tonight's run happened now: Globex, Initech, Pizza Hut.");
    resolvers[0](); // A (the first, slow request) resolves late — must not revert B
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(/would match/)).toHaveTextContent("3 organisations would match if tonight's run happened now: Globex, Initech, Pizza Hut.");
    expect(screen.queryByText(/99/)).toBeNull();
  });

  it("hands a 400 back as field errors, and shows anything else as the panel's error", async () => {
    const onRefused = vi.fn();
    let calls = 0;
    stubRules({
      test: () => {
        calls += 1;
        return calls === 1 ? { status: 400, body: { threshold: ['Choose a value from 0 to 100.'] } } : { status: 500, body: { detail: 'Tests are down.' } };
      },
    });
    render(<Harness onRefused={onRefused} />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    await waitFor(() => expect(onRefused).toHaveBeenCalledWith({ field: { threshold: 'Choose a value from 0 to 100.' }, action: [] }));
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tests are down.');
  });
});
