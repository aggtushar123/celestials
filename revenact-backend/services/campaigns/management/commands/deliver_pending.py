"""Finishes every campaign send and every survey send still `sending`.

    python manage.py deliver_pending

Run every minute (the `sender` service). Send now only claims a send; this
emails its queued people and finishes it, and resumes any send a crash cut
off, from whoever is still queued. Safe to run again or at the same time as
itself: each person is taken by one conditional UPDATE, so nobody is
emailed twice. Also sends Work's daily digests that are due
(services.work.digest), and first proposes the agent bundles for Slack
messages sent to Work (services.agents.slack_bundles) and the sales review
reports for tomorrow's meetings (services.agents.sales_review); before those,
the channel tag checks (services.connectors.slack_tag_checks). With nothing
pending it is five queries (the tag checks' one added), plus one for the
workspaces, plus one per workspace past its digest hour."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from services.campaigns.sending import deliver_pending as deliver_campaigns
from services.surveys.sending import deliver_pending as deliver_surveys
from services.work.digest import send_due as send_digests


class Command(BaseCommand):
    help = (
        "Email every campaign and survey send still sending, and finish it; send due Work digests."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        # First: a handed-over message's plan is then proposed by slack_bundles just below.
        self.slack_tags(now)
        self.slack_bundles(now)
        self.sales_reviews(now)
        self.issue_waits(now)
        campaigns, campaigns_failed = deliver_campaigns(now=now)
        surveys, surveys_failed = deliver_surveys(now=now)
        failed = campaigns_failed + surveys_failed
        if campaigns or surveys or failed:
            self.stdout.write(
                f"Finished {campaigns} campaign send(s) and {surveys} survey send(s); "
                f"{failed} failed."
            )
        try:
            digests = send_digests(now=now)
            sent, digests_failed = digests.sent, digests.failed
            workspaces_failed = digests.failed_workspaces
        except Exception as exc:  # noqa: BLE001 - campaign and survey sends already ran
            self.stdout.write(self.style.WARNING(f"digests skipped: {type(exc).__name__}"))
            sent, digests_failed, workspaces_failed = 0, 0, 0
        if sent or digests_failed:
            self.stdout.write(f"Sent {sent} work digest(s); {digests_failed} failed.")
        if workspaces_failed:
            self.stdout.write(
                self.style.WARNING(f"{workspaces_failed} workspace(s) failed their digests.")
            )

    def slack_tags(self, now):
        """Channel tag to-dos: synced Slack messages that tag colleagues, each
        asked once whether it asks them for something (and handed over if so).
        A failure never stops the sends below."""
        from services.connectors.slack_tag_checks import run_pending

        try:
            counts = run_pending(now=now)
        except Exception as exc:  # noqa: BLE001 - the sends below run either way
            self.stdout.write(self.style.WARNING(f"slack tags skipped: {type(exc).__name__}"))
            return
        if counts["handed"] or counts["dropped"]:
            self.stdout.write(
                f"Slack tags: {counts['handed']} handed over, {counts['none']} not a request, "
                f"{counts['dropped']} dropped."
            )

    def slack_bundles(self, now):
        """Slack bundles: the bundles for Slack messages sent to Work since the
        last tick. A failure never stops the sends below."""
        from services.agents.slack_bundles import propose_pending

        try:
            counts = propose_pending(now=now)
        except Exception as exc:  # noqa: BLE001 - the sends below run either way
            self.stdout.write(self.style.WARNING(f"slack bundles skipped: {type(exc).__name__}"))
            return
        if any(counts.values()):
            self.stdout.write(
                f"Slack messages: {counts['made']} bundle(s) made, {counts['none']} without one, "
                f"{counts['failed']} failed."
            )

    def sales_reviews(self, now):
        """Sales review report: tomorrow's "sales review" meetings get their
        organiser's guided bundle (once each; the daily check, run every
        minute). A failure never stops the sends below."""
        from services.agents.sales_review import check_meetings

        try:
            counts = check_meetings(now=now)
        except Exception as exc:  # noqa: BLE001 - the sends below run either way
            self.stdout.write(self.style.WARNING(f"sales reviews skipped: {type(exc).__name__}"))
            return
        if counts["made"]:
            self.stdout.write(
                f"Sales reviews: {counts['made']} report bundle(s) made, "
                f"{counts['skipped']} skipped."
            )

    def issue_waits(self, now):
        """Slack bundles: surveys held back for a Jira issue, sent once it is
        resolved (claimed here, emailed by the survey delivery just below)."""
        from services.agents.issue_waits import run_due

        try:
            counts = run_due(now=now)
        except Exception as exc:  # noqa: BLE001 - the sends below run either way
            self.stdout.write(self.style.WARNING(f"issue waits skipped: {type(exc).__name__}"))
            return
        sent = counts["sent"] if isinstance(counts["sent"], dict) else {}
        if sent.get("sent") or sent.get("refused") or counts["expired"]:
            self.stdout.write(
                f"Surveys after Jira: {sent.get('sent', 0)} sent, {sent.get('refused', 0)} "
                f"refused, {counts['expired']} expired."
            )
