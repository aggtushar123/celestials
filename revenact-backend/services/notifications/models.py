from django.conf import settings
from django.db import models


class Notification(models.Model):
    """A real, personal notification behind the Navbar's bell. Every kind
    has a real recipient: Copilot invites and hand-offs, owner assignment,
    questions, segment and rule digests, plans, campaigns, and tasks
    assigned to someone (`task_assigned`, services/customers/task_changes.py;
    a task's assignee is a real `User` since customers migration 0041), and
    recommended tasks waiting to be assigned (`recommendations_waiting`,
    services/work/recommend.py), an overdue task's reminder to its assignee
    (`task_overdue`) and its one escalation to their manager
    (`task_escalated`), services/work/tracking.py, an agent action
    someone undid (`agent_action_undone`, services/agents/undo.py), and AI
    agent proposals waiting for the reader's decision, at most once a day
    (`agent_proposal_waiting`, services/work/proposal_notice.py).

    `message` is a real string rendered once, at creation time (see
    services.notifications.realtime.notify) — not re-derived from
    `actor`/whatever it's about later, so it stays meaningful even if
    the underlying company is renamed or a session is long closed by
    the time someone reads it. `link` is a real relative frontend path
    the bell's own dropdown navigates to on click (e.g.
    `/copilot?session=<id>`, `/organizations/<id>`) — never an absolute
    URL, since it's always a route within this same app."""

    class Kind(models.TextChoices):
        COPILOT_INVITE = "copilot_invite", "Copilot invite"
        COPILOT_HANDOFF = "copilot_handoff", "Copilot hand-off"
        CUSTOMER_ASSIGNED = "customer_assigned", "Customer assigned"
        ACCOUNT_ASSIGNED = "account_assigned", "Account assigned"
        QUESTION_ASKED = "question_asked", "Question asked"
        QUESTION_ANSWERED = "question_answered", "Question answered"
        SEGMENT_CHANGES = "segment_changes", "Segment changes"
        RULE_FIRED = "rule_fired", "Rule fired"
        RULE_REVIEW = "rule_review", "Rule review waiting"
        PLAN_STARTED = "plan_started", "Plan started"
        PLAN_TASK_ASSIGNED = "plan_task_assigned", "Plan tasks assigned"
        CAMPAIGN_SENT = "campaign_sent", "Campaign sent"
        TASK_ASSIGNED = "task_assigned", "Task assigned"
        RECOMMENDATIONS_WAITING = "recommendations_waiting", "Recommendations waiting"
        TASK_OVERDUE = "task_overdue", "Task overdue"
        TASK_ESCALATED = "task_escalated", "Task escalated"
        AGENT_ACTION_UNDONE = "agent_action_undone", "Agent action undone"
        AGENT_DRAFT_READY = "agent_draft_ready", "Agent draft ready"
        MAIL_ACTION_FAILED = "mail_action_failed", "Mail action failed"
        AGENT_PROPOSAL_WAITING = "agent_proposal_waiting", "Bundles waiting"
        AGENT_STEP_FAILED = "agent_step_failed", "Agent step failed"
        MEETING_PROPOSED = "meeting_proposed", "Meeting asked for"
        AGENT_SURVEY_WAIT = "agent_survey_wait", "Survey after a Jira issue"
        AGENT_BUNDLE_PRIORITY = "agent_bundle_priority", "Priority bundle"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="notifications", on_delete=models.CASCADE
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    # 32: leaves room for later, longer kinds.
    kind = models.CharField(max_length=32, choices=Kind.choices)
    # 500: a rule's digest is up to 200 characters of its own plus the
    # owner's note (up to 280).
    message = models.CharField(max_length=500)
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.kind} -> {self.recipient_id}: {self.message}"
