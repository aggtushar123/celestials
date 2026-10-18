from django.db import connection
from django.test import SimpleTestCase
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.connectors.models import Connector
from services.customers.models import Email, Survey, Ticket
from services.mail.models import MailboxConnection
from services.organizations.story.items import SUMMARY_CHARS, clip, person, render, safe_url
from services.organizations.story.sources import SOURCES
from services.plans.models import Milestone, Plan

from .story_fixtures import StoryFixture


class HelperTests(SimpleTestCase):
    def test_clip_flattens_whitespace_and_cuts_at_a_word(self):
        self.assertEqual(clip("  two\n\nlines  "), "two lines")
        self.assertEqual(clip(None), "")
        clipped = clip("word " * 100)
        self.assertLessEqual(len(clipped), SUMMARY_CHARS)
        self.assertTrue(clipped.endswith("word…"))

    def test_person_is_the_user_or_the_stored_name(self):
        self.assertIsNone(person())
        self.assertIsNone(person(name="  "))
        self.assertEqual(person(name="Pat Buyer"), {"id": None, "name": "Pat Buyer"})

    def test_only_web_links_are_returned(self):
        self.assertEqual(safe_url("https://acme.zendesk.com/t/1"), "https://acme.zendesk.com/t/1")
        self.assertEqual(safe_url("HTTP://x.io/a"), "HTTP://x.io/a")
        for raw in ("", None, "javascript:alert(1)", "ftp://x.io", "//x.io"):
            self.assertIsNone(safe_url(raw), raw)


class RenderTests(StoryFixture):
    def item(self, kind, record, user=None):
        user = user or self.csm
        row = self.base(kind, user).select_related(*SOURCES[kind].related).get(pk=record.pk)
        return render(kind, row, self.scope(user))

    def test_every_item_has_the_contract_s_fields(self):
        activity = self.activity(self.emea, day=self.days_ago(2))
        self.assertEqual(
            self.item("activity", activity),
            {
                "id": activity.pk,
                "kind": "activity",
                "source": "revenact",
                "occurred_at": f"{self.days_ago(2).isoformat()}T00:00:00+00:00",
                "all_day": True,
                "account": {"id": self.emea.pk, "name": "EMEA"},
                "title": "Health Check Review",
                "summary": "",
                "actor": None,
                "link": {"thread_id": None, "url": None},
            },
        )

    def test_an_organisation_level_record_has_no_account(self):
        self.assertIsNone(self.item("note", self.note(self.pizza))["account"])

    def test_a_call_carries_its_callsense_summary_and_recording(self):
        zoom = Connector.objects.create(
            organisation=self.org, provider=Connector.Provider.ZOOM, name="Zoom"
        )
        call = self.call(
            self.pizza,
            summary="They want SSO.\n\nRenewal in Q3.",
            connector=zoom,
            recording_url="https://zoom.us/rec/1",
        )
        item = self.item("call", call)
        self.assertEqual(item["title"], "Quarterly review")
        self.assertEqual(item["summary"], "They want SSO. Renewal in Q3.")
        self.assertEqual(item["source"], "zoom")
        self.assertEqual(item["actor"], {"id": None, "name": "Carl CSM"})
        self.assertEqual(item["link"], {"thread_id": None, "url": "https://zoom.us/rec/1"})
        self.assertFalse(item["all_day"])

    def test_synced_mail_names_its_mailbox_and_thread(self):
        mailbox = MailboxConnection.objects.create(
            organisation=self.org,
            user=self.csm,
            provider=MailboxConnection.Provider.GOOGLE,
            address="carl@acme.io",
            credentials="x",
        )
        sent = self.email(
            self.pizza,
            mailbox=mailbox,
            mailbox_owner=self.csm,
            direction=Email.Direction.SENT,
            thread_id="t-1",
        )
        item = self.item("email", sent)
        self.assertEqual(item["source"], "google")
        self.assertEqual(item["actor"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(item["link"]["thread_id"], "t-1")
        logged = self.item("email", self.email(self.pizza))
        self.assertEqual(logged["source"], "revenact")
        self.assertEqual(logged["actor"], {"id": None, "name": "Pat Buyer"})
        self.assertEqual(logged["summary"], "Can we talk about the renewal?")
        self.assertIsNone(logged["link"]["thread_id"])

    def test_a_ticket_reads_number_priority_status_and_links_out_safely(self):
        desk = Connector.objects.create(
            organisation=self.org, provider=Connector.Provider.ZENDESK, name="Support desk"
        )
        ticket = self.ticket(
            self.pizza,
            number="TKT-9",
            priority=Ticket.Priority.HIGH,
            connector=desk,
            requester_name="Pat Buyer",
            external_url="https://acme.zendesk.com/t/9",
        )
        item = self.item("ticket", ticket)
        self.assertEqual(item["summary"], "TKT-9 · High · Open")
        self.assertEqual(item["source"], "zendesk")
        self.assertEqual(item["actor"], {"id": None, "name": "Pat Buyer"})
        self.assertEqual(item["link"]["url"], "https://acme.zendesk.com/t/9")
        Ticket.objects.filter(pk=ticket.pk).update(external_url="javascript:alert(1)")
        self.assertIsNone(self.item("ticket", ticket)["link"]["url"])

    def test_a_task_reads_its_due_date_and_assignee(self):
        item = self.item("task", self.task(self.pizza, assignee=self.csm))
        self.assertEqual(item["summary"], f"Due {self.today.isoformat()} · High · Pending")
        self.assertEqual(item["actor"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_a_note_reads_its_body_and_author(self):
        item = self.item("note", self.note(self.pizza, author=self.csm))
        self.assertEqual((item["title"], item["summary"]), ("Champion left", "Sam moved on."))
        self.assertEqual(item["actor"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_a_meeting_reads_its_type_time_and_attendees(self):
        item = self.item("calendar_event", self.meeting(self.pizza))
        self.assertEqual(item["title"], "Kickoff")
        self.assertEqual(item["summary"], "Meeting · 10:00–11:00 · 3 attendees · Plan the rollout")
        self.assertTrue(item["all_day"])

    def test_a_survey_reads_its_state(self):
        sent = self.item("survey", self.survey(self.pizza))
        self.assertEqual(
            (sent["title"], sent["summary"]), ("NPS survey", "Sent · awaiting a response")
        )
        answered = self.survey(
            self.pizza, status=Survey.Status.RESPONDED, score=40, responded_at=self.today
        )
        self.assertEqual(self.item("survey", answered)["summary"], "Responded · score 40")
        unscored = self.survey(self.pizza, status=Survey.Status.RESPONDED, responded_at=self.today)
        self.assertEqual(self.item("survey", unscored)["summary"], "Responded")
        expired = self.survey(self.pizza, status=Survey.Status.EXPIRED)
        self.assertEqual(self.item("survey", expired)["summary"], "Expired without a response")


class PlanTaskStoryTests(StoryFixture):
    """The addendum (Task 6): a story task item names its plan and milestone
    (services/organizations/story/sources.py, items.py), like the task
    payload does. No other kind gains the two keys, and reading several
    tasks under the same plan costs no more than reading one."""

    def make_plan(self):
        plan = Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            name="Kickoff plan",
            kind="other",
            owner=self.csm,
            start_date=self.today,
            target_date=self.today,
        )
        milestone = Milestone.objects.create(
            plan=plan, name="Kick-off", position=0, due_date=self.today
        )
        return plan, milestone

    def test_a_plan_task_s_item_names_its_plan_and_milestone(self):
        plan, milestone = self.make_plan()
        plan_task = self.task(
            self.pizza,
            title="Hold the call",
            plan=plan,
            milestone=milestone,
            created_by=self.csm,
            assignee=self.csm,
        )
        plain_task = self.task(self.pizza, title="Plain", created_by=self.csm, assignee=self.csm)
        note = self.note(self.pizza, author=self.csm)

        body = self.story(self.csm)
        tasks = {item["id"]: item for item in body["items"] if item["kind"] == "task"}
        notes = {item["id"]: item for item in body["items"] if item["kind"] == "note"}

        self.assertEqual(tasks[plan_task.pk]["plan"], {"id": plan.pk, "name": plan.name})
        self.assertEqual(
            tasks[plan_task.pk]["milestone"], {"id": milestone.pk, "name": milestone.name}
        )
        self.assertIsNone(tasks[plain_task.pk]["plan"])
        self.assertIsNone(tasks[plain_task.pk]["milestone"])
        self.assertNotIn("plan", notes[note.pk])
        self.assertNotIn("milestone", notes[note.pk])

    def test_the_story_does_not_grow_with_a_plan_s_tasks(self):
        # A fresh `User` row per call: `subtree_ids` memoises on the user
        # *instance* (see services.accounts.hierarchy), so reusing `self.csm`
        # across calls would make the second call artificially cheaper and
        # hide a real per-row N+1, same reasoning as `self.api()` elsewhere.
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.story(User.objects.get(pk=self.csm.pk))
            return len(ctx.captured_queries)

        plan, milestone = self.make_plan()
        self.task(
            self.pizza, plan=plan, milestone=milestone, created_by=self.csm, assignee=self.csm
        )
        one = count()
        for _ in range(2):
            self.task(
                self.pizza,
                plan=plan,
                milestone=milestone,
                created_by=self.csm,
                assignee=self.csm,
            )
        self.assertEqual(count(), one)
