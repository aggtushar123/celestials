"""The sales review report (2026-10-18, sales review report spec): the daily
check, the bundle's routing and read rule, the report as its organiser may
read it, the guided run and the printable download.

AgentsFixture's world: Sam (Sales, CSM role) owns Deals Ltd; Carl owns Pizza
Hut; Alice is an admin with view-all. Sam organises the sales review."""

import json
from datetime import datetime, time, timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.utils import timezone

from core.models import AuditEvent
from services.agents import sales_review
from services.agents.models import AgentBundle, AgentProfile
from services.agents.tests.fixtures import AgentsFixture
from services.calendar.models import Meeting
from services.customers.models import Opportunity
from services.identity.models import OrganizationMembership
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.work.prefs import settings_for

MODEL = "services.copilot.anthropic_client.get_completion"
BUNDLE = "/api/v1/agents/bundles/{}/"
STEP_RUN = "/api/v1/agents/bundles/{}/steps/{}/run/"
STOP = "/api/v1/agents/bundles/{}/stop/"
REPORT = "/api/v1/agents/bundles/{}/steps/{}/report/"
FEED = "/api/v1/work/feed/"
KOLKATA = ZoneInfo("Asia/Kolkata")
St = Opportunity.Stage


class SalesReviewFixture(AgentsFixture):
    def setUp(self):
        super().setUp()
        prefs = settings_for(self.org)
        prefs.timezone = "Asia/Kolkata"
        prefs.save(update_fields=["timezone"])
        from services.mail.tests.gmail_fixtures import google_connection

        self.connection = google_connection(self.sam)
        # 20:00 today in Kolkata: tomorrow there starts in four hours.
        today = timezone.now().astimezone(KOLKATA).date()
        self.now = datetime.combine(today, time(20, 0), tzinfo=KOLKATA)

    def meeting(self, title="Sales review", *, day=1, at=time(10, 0), **fields):
        local = self.now.date() + timedelta(days=day)
        starts = datetime.combine(local, at, tzinfo=KOLKATA)
        values = {
            "organisation": self.org,
            "owner": self.sam,
            "connection": self.connection,
            "google_event_id": f"evt-{title}-{day}-{at}",
            "title": title,
            "starts_at": starts,
            "ends_at": starts + timedelta(minutes=30),
            "organizer_email": self.sam.email,
            **fields,
        }
        return Meeting.objects.create(**values)

    def check(self, now=None):
        return sales_review.check_meetings(now=now or self.now)

    def bundle(self):
        self.meeting()
        with patch("django.utils.timezone.now", return_value=self.now):
            self.check()
        return AgentBundle.objects.get(source=AgentBundle.Source.MEETING)

    def deal(self, title, stage, amount, *, customer=None, changed_days=None, closes=None, **kw):
        row = Opportunity.objects.create(
            customer=customer or self.deals,
            title=title,
            stage=stage,
            mrr=Decimal(amount),
            department=kw.pop("department", "sales"),
            expected_close=closes,
            **kw,
        )
        if changed_days is not None:
            Opportunity.objects.filter(pk=row.pk).update(
                stage_changed_at=timezone.now() - timedelta(days=changed_days)
            )
        return row

    def answer(self, summary="Two deals won, one lost; Enterprise upgrade closes next."):
        def reply(*args, **kwargs):
            return json.dumps({"summary": summary})

        found = patch(MODEL, side_effect=reply)
        mock = found.start()
        self.addCleanup(found.stop)
        return mock


class DailyCheckTests(SalesReviewFixture):
    def test_tomorrows_sales_review_gets_one_bundle_for_its_organiser(self):
        self.meeting("Weekly SALES REVIEW - EMEA")
        counts = self.check()
        self.assertEqual(counts["made"], 1)
        bundle = AgentBundle.objects.get(source=AgentBundle.Source.MEETING)
        self.assertEqual(
            (bundle.routed_to, bundle.routed_user_id, bundle.priority, bundle.agent),
            ("person", self.sam.pk, "high", "sales"),
        )
        step = bundle.steps.get()
        self.assertEqual((step.kind, step.status), ("report.sales", "proposed"))
        self.assertIsNone(step.customer_id)
        self.assertEqual(step.payload["title"], "Weekly SALES REVIEW - EMEA")
        # Told at once, in the app (no web push).
        told = Notification.objects.get(recipient=self.sam)
        self.assertEqual(told.kind, Notification.Kind.AGENT_BUNDLE_PRIORITY)
        self.assertEqual(told.link, f"/work?queue=mine&kind=bundle&bundle={bundle.pk}")
        made = AuditEvent.objects.get(action="agent_bundle.made")
        self.assertEqual(made.metadata["source"], "meeting")
        self.assertNotIn("Weekly", json.dumps(made.metadata))

    def test_only_titles_with_the_phrase_and_only_tomorrow_in_the_workspace_zone(self):
        self.meeting("Pipeline sync")
        self.meeting("Sales review", day=0, at=time(23, 0))
        self.meeting("Sales review", day=2)
        # 03:00 tomorrow in Kolkata is still today in UTC: the workspace's zone decides.
        early = self.meeting("Sales review", at=time(3, 0))
        self.meeting("Sales review all day", all_day=True)
        self.assertEqual(self.check()["made"], 1)
        step = AgentAction.objects.get(kind="report.sales")
        self.assertEqual(step.payload["meeting_id"], early.pk)

    def test_it_is_idempotent_and_one_event_on_two_calendars_is_one_bundle(self):
        from services.mail.tests.gmail_fixtures import google_connection

        first = self.meeting(ical_uid="same-event")
        other = google_connection(self.csm)
        Meeting.objects.create(
            organisation=self.org,
            owner=self.csm,
            connection=other,
            google_event_id="carl-copy",
            ical_uid="same-event",
            title=first.title,
            starts_at=first.starts_at,
            ends_at=first.ends_at,
            organizer_email=self.sam.email,
        )
        self.assertEqual(self.check()["made"], 1)
        again = self.check()
        self.assertEqual((again["made"], again["already"]), (0, 1))
        bundle = AgentBundle.objects.get(source=AgentBundle.Source.MEETING)
        # Still once after it ran or was stopped.
        bundle.steps.update(status=AgentAction.Status.SKIPPED)
        self.assertEqual(self.check()["made"], 0)
        self.assertEqual(AgentBundle.objects.filter(source="meeting").count(), 1)

    def test_an_organiser_who_is_not_a_working_member_is_skipped(self):
        self.meeting(organizer_email="someone@elsewhere.io")
        self.meeting("Sales review two", organizer_email=self.stranger.email)
        self.assertEqual(self.check()["made"], 0)
        OrganizationMembership.objects.filter(user=self.sam).update(
            status=OrganizationMembership.Status.SUSPENDED
        )
        self.meeting("Sales review three")
        self.assertEqual(self.check()["made"], 0)
        self.assertFalse(AgentBundle.objects.filter(source="meeting").exists())

    def test_ai_off_skips_it(self):
        self.meeting()
        self.org.ai_agent_enabled = False
        self.org.save(update_fields=["ai_agent_enabled"])
        self.assertEqual(self.check()["skipped"], 1)
        self.org.ai_agent_enabled = True
        self.org.save(update_fields=["ai_agent_enabled"])
        from services.agents.policy import profiles_for

        profiles_for(self.org)
        AgentProfile.objects.filter(organisation=self.org, kind="sales").update(enabled=False)
        self.assertEqual(self.check()["skipped"], 1)
        AgentProfile.objects.filter(organisation=self.org, kind="sales").update(enabled=True)
        self.assertEqual(self.check()["made"], 1)

    def test_the_deliver_tick_runs_the_check(self):
        self.meeting()
        out = StringIO()
        with patch("django.utils.timezone.now", return_value=self.now):
            call_command("deliver_pending", stdout=out)
        self.assertIn("Sales reviews: 1 report bundle(s) made", out.getvalue())


class ReadRuleTests(SalesReviewFixture):
    def test_the_organiser_reads_it_and_nobody_else_even_view_all(self):
        bundle = self.bundle()
        with patch("django.utils.timezone.now", return_value=self.now):
            mine = self.client_for(self.sam).get(BUNDLE.format(bundle.pk))
        self.assertEqual(mine.status_code, 200)
        body = mine.json()
        self.assertTrue(body["guided"])
        self.assertEqual(body["priority"], "high")
        self.assertEqual(body["source"]["kind"], "meeting")
        self.assertEqual(body["source"]["title"], "Sales review")
        self.assertEqual(body["for"]["id"], self.sam.pk)
        step = body["steps"][0]
        self.assertEqual(
            step["question"],
            "You have Sales review tomorrow at 10:00. Should I prepare the sales report?",
        )
        self.assertEqual(body["next_step"], step["id"])
        self.assertTrue(step["can_run"])
        self.assertTrue(body["can_stop"])
        self.assertFalse(step["irreversible"])
        for other in (self.admin, self.csm, self.stranger):
            self.assertEqual(
                self.client_for(other).get(BUNDLE.format(bundle.pk)).status_code, 404, other
            )
            run = self.client_for(other).post(STEP_RUN.format(bundle.pk, step["id"]), {})
            self.assertEqual(run.status_code, 404, other)

    def test_it_is_on_the_organisers_work_feed_and_counted_for_nobody_else(self):
        bundle = self.bundle()

        def items(user):
            body = self.client_for(user).get(FEED).json()
            decide = next(g for g in body["groups"] if g["key"] == "decide")
            return decide["items"], decide.get("hidden")

        rows, _hidden = items(self.sam)
        row = next(r for r in rows if r["key"] == f"bundle:{bundle.pk}")
        self.assertEqual(row["detail"]["source"]["kind"], "meeting")
        self.assertEqual(row["detail"]["priority"], "high")
        self.assertIsNone(row["record"])
        for other in (self.admin, self.csm):
            rows, hidden = items(other)
            self.assertNotIn(f"bundle:{bundle.pk}", [r["key"] for r in rows])
            self.assertIn(hidden, (0, None))
        history = self.client_for(self.admin).get("/api/v1/agents/bundles/history/").json()
        self.assertEqual(history["hidden"], 0)


class ReportTests(SalesReviewFixture):
    def test_the_report_holds_only_deals_the_organiser_may_see(self):
        today = timezone.localdate()
        self.deal("Renewal", St.CLOSED_WON, 1000, changed_days=3)
        self.deal("Old win", St.CLOSED_WON, 9000, changed_days=45)
        self.deal("Lost one", St.CLOSED_LOST, 500, changed_days=10)
        self.deal("Upgrade", St.NEGOTIATION, 2000, changed_days=2, closes=today + timedelta(5))
        self.deal("Later", St.DISCOVERY, 300, changed_days=60, closes=today + timedelta(50))
        # Carl's customer and a CS deal: Sam may not see them.
        self.deal("Pizza deal", St.CLOSED_WON, 7777, customer=self.pizza, changed_days=1)
        self.deal("CS deal", St.CLOSED_WON, 6666, changed_days=1, department="cs")
        report = sales_review.compute(self.sam, self.org)
        self.assertEqual([row["name"] for row in report["won"]], ["Renewal"])
        self.assertEqual(
            report["won"][0]["record"],
            {"type": "customer", "id": self.deals.pk, "name": "Deals Ltd"},
        )
        self.assertEqual(report["won"][0]["amount"], "1000.00")
        self.assertEqual([row["name"] for row in report["lost"]], ["Lost one"])
        self.assertEqual([row["name"] for row in report["closing"]], ["Upgrade"])
        self.assertEqual(report["closing"][0]["stage_label"], "Negotiation")
        totals = report["totals"]
        self.assertEqual(
            (totals["won_count"], totals["lost_count"], totals["open_count"], totals["win_rate"]),
            (1, 1, 2, 50),
        )
        stages = {row["stage"]: row for row in report["stages"]}
        self.assertEqual(stages["closed_won"]["count"], 2)
        self.assertEqual(stages["closed_won"]["moved_in"], 1)
        self.assertIsNone(stages["negotiation"]["moved_out"])
        self.assertFalse(report["stage_history"])
        self.assertEqual(report["currency"], "USD")
        self.assertNotIn("Pizza deal", json.dumps(report))

    def test_the_summary_is_one_schema_bound_call_cut_to_120_words(self):
        self.deal("Renewal", St.CLOSED_WON, 1000, changed_days=3)
        mock = self.answer(" ".join(["word"] * 200))
        report = sales_review.prepare(self.org, self.sam)
        self.assertEqual(len(report["summary"].split()), 120)
        call = mock.call_args
        self.assertEqual(call.kwargs["purpose"], "sales_report")
        self.assertIn("summary", call.kwargs["response_schema"]["properties"])
        self.assertIn("Renewal", call.args[1][0]["content"])

    def test_a_model_failure_leaves_the_figures(self):
        from services.copilot.anthropic_client import CopilotRequestFailed

        self.deal("Renewal", St.CLOSED_WON, 1000, changed_days=3)
        with patch(MODEL, side_effect=CopilotRequestFailed("down")):
            report = sales_review.prepare(self.org, self.sam)
        self.assertEqual(report["summary"], "")
        self.assertEqual(report["totals"]["won_count"], 1)


class GuidedRunTests(SalesReviewFixture):
    def test_yes_prepares_the_report_and_download_serves_it(self):
        self.deal("Renewal <b>&", St.CLOSED_WON, 1000, changed_days=3)
        bundle = self.bundle()
        step = bundle.steps.get()
        before = self.client_for(self.sam).get(BUNDLE.format(bundle.pk)).json()
        preview = before["steps"][0]["preview"]["sales_report"]
        self.assertEqual(preview["meeting"]["title"], "Sales review")
        self.assertEqual(preview["counts"], {"won": 1, "lost": 0, "closing": 0, "open": 0})
        self.assertIsNone(preview["report"])
        self.assertEqual(
            self.client_for(self.sam).get(REPORT.format(bundle.pk, step.pk)).status_code, 404
        )
        self.answer("<script>alert(1)</script> A good month.")
        ran = self.client_for(self.sam).post(STEP_RUN.format(bundle.pk, step.pk), {}, format="json")
        self.assertEqual(ran.status_code, 200, ran.content)
        body = ran.json()["bundle"]
        self.assertEqual(body["status"], "done")
        after = body["steps"][0]["preview"]["sales_report"]
        self.assertEqual(after["report"]["won"][0]["name"], "Renewal <b>&")
        self.assertEqual(after["download_url"], REPORT.format(bundle.pk, step.pk))
        self.assertIsNotNone(body["steps"][0]["undo"])
        prepared = AuditEvent.objects.get(action="sales_report.prepared")
        self.assertEqual(prepared.metadata["won"], 1)

        page = self.client_for(self.sam).get(REPORT.format(bundle.pk, step.pk))
        self.assertEqual(page.status_code, 200)
        self.assertTrue(page["Content-Type"].startswith("text/html"))
        from services.work.clock import today_for

        today = today_for(self.org).isoformat()
        self.assertEqual(
            page["Content-Disposition"], f'inline; filename="sales-report-{today}.html"'
        )
        self.assertIn("default-src 'none'", page["Content-Security-Policy"])
        html = page.content.decode()
        self.assertIn("Acme Inc", html)
        self.assertIn("Renewal &lt;b&gt;&amp;", html)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)
        downloaded = AuditEvent.objects.get(action="report.downloaded")
        self.assertEqual(downloaded.metadata, {"bundle": bundle.pk, "agent_step": step.pk})
        for other in (self.admin, self.csm):
            self.assertEqual(
                self.client_for(other).get(REPORT.format(bundle.pk, step.pk)).status_code, 404
            )
        self.assertEqual(AuditEvent.objects.filter(action="report.downloaded").count(), 1)

    def test_undo_discards_the_report(self):
        bundle = self.bundle()
        step = bundle.steps.get()
        self.answer()
        self.client_for(self.sam).post(STEP_RUN.format(bundle.pk, step.pk), {}, format="json")
        undone = self.client_for(self.sam).post(f"/api/v1/agents/actions/{step.pk}/undo/")
        self.assertEqual(undone.status_code, 200, undone.content)
        self.assertEqual(
            self.client_for(self.sam).get(REPORT.format(bundle.pk, step.pk)).status_code, 404
        )

    def test_not_now_stops_it(self):
        bundle = self.bundle()
        stopped = self.client_for(self.sam).post(STOP.format(bundle.pk))
        self.assertEqual(stopped.status_code, 200, stopped.content)
        self.assertEqual(bundle.steps.get().status, "skipped")
        self.assertEqual(self.client_for(self.admin).post(STOP.format(bundle.pk)).status_code, 404)

    def test_no_proposer_makes_it(self):
        from services.agents.kinds import Invalid
        from services.agents.registry import REGISTRY

        spec = REGISTRY["report.sales"]
        # message_only: never on the nightly pass; workspace-level: never on a message's read.
        self.assertTrue(spec.message_only and spec.workspace_level)
        with self.assertRaises(Invalid):
            spec.validate({}, {}, None, [])
