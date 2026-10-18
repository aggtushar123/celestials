// Mirrors revenact-backend's real NotificationSerializer field for
// field — see revenact-backend's docs/API_CONTRACTS.md. The first real
// backend behind the Navbar's own bell icon, which used to show a
// fixed, fake "25" badge.

export interface NotificationActor {
  id: number;
  name: string;
}

export type NotificationKind =
  | 'copilot_invite'
  | 'copilot_handoff'
  | 'customer_assigned'
  | 'account_assigned'
  | 'question_asked'
  | 'question_answered'
  // A segment's daily alert to its owner: "<name>: 3 entered, 1 left",
  // linking to /segments/<id>?tab=changes (backend PR #84).
  | 'segment_changes'
  // A rule's nightly digest, or its "switched itself off" notice, linking to
  // /scenarios/rules/<id>?run=<run_id> for someone who may read the rule
  // (rules backend Decisions 11, 20).
  | 'rule_fired'
  // The owner's once-a-night "N surveys from your rules are waiting",
  // linking to /work/mine?kind=approval (older notices link to /brain/review,
  // which redirects; rules backend Decision 21).
  | 'rule_review'
  // A plan started for its owner by a rule or by someone else, linking to
  // /projects/<id> (plans spec §1.7).
  | 'plan_started'
  // "N tasks in <plan>" for the person given them, one per action, never to
  // the person acting; links to /projects/<id> (plans spec §1.7).
  | 'plan_task_assigned'
  // "Win-back emailed 42 people · 6 skipped" for the owner when a rule's send
  // without review finishes; links to /campaigns/<id> (campaigns spec §1.10).
  | 'campaign_sent'
  // "<who> assigned you "<title>" on <record>." for the person given a task
  // by someone else, a rule or the AI agent, or by a reassignment; links to
  // /work/mine?task=<id> (Work spec §1.3; older notices link to
  // /work/today?task=<id>, which redirects).
  | 'task_assigned'
  // "3 tasks recommended for your team." (or "Revenact recommends “<title>”.")
  // for a recipient with new open recommendations, at most once a day; links
  // to /work/mine?kind=suggestion (Work spec §2.2; older notices link to
  // /work/recommended, which redirects).
  | 'recommendations_waiting'
  // Work spec §3.2: an assignee's daily nudge about an overdue task, and
  // the once-only notice to their manager (or the workspace owner); both
  // link to /work/mine?task=<id>.
  | 'task_overdue'
  | 'task_escalated'
  // An agent action someone undid, for whoever approved it (or the record
  // owner, for an Auto one), linking to /work?queue=history&bundle=<id>
  // (agent bundles D1 contract D20; older notices link to
  // /work/activity?action=<id>, which redirects).
  | 'agent_action_undone'
  // "The CS agent drafted a reply to Ann Lee on Dough Co." for a draft's
  // owner when a draft.reply applies (not when they approved it themselves),
  // linking to /communications?draft=<id> (Agents delivery 2 contract).
  | 'agent_draft_ready'
  // "Couldn't archive in Gmail: the message no longer exists." (or "Couldn't
  // archive 12 conversations in Gmail: ...") for a mailbox owner when an
  // action failed in Gmail and was put back, linking to
  // /communications?source=mailbox:google&message=<id> (two-way Gmail D2 §5).
  | 'mail_action_failed'
  // "Bundles are waiting for your decision." for a person with a bundle
  // waiting on their Mine, at most once a day; links to
  // /work?queue=mine&kind=bundle (agent bundles D1 contract §10.6).
  | 'agent_proposal_waiting'
  // "Step 2 failed in “Pizza Hut: login loop”: Jira says the project SUP needs a component."
  // (or "2 steps failed in …") for the person who ran it, linking to
  // /work?queue=history&bundle=<id> (agent bundles D3 contract §7).
  | 'agent_step_failed'
  // "Priority: <bundle title>" for each person a newly made high-priority
  // bundle is routed to, at once; links to
  // /work?queue=mine&kind=bundle&bundle=<id> (guided agent, 2026-10-18).
  | 'agent_bundle_priority';

export interface Notification {
  id: number;
  kind: NotificationKind;
  /** A real string, rendered once by the backend at creation time —
   * see that model's own docstring for why this app never re-derives
   * it client-side. */
  message: string;
  /** A real relative frontend path to navigate to on click (e.g.
   * `/copilot?session=<id>`, `/organizations/<id>`) — empty string
   * when there's nowhere real to go. */
  link: string;
  actor: NotificationActor | null;
  is_read: boolean;
  created_at: string;
}
