import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import type { RuleReview } from '../features/rules/ruleTypes';
import { stubRules } from '../features/rules/testRules';
import { requestsOf } from '../features/surveys/testSurveys';
import { REVIEW } from '../features/work/testFeedFixtures';
import { stubFeed } from '../features/work/testFeed';
import { renderRules } from '../pages/rules/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the segment's page,
// the Rules pages, My work, the send page, the store and the
// router. Only fetch is stubbed, by a stateful stub in the backend's
// contract shapes; its `runNight` stands in for run_health_maintenance
// (spec §4: build a rule → the stub's nightly run → a review → approve → a
// survey is created).
const where = () => screen.getByTestId('where').textContent;

describe('Rules', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('builds a rule from a segment, tests it, turns it on; the night makes a review; approving creates the survey', { timeout: 30000 }, async () => {
    const { spy, runNight } = stubRules();

    // 1. Automate on the owner's segment: the builder opens over it, the segment chosen.
    const team = renderRules('/segments/7', { nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Automate' }));
    const modal = await screen.findByRole('dialog', { name: 'New rule' });
    expect(where()).toBe('/segments/7/rule');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));

    // 2. Build: CSAT below 60 → notify me, and a survey that waits for review.
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Unhappy renewals');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'crossed');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Score' }), 'csat');
    await userEvent.type(within(modal).getByRole('spinbutton', { name: 'Value' }), '60');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When CSAT falls below 60 in Renewal risk → notify me, survey');

    // 3. Test: the server's dry run, worded as an estimate.
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    expect(await within(modal).findByText(/would match if tonight's run happened now: Globex, Initech, Pizza Hut\./)).toBeInTheDocument();

    // 4. Save (off); the rule's page opens under "‹ Scenarios", with no nights yet.
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Unhappy renewals' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Scenarios' })).toHaveAttribute('href', '/scenarios');
    expect(await screen.findByText('No nights yet')).toBeInTheDocument();

    // 5. Turn it on, after the confirm.
    await userEvent.click(screen.getByRole('switch', { name: 'Run Unhappy renewals every night' }));
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Run Unhappy renewals every night' })).toHaveAttribute('aria-checked', 'true'));
    team.unmount();

    // 6. The night runs: two organisations fire, and the survey waits for review.
    expect(runNight(100)).toMatchObject({ fired: 2, review: { status: 'waiting' } });

    // 7. My work holds it, with the server's counts and the review's own
    //    payload (a rule_review on My work always carries it). stubFeed answers
    //    the feed; the review's own calls pass through to the rules stub.
    const waiting = (await (await fetch('http://localhost/api/v1/rules/reviews/')).json()) as RuleReview[];
    const review300 = waiting.find((one) => one.id === 300);
    if (!review300) throw new Error('the rules stub holds no review 300');
    stubFeed({
      decide: [
        {
          ...REVIEW,
          id: 300,
          key: 'rule_review:300',
          title: 'Survey from Unhappy renewals',
          detail: { rule_id: 100, rule_name: 'Unhappy renewals', review_kind: 'survey', counts: { people: 3, records: 2 }, review: review300 },
        },
      ],
      decisions: 'pass',
      passThrough: spy,
    });
    renderRules('/work/mine?kind=approval', { nav: true, workPage: true });
    const review = await waitFor(() => {
      const found = document.querySelector('[data-item="rule_review:300"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(review.querySelector('[data-part="counts"]')).toHaveTextContent('3 people across 2 records');

    // 8. Approve: the survey is created; the toast opens it. A review approved
    //    on My work stays there (delivery 1 Decision 8).
    await userEvent.click(within(review).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('link', { name: 'Open survey' })).toHaveAttribute('href', '/surveys/31');
    expect(requestsOf(spy, 'POST', /^\/rules\/reviews\/300\/approve\/$/)).toHaveLength(1);
  });
});
