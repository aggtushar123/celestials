"""A draft reply is read only by readers of its source (owner decision 2):
its email's mailbox owner (or anyone who opens its record once the owner
adds it to Revenact, 2026-10-17), its ticket's department. Everyone else, view-all
readers included, has it counted in `hidden`, never named, and may not
open, decide or undo it."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents import deciding
from services.agents.actions import drafts
from services.agents.source_access import may_read_source, unreadable_draft_ids
from services.agents.tests.drafts_fixtures import draft_action, inbound, mailbox, share, ticket
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.customers.models import ReplyDraft

LIST = "/api/v1/agents/actions/"


class DraftPrivacyTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.issue = ticket(cls.pizza, department="engineering")
        cls.email_action = draft_action(cls.org, cls.mail)
        cls.ticket_action = draft_action(cls.org, cls.issue)
        cls.vic = viewer(cls.org)

    def listed(self, user):
        data = self.client_for(user).get(LIST).data
        return {row["id"] for row in data["results"]}, data["hidden"]

    def test_activity_names_a_draft_only_to_its_sources_readers(self):
        email, ticket_ = self.email_action.pk, self.ticket_action.pk
        # Only Carl reads Carl's mail (owner-only, 2026-10-17): not Mona, who
        # manages him. Neither is in Engineering.
        self.assertEqual(self.listed(self.csm), ({email}, 1))
        self.assertEqual(self.listed(self.mona), (set(), 2))
        # Alice (Leadership) reads every department, not Carl's mail.
        self.assertEqual(self.listed(self.admin), ({ticket_}, 1))
        # Vic sees every account, but neither source.
        self.assertEqual(self.listed(self.vic), (set(), 2))
        # Dana can't open Pizza Hut at all.
        self.assertEqual(self.listed(self.other), (set(), 2))
        # Carl adds the email to Revenact: whoever opens Pizza Hut reads it.
        share(self.mail)
        self.assertEqual(self.listed(self.mona), ({email}, 1))
        self.assertEqual(self.listed(self.vic), ({email}, 1))
        self.assertEqual(self.listed(self.other), (set(), 2))

    def test_the_detail_and_the_decisions_are_404_outside_the_source(self):
        url = f"{LIST}{self.email_action.pk}/"
        self.assertEqual(self.client_for(self.csm).get(url).status_code, 200)
        for user in (self.mona, self.admin, self.vic):
            client = self.client_for(user)
            response = client.get(url)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.data["code"], "NO_SUCH_ACTION")
            for decision in ("approve", "reject", "undo"):
                self.assertEqual(client.post(f"{url}{decision}/").status_code, 404)
        self.assertFalse(ReplyDraft.objects.exists())
        share(self.mail)
        self.assertEqual(self.client_for(self.mona).get(url).status_code, 200)

    def test_deciding_needs_the_source(self):
        # Mona is above Carl, but his mail is his alone (2026-10-17).
        self.assertIsNone(deciding.decided_as(self.mona, self.email_action))
        self.assertIsNone(deciding.decided_as(self.admin, self.email_action))
        self.assertFalse(deciding.may_decide(self.vic, self.email_action))
        self.assertTrue(deciding.may_decide(self.admin, self.ticket_action))
        self.assertTrue(may_read_source(self.vic, self.email_action) is False)
        # Once he adds it to Revenact, his manager decides it as his chain.
        share(self.mail)
        self.assertEqual(deciding.decided_as(self.mona, self.email_action), "chain")

    def test_an_applied_draft_is_undone_only_by_its_sources_readers(self):
        applied = draft_action(
            self.org,
            inbound(self.pizza, self.csm, thread="t2", message_id="<z@x.com>"),
            status="applied",
        )
        applied.after, applied.result = drafts.REPLY.apply(applied, self.csm)
        applied.save(update_fields=["after", "result"])
        url = f"{LIST}{applied.pk}/undo/"
        self.assertEqual(self.client_for(self.admin).post(url).status_code, 404)

    def test_the_team_queue_names_it_only_to_its_sources_readers(self):
        def agent_items(user, scope):
            data = self.client_for(user).get(f"/api/v1/work/feed/team/?scope={scope}").data
            rows = [
                i
                for g in data["groups"]
                if g["key"] == "decide"
                for i in g["items"]
                if i["kind"] == "bundle"
            ]
            return {i["id"] for i in rows}, data["hidden"]

        # Carl's mail is his alone (2026-10-17): his manager's Team queue hides it.
        mona_ids, mona_hidden = agent_items(self.mona, "team")
        self.assertEqual(mona_ids, set())
        self.assertGreaterEqual(mona_hidden, 1)
        admin_ids, admin_hidden = agent_items(self.admin, "company")
        self.assertEqual(admin_ids, {self.ticket_action.bundle_id})
        self.assertGreaterEqual(admin_hidden, 1)
        share(self.mail)
        mona_ids, _ = agent_items(self.mona, "team")
        self.assertEqual(mona_ids, {self.email_action.bundle_id})

    def test_the_rule_is_one_subquery_without_distinct(self):
        sql = str(unreadable_draft_ids(self.vic).query).upper()
        self.assertNotIn("DISTINCT", sql)
        with CaptureQueriesContext(connection) as queries:
            self.client_for(self.vic).get(LIST)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in queries).upper())

    def test_only_the_actions_own_sources_are_checked(self):
        sql = str(unreadable_draft_ids(self.admin).query).upper()
        self.assertIn("EXISTS", sql)
        self.assertNotIn("DISTINCT", sql)

    def test_another_workspaces_tickets_do_not_matter(self):
        # Alice (Leadership) reads every department, but only her own workspace's.
        foreign = ticket(self.globex, number="G-1")
        stray = draft_action(self.org, ticket(self.pizza, number="TKT-2"))
        type(stray).objects.filter(pk=stray.pk).update(
            payload={**stray.payload, "ticket_id": foreign.pk},
            target=f"draft:ticket:{foreign.pk}",
        )
        unreadable = set(unreadable_draft_ids(self.admin).values_list("id", flat=True))
        self.assertIn(stray.pk, unreadable)
        self.assertNotIn(self.ticket_action.pk, unreadable)
        self.assertIn(self.email_action.pk, unreadable)
