"""Slack threads in Communications (owner, 2026-10-16): the sidebar's Slack
narrows the inbox to the Slack threads filed on customers the reader may
open, newest first, read as Slack showed them. Only when asked for: the
four tiles, their counts and the default list are unchanged."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Customer

from .slack_fixtures import conversation, msg
from .test_communications import CommunicationsBase

URL = "/api/v1/communications/"


class SlackInCommunicationsTests(CommunicationsBase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        self.old = conversation(
            self.pizza, title="Old thread", last_message_at=now - timedelta(days=3)
        )
        self.new = conversation(
            self.pizza,
            title="SSO broke for <@U0FAIZ>",
            last_message_at=now - timedelta(hours=1),
            messages=[
                msg("1.1", text="SSO broke :rotating_light: see <#C0SUP|support>"),
                msg("1.2", name="Revenact", text="On it &amp; filed", bot=True),
            ],
        )
        self.engineering = conversation(
            self.pizza,
            title="Eng only",
            department="engineering",
            last_message_at=now - timedelta(days=5),
        )
        hidden = Customer.objects.create(organisation=self.org, name="Hidden Co", owner=self.alice)
        self.not_mine = conversation(
            hidden, title="Not my customer", last_message_at=now - timedelta(days=5)
        )
        rival = Customer.objects.create(organisation=self.other_org, name="Rival Co")
        self.rival = conversation(rival, title="Other tenant")

    def get(self, user, **params):
        self.client.force_authenticate(user)
        response = self.client.get(URL, params)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_asked_for_slack_lists_its_threads_newest_first(self):
        body = self.get(self.carl, kind="slack")
        ids = [row["id"] for row in body["results"]]
        self.assertEqual(ids[:2], [f"slack:{self.new.pk}", f"slack:{self.old.pk}"])
        row = body["results"][0]
        self.assertEqual(
            {k: row[k] for k in ("kind", "who", "detail", "action", "external_url")},
            {
                "kind": "slack",
                "who": "Faiz Jamal",
                "detail": "#support",
                "action": "open_external",
                "external_url": self.new.url,
            },
        )
        self.assertEqual(
            row["account"], {"id": self.pizza.pk, "name": "Pizza Hut", "type": "customer"}
        )

    def test_the_thread_reads_as_slack_showed_it(self):
        [row] = [
            r
            for r in self.get(self.carl, kind="slack")["results"]
            if r["id"] == f"slack:{self.new.pk}"
        ]
        self.assertEqual(row["subject"], "SSO broke for @Faiz Jamal")
        self.assertEqual(row["snippet"], "On it & filed")
        self.assertEqual(
            row["preview"], "Faiz Jamal: SSO broke 🚨 see #support\nRevenact: On it & filed"
        )

    def test_a_person_only_mentioned_reads_by_name_from_the_stored_people(self):
        mentioned = conversation(
            self.pizza,
            title="<@U0TUSH> any update on Twilio?",
            last_message_at=timezone.now(),
            messages=[msg("2.1", text="<@U0TUSH> any update on Twilio?")],
            people={"U0TUSH": {"name": "Tushar Aggarwal"}},
        )
        [row] = [
            r
            for r in self.get(self.carl, kind="slack")["results"]
            if r["id"] == f"slack:{mentioned.pk}"
        ]
        self.assertEqual(row["subject"], "@Tushar Aggarwal any update on Twilio?")
        self.assertEqual(row["snippet"], "@Tushar Aggarwal any update on Twilio?")
        self.assertEqual(row["preview"], "Faiz Jamal: @Tushar Aggarwal any update on Twilio?")
        self.assertNotIn("someone", row["subject"] + row["snippet"] + row["preview"])

    def test_department_customer_and_tenant_rules_hold(self):
        ids = {row["id"] for row in self.get(self.dana, kind="slack")["results"]}
        self.assertNotIn(f"slack:{self.engineering.pk}", ids)
        self.assertNotIn(f"slack:{self.rival.pk}", ids)
        engineer = {row["id"] for row in self.get(self.priya, kind="slack")["results"]}
        self.assertIn(f"slack:{self.engineering.pk}", engineer)
        self.client.force_authenticate(self.outsider)
        outsider = {row["id"] for row in self.client.get(URL, {"kind": "slack"}).json()["results"]}
        self.assertEqual(outsider, {f"slack:{self.rival.pk}"})

    def test_a_customer_the_reader_cannot_open_is_never_listed(self):
        from services.accounts.models import User

        plain = User.objects.create_user(
            email="pat@acme.io", password="x", name="Pat", organisation=self.org
        )
        self.pizza.owner = plain
        self.pizza.save(update_fields=["owner"])
        ids = {row["id"] for row in self.get(plain, kind="slack")["results"]}
        self.assertIn(f"slack:{self.new.pk}", ids)
        self.assertNotIn(f"slack:{self.not_mine.pk}", ids)

    def test_the_everything_tab_lists_slack_too_when_asked(self):
        body = self.get(self.carl, kind="slack", needs="false")
        self.assertEqual(body["results"][0]["id"], f"slack:{self.new.pk}")
        self.assertEqual(body["results"][0]["kind"], "slack")

    def test_unasked_the_queue_and_its_tiles_are_unchanged(self):
        kinds = {row["kind"] for row in self.get(self.carl)["results"]}
        self.assertNotIn("slack", kinds)
        self.client.force_authenticate(self.carl)
        stats = self.client.get("/api/v1/communications/stats/").json()
        self.assertNotIn("slack", stats.get("by_kind", stats))
