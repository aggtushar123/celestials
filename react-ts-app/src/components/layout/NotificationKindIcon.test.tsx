import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { NotificationKindIcon } from './NotificationKindIcon';

describe('NotificationKindIcon', () => {
  it('gives campaign_sent an icon, hidden from screen readers (campaigns spec §2.5)', () => {
    const { container } = render(<NotificationKindIcon kind="campaign_sent" />);
    expect(container.querySelector('[data-kind-icon="campaign_sent"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves the older kinds without one', () => {
    const { container } = render(<NotificationKindIcon kind="rule_fired" />);
    expect(container.querySelector('[data-kind-icon]')).toBeNull();
  });

  it('gives task_assigned the task icon (Work spec §1.3)', () => {
    const { container } = render(<NotificationKindIcon kind="task_assigned" />);
    expect(container.querySelector('[data-kind-icon="task_assigned"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives recommendations_waiting the lightbulb (Work spec §2.2; Decision 13)', () => {
    const { container } = render(<NotificationKindIcon kind="recommendations_waiting" />);
    expect(container.querySelector('[data-kind-icon="recommendations_waiting"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws Undo2 for agent_action_undone', () => {
    const { container } = render(<NotificationKindIcon kind="agent_action_undone" />);
    expect(container.querySelector('[data-kind-icon="agent_action_undone"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives task_overdue the alarm clock and task_escalated the warning (Work spec §3.3; delivery 3 Decision 8)', () => {
    for (const kind of ['task_overdue', 'task_escalated'] as const) {
      const { container } = render(<NotificationKindIcon kind={kind} />);
      expect(container.querySelector(`[data-kind-icon="${kind}"]`)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('draws FilePen for agent_draft_ready (Agents delivery 2, Decision 14)', () => {
    const { container } = render(<NotificationKindIcon kind="agent_draft_ready" />);
    expect(container.querySelector('[data-kind-icon="agent_draft_ready"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws MailWarning for mail_action_failed (two-way Gmail D2 §5)', () => {
    const { container } = render(<NotificationKindIcon kind="mail_action_failed" />);
    expect(container.querySelector('[data-kind-icon="mail_action_failed"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws Sparkles for agent_proposal_waiting (Work in one place D2, D11)', () => {
    const { container } = render(<NotificationKindIcon kind="agent_proposal_waiting" />);
    expect(container.querySelector('[data-kind-icon="agent_proposal_waiting"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws OctagonAlert for agent_step_failed (agent bundles D3 Decision 12)', () => {
    const { container } = render(<NotificationKindIcon kind="agent_step_failed" />);
    expect(container.querySelector('[data-kind-icon="agent_step_failed"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws Zap for agent_bundle_priority (guided agent, 2026-10-18), in the muted ink', () => {
    const { container } = render(<NotificationKindIcon kind="agent_bundle_priority" />);
    const icon = container.querySelector('[data-kind-icon="agent_bundle_priority"]');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('text-ink-muted');
  });
});
