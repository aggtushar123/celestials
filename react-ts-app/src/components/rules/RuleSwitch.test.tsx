import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestsOf } from '../../features/surveys/testSurveys';
import { ORPHAN, RENEWAL_WATCH, RULES, SAVE_RULE, stubRules, WELCOME_TASKS, type StoredRule } from '../../features/rules/testRules';
import type { RuleRow } from '../../features/rules/ruleTypes';
import { RuleSwitch } from './RuleSwitch';

const asRow = (rule: StoredRule): RuleRow => ({ ...rule, last_run: null });

function Harness({ start }: { start: RuleRow }) {
  const [rule, setRule] = useState(start);
  return <RuleSwitch rule={rule} onChange={setRule} />;
}

describe('RuleSwitch (spec §2.1, §2.3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks before turning a rule on, saying what it will do, then saves it on', async () => {
    const { spy } = stubRules();
    render(<Harness start={asRow(WELCOME_TASKS)} />);
    const toggle = screen.getByRole('switch', { name: 'Run Welcome tasks every night' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveTextContent('Off');
    await userEvent.click(toggle);
    expect(screen.getByRole('heading', { name: 'Turn on Welcome tasks?' })).toBeInTheDocument();
    expect(screen.getByText('From tonight it runs once a night on Champions and will create a task.')).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(toggle).toHaveTextContent('On');
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)[0].body).toEqual({ is_active: true });
  });

  it('turns a rule off at once, without asking', async () => {
    const { spy } = stubRules();
    render(<Harness start={asRow(RENEWAL_WATCH)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Run Renewal watch every night' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByRole('heading', { name: /Turn on/ })).toBeNull();
    expect(requestsOf(spy, 'PATCH', /^\/rules\/5\/$/)[0].body).toEqual({ is_active: false });
  });

  it("shows the server's refusal inside the confirm, and the rule stays off", async () => {
    stubRules();
    render(<Harness start={asRow(ORPHAN)} />);
    const toggle = screen.getByRole('switch', { name: 'Run Old churn watch every night' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('Choose a segment.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows a failed switch-off under the switch', async () => {
    stubRules({ patch: () => ({ status: 500, body: {} }) });
    render(<Harness start={asRow(RENEWAL_WATCH)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Run Renewal watch every night' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not switch this rule. Try again.');
    expect(screen.getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the 400 refusal inside the confirm when turning on fails because its plan action no longer validates (plans spec §1.8)', async () => {
    stubRules({ rules: [...RULES, SAVE_RULE] });
    render(<Harness start={asRow(SAVE_RULE)} />);
    const toggle = screen.getByRole('switch', { name: 'Run Save at-risk renewals every night' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('Choose a template you can use.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
