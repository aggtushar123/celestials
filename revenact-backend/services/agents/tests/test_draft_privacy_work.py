"""Work › Recommended and the feedback log follow the draft reply's source
rule (owner decision 2): a recommendation of a draft (open, or retired by
delivery 2's migration) is shown and decided only by a reader of its source,
anyone else reads it as missing; and the feedback log never copies a draft's
text."""

from services.agents import deciding
from services.agents.tests.drafts_fixtures import draft_action, inbound, mailbox, share
from services.metrics.models import Feedback
from services.work.models import Recommendation
from services.work.tests.recommend_fixtures import RecommendFixture

URL = "/api/v1/work/recommendations/"


class DraftRecommendedTests(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.email_action = draft_action(cls.org, cls.mail)

    def draft_rec(self, *, retired=False):
        """Carl's draft reply on Pizza Hut, recommended to Mona (his manager,
        who may not read his mail: owner-only, 2026-10-17, until he adds it
        to Revenact); Alice opens Pizza Hut but not Carl's mail either."""
        rec = self.make_rec(
            "agent_action",
            on=self.pizza,
            recipient=self.mona,
            suggested=self.csm,
            title="Reply to Ann Lee",
            agent_action=self.email_action,
        )
        if retired:
            Recommendation.objects.filter(pk=rec.pk).update(
                status="dismissed", dismiss_reason="retired"
            )
        return rec

    def ids(self, user, scope):
        return [item["id"] for item in self.ok(user, f"{URL}?scope={scope}")["items"]]

    def decide(self, user, rec):
        return {
            "dismiss": self.post(user, f"{URL}{rec.pk}/dismiss/", {"reason": "not_relevant"}),
            "assign": self.post(user, f"{URL}{rec.pk}/assign/", {"assignee_id": self.csm.pk}),
        }

    def test_an_open_draft_recommendation_is_listed_only_for_its_sources_readers(self):
        rec = self.draft_rec()
        for user in (self.mona, self.admin):
            for scope in ("team", "me"):
                with self.subTest(user=user.name, scope=scope):
                    self.assertNotIn(rec.pk, self.ids(user, scope))
        for route, response in self.decide(self.admin, rec).items():
            with self.subTest(route=route):
                self.assertEqual(response.status_code, 404)
                self.assertNotIn("Ann Lee", str(response.data))
        # Carl adds the email to Revenact: Mona now reads its source.
        share(self.mail)
        self.assertIn(rec.pk, self.ids(self.mona, "team"))
        self.assertIn(rec.pk, self.ids(self.mona, "me"))

    def test_a_retired_draft_recommendation_reads_as_missing_to_anyone_else(self):
        rec = self.draft_rec(retired=True)
        for user in (self.admin, self.mona):
            for route, response in self.decide(user, rec).items():
                with self.subTest(user=user.name, route=route):
                    self.assertEqual(response.status_code, 404)
                    self.assertNotIn("recommendation", response.data)
                    self.assertNotIn("Ann Lee", str(response.data))
        # Once Mona reads its source (Carl added it), she is told it was decided.
        share(self.mail)
        response = self.decide(self.mona, rec)["dismiss"]
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["recommendation"]["dismiss_reason"], "retired")

    def test_the_feedback_log_never_copies_a_draft(self):
        deciding.reject(self.csm, self.email_action.pk, note="Not yet")
        entry = Feedback.objects.get(subject_id=self.email_action.pk)
        self.assertEqual(entry.subject_label, "A draft reply")
        self.assertEqual(entry.before, {"kind": "draft.reply", "action": None, "rationale": ""})
        # A person's note on a draft may quote the mail too: the log keeps
        # the decision, never the note.
        self.assertEqual(entry.note, "")


class DraftRoutingTests(RecommendFixture):
    """A draft reply is routed to, and named for, only a reader of its
    source: never through a manager or a view-all fallback who is not."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.email_action = draft_action(cls.org, cls.mail)

    def test_the_notice_never_names_a_draft_its_recipient_may_not_read(self):
        from services.work.recommend import waiting_message

        rec = self.make_rec(
            "agent_action",
            on=self.pizza,
            recipient=self.admin,
            title="Reply to Ann Lee",
            agent_action=self.email_action,
        )
        message = waiting_message(self.admin, [rec])
        self.assertNotIn("Ann Lee", message)
        self.assertEqual(message, "1 task recommended for your team.")
        # Carl's manager doesn't read his mail either (owner-only, 2026-10-17)...
        self.assertNotIn("Ann Lee", waiting_message(self.mona, [rec]))
        # ...until Carl adds it to Revenact.
        share(self.mail)
        self.assertIn("Ann Lee", waiting_message(self.mona, [rec]))
