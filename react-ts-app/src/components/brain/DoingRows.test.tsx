import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DO } from '../../features/brain/doingText';
import {
  ALICE_PLAN,
  CARL_DOING_RULE,
  CARL_PLAN,
  DANA_DOING_RULE,
  DANA_PLAN,
  MY_DOING_RULE,
} from '../../features/brain/testDoingFixtures';
import { DoingPlanRow } from './DoingPlanRow';
import { DoingRuleRow } from './DoingRuleRow';

const inList = (row: ReactNode) => render(<MemoryRouter><ul>{row}</ul></MemoryRouter>);
const part = (name: string) => screen.getByRole('listitem').querySelector(`[data-part="${name}"]`);

describe('DoingPlanRow (spec §2.1, Decision 4)', () => {
  it('links the plan and its record, and reads status, milestones, date, owner and then → now', () => {
    inList(<DoingPlanRow plan={CARL_PLAN} currency="USD" />);
    expect(screen.getByRole('link', { name: 'Renewal save play' })).toHaveAttribute('href', '/projects/8');
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/6');
    expect(part('meta')).toHaveTextContent('At risk · 1 of 4 milestones · by 1 Nov 2026 · Carl CSM');
    // health_score is 0-10, one decimal (controller override, testDoingFixtures.ts).
    expect(part('figures')).toHaveTextContent('Health 4.8 → 5.5 · ARR $69.6K → $69.6K');
  });

  it('says a plan started before starting figures were kept, and links an account', () => {
    inList(<DoingPlanRow plan={ALICE_PLAN} currency="USD" />);
    expect(part('figures')).toHaveTextContent(DO.BEFORE_FIGURES);
    expect(screen.getByRole('link', { name: 'Uber EMEA' })).toHaveAttribute('href', '/accounts/12');
  });

  it('reads a done plan with its target date (minor fix, final review: target_date is never null)', () => {
    inList(<DoingPlanRow plan={DANA_PLAN} currency="USD" />);
    expect(part('meta')).toHaveTextContent('Done · 2 of 2 milestones · by 15 Sep 2026 · Dana CSM');
    expect(part('figures')).toHaveTextContent('Health 6.2 → 7.1 · ARR $40K → $44K');
  });
});

describe('DoingRuleRow (spec §2.1, Decision 5)', () => {
  it('links my own rule and gives its full counts', () => {
    inList(<DoingRuleRow rule={MY_DOING_RULE} />);
    expect(screen.getByRole('link', { name: 'Detractor follow-up' })).toHaveAttribute('href', '/scenarios/rules/3');
    expect(part('meta')).toHaveTextContent('Detractors · On');
    expect(part('run')).toHaveTextContent('Last run 5 Oct: fired 4 · matched 12 · skipped 2');
  });

  it('names someone else’s rule without a link, says why it paused, and gives fired only', () => {
    inList(<DoingRuleRow rule={CARL_DOING_RULE} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(within(screen.getByRole('listitem')).getByText('Renewal nudge')).toBeInTheDocument();
    // paused_message is the server's own sentence (testDoingFixtures.ts): "Its segment was deleted."
    expect(part('meta')).toHaveTextContent('Renewals in 90 days · Paused: Its segment was deleted');
    expect(part('run')).toHaveTextContent('Last run 4 Oct: fired 1');
    expect(part('run')).not.toHaveTextContent('matched');
  });

  it('reads a rule with no segment that has not run yet', () => {
    inList(<DoingRuleRow rule={DANA_DOING_RULE} />);
    expect(part('meta')).toHaveTextContent('No segment · On');
    expect(part('run')).toHaveTextContent(DO.NOT_RUN);
  });

  it('sets the last run date in tabular figures, like a plan’s target date (controller item b)', () => {
    inList(<DoingRuleRow rule={MY_DOING_RULE} />);
    expect(screen.getByText('5 Oct')).toHaveClass('tabular-nums');
  });
});
