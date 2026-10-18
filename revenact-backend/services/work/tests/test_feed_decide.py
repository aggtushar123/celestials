"""The decide group's sources (contract §2.2; Agent bundles §10.1): bundles
holding a waiting step on the reader's Me desk, rule reviews and questions
on that desk (Brain's rules, unchanged) and
the reader's own open reply drafts; each listed only on records the reader
may open, the rest counted."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.work.feed_decide import MAKERS, Bundles, draft_title
from services.work.feed_shape import BUNDLE, DRAFT, QUESTION, RULE_REVIEW
from services.work.tests.feed_fixtures import FeedFixture


class DecideSourceTests(FeedFixture):
    def source(self, kind, user):
        return MAKERS[kind](User.objects.get(pk=user.pk))

    def only(self, kind, user):
        rows = self.source(kind, user).page(None, 10)
        self.assertEqual(len(rows), 1, rows)
        return rows[0]

    def steps(self, user, bundle_id):
        response = self.as_user(User.objects.get(pk=user.pk)).get(
            f"/api/v1/agents/bundles/{bundle_id}/"
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["steps"]

    def test_a_bundle(self):
        action = self.proposal(self.pizza)
        bundle = action.bundle
        key, entry = self.only(BUNDLE, self.csm)
        self.assertEqual(key, (bundle.created_at, 1, bundle.pk))
        self.assertEqual(
            {
                k: entry[k]
                for k in (
                    "key",
                    "kind",
                    "id",
                    "title",
                    "record",
                    "from",
                    "actions",
                    "due_date",
                    "private",
                )
            },
            {
                "key": f"bundle:{bundle.pk}",
                "kind": "bundle",
                "id": bundle.pk,
                "title": "Save play",
                "record": {
                    "type": "customer",
                    "id": self.pizza.pk,
                    "name": "Pizza Hut",
                    "can_open": True,
                },
                "from": {"type": "agent", "label": "Ops agent"},
                "actions": ["open"],
                "due_date": None,
                "private": False,
            },
        )
        self.assertIs(entry["detail"]["can_run"], True)
        self.assertEqual([step["id"] for step in self.steps(self.csm, bundle.pk)], [action.pk])
        source = self.source(BUNDLE, self.csm)
        self.assertEqual((source.count(), source.hidden()), (1, 0))

    def test_a_bundle_the_reader_sees_but_may_not_run_is_read_only(self):
        session = self.session(self.other, self.csm)
        action = self.proposal(self.taco, session=session)
        _key, entry = self.only(BUNDLE, self.csm)
        self.assertEqual(entry["actions"], ["open"])
        self.assertIs(entry["detail"]["can_run"], False)
        (step,) = self.steps(self.csm, action.bundle_id)
        self.assertEqual((step["id"], step["can_run"]), (action.pk, False))

    def test_a_rule_review(self):
        review = self.review(self.csm)
        key, entry = self.only(RULE_REVIEW, self.csm)
        self.assertEqual(key, (review.created_at, 0, review.pk))
        self.assertEqual(
            (entry["key"], entry["title"], entry["record"], entry["from"], entry["actions"]),
            (
                f"rule_review:{review.pk}",
                "Survey from Detractor follow-up",
                None,
                {"type": "rule", "label": "Detractor follow-up"},
                ["approve", "skip"],
            ),
        )
        self.assertEqual(entry["detail"]["review"]["id"], review.pk)
        self.assertEqual(entry["detail"]["counts"], {"people": 12, "records": 3})
        self.assertEqual(self.source(RULE_REVIEW, self.mona).count(), 0)

    def test_a_question(self):
        question = self.question(self.csm, customer=self.pizza, text="Who signs off renewals?")
        key, entry = self.only(QUESTION, self.csm)
        self.assertEqual(key, (question.created_at, 2, question.pk))
        self.assertEqual(
            (entry["title"], entry["record"]["id"], entry["from"], entry["actions"]),
            (
                "Who signs off renewals?",
                self.pizza.pk,
                {"type": "person", "label": "Alice Admin"},
                ["answer"],
            ),
        )
        self.assertEqual(
            entry["detail"],
            {
                "text": "Who signs off renewals?",
                "asked_by": {"id": self.admin.pk, "name": "Alice Admin"},
            },
        )

    def test_a_question_asked_of_the_reader_opens_its_record_to_them(self):
        # Being asked about a customer is a way in (customers.scoping's
        # knowledge rule), so a question on the Me desk is never hidden.
        self.question(self.csm, customer=self.soup)
        source = self.source(QUESTION, self.csm)
        self.assertEqual((source.count(), source.hidden()), (1, 0))
        self.assertEqual(source.page(None, 10)[0][1]["record"]["id"], self.soup.pk)

    def test_a_draft(self):
        draft = self.reply(self.csm, self.pizza)
        key, entry = self.only(DRAFT, self.csm)
        self.assertEqual(key, (draft.created_at, 3, draft.pk))
        self.assertEqual(
            (entry["key"], entry["title"], entry["from"], entry["actions"], entry["detail"]),
            (
                f"draft:{draft.pk}",
                f"Reply on {draft.ticket.ticket_number}",
                {"type": "agent", "label": "CS agent"},
                ["open"],
                {"channel": "ticket"},
            ),
        )

    def test_only_the_readers_own_drafts_on_records_they_open(self):
        self.reply(self.mona, self.soup)
        self.reply(self.csm, self.soup)
        source = self.source(DRAFT, self.csm)
        self.assertEqual((source.count(), source.hidden()), (0, 1))
        self.assertEqual(self.source(DRAFT, self.mona).count(), 1)

    def test_a_sent_draft_is_done(self):
        draft = self.reply(self.csm, self.pizza)
        type(draft).objects.filter(pk=draft.pk).update(status="sent")
        self.assertEqual(self.source(DRAFT, self.csm).count(), 0)

    def test_an_email_drafts_title_is_its_subject(self):
        draft = self.reply(self.csm, self.pizza)
        draft.channel, draft.subject = "email", "Re: Renewal"
        self.assertEqual(draft_title(draft), "Re: Renewal")
        draft.subject = ""
        self.assertEqual(draft_title(draft), "Reply to an email")

    def test_paging_breaks_a_tie_on_time_by_kind_rank(self):
        review = self.review(self.csm)
        question = self.question(self.csm, customer=self.pizza)
        type(question).objects.filter(pk=question.pk).update(created_at=review.created_at)
        reviews = self.source(RULE_REVIEW, self.csm)
        questions = self.source(QUESTION, self.csm)
        at = review.created_at
        # After the review: the question (rank 2) at the same moment is still to come.
        self.assertEqual(len(questions.page((at, 0, review.pk), 10)), 1)
        # After the question: the review (rank 0) at the same moment is already shown.
        self.assertEqual(reviews.page((at, 2, question.pk), 10), [])

    def test_ranks(self):
        self.assertEqual(
            [MAKERS[k].rank for k in (RULE_REVIEW, BUNDLE, QUESTION, DRAFT)], [0, 1, 2, 3]
        )
        self.assertIs(MAKERS[BUNDLE], Bundles)


class DecidePageQueryTests(FeedFixture):
    """A page reads a fixed number of times, however many rows it shows."""

    def queries(self, kind, user):
        reader = User.objects.get(pk=user.pk)
        source = MAKERS[kind](reader)
        with CaptureQueriesContext(connection) as captured:
            rows = source.page(None, 50)
        return len(rows), len(captured)

    def grows(self, kind, user, make):
        make()
        one = self.queries(kind, user)
        make()
        make()
        three = self.queries(kind, user)
        self.assertEqual((one[0], three[0]), (1, 3))
        self.assertEqual(one[1], three[1])

    def test_rule_reviews(self):
        self.grows(RULE_REVIEW, self.csm, lambda: self.review(self.csm, kind="campaign"))

    def test_bundles(self):
        # Mona decides as Carl's manager: the chain is read once, not per row.
        session = self.session(self.csm, self.mona)
        self.grows(BUNDLE, self.mona, lambda: self.proposal(self.pizza, session=session))

    def test_questions(self):
        self.grows(QUESTION, self.csm, lambda: self.question(self.csm, customer=self.pizza))

    def test_drafts(self):
        self.grows(DRAFT, self.csm, lambda: self.reply(self.csm, self.pizza))
