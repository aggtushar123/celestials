// Pinned to a non-UTC, non-DST zone (IST, UTC+5:30), the same way
// storyDays.test.ts does, and kept in its own file for the same reason: set
// before any Date is used (Node re-reads process.env.TZ on every local-time
// computation), and isolated so it can't shift any other TaskSheet test that
// assumes the runner's own time zone.
process.env.TZ = 'Asia/Kolkata';

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { stubWork } from '../../features/work/testWork';
import { renderPage } from '../../pages/work/testPages';
import { WORK_TASKS } from '../../features/work/testWorkFixtures';

describe("the task panel's Created date (pinned to IST, UTC+5:30)", () => {
  it("reads a late-UTC created_at in the reader's own time zone, not the UTC calendar day", async () => {
    // 2026-10-01T23:30Z is 2026-10-02T05:00 IST: a UTC timestamp that
    // crosses midnight once read in the reader's zone. The old version of
    // this test built its expectation with localDay(new Date(late)), the
    // very function TaskFacts uses to render the date, so it passed
    // whether or not that conversion was right, on any runner's zone
    // (tautological, and UTC CI never even exercised the conversion since
    // this timestamp doesn't cross midnight in UTC). Asserting the
    // concrete, independently-computed date catches a regression a UTC
    // runner alone would miss.
    const late = '2026-10-01T23:30:00.000000Z';
    stubWork({ tasks: WORK_TASKS.map((task) => (task.id === 41 ? { ...task, created_at: late } : task)) });
    renderPage(<p>Today</p>, '/work/today?task=41');
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(within(panel).getByText('Created').nextElementSibling).toHaveTextContent('2 Oct 2026 by Mona Manager');
  });
});
