import { AlarmClock, ClipboardList, FilePen, Lightbulb, ListChecks, MailWarning, Megaphone, OctagonAlert, Sparkles, SquareCheck, TriangleAlert, Undo2, Zap, type LucideIcon } from 'lucide-react';
import type { NotificationKind } from '../../features/notifications/types';

/** The kinds that carry an icon in the bell (plans spec §2.5, campaigns spec
 *  §2.5, Work spec §1.3, §2.2, §3.2, Agents deliveries 1 and 2, two-way Gmail D2, Work in one place D2). */
const ICONS: Partial<Record<NotificationKind, LucideIcon>> = {
  plan_started: ClipboardList,
  plan_task_assigned: ListChecks,
  campaign_sent: Megaphone,
  task_assigned: SquareCheck,
  recommendations_waiting: Lightbulb,
  task_overdue: AlarmClock,
  task_escalated: TriangleAlert,
  agent_action_undone: Undo2,
  agent_draft_ready: FilePen,
  mail_action_failed: MailWarning,
  agent_proposal_waiting: Sparkles,
  agent_step_failed: OctagonAlert,
  agent_bundle_priority: Zap,
};

/** A notification kind's icon, beside its words; nothing for the others. */
export function NotificationKindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = ICONS[kind];
  return Icon ? <Icon data-kind-icon={kind} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /> : null;
}
