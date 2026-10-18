"""A rule night may hold one review of each kind (campaigns spec §1.8):
`RuleReview.kind` and `run` as a foreign key unique on (run, kind). Reads,
audit and the owner's one notice per night cover both kinds."""

from datetime import timedelta
from unittest import mock

from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.accounts.models import User
from services.notifications.models import Notification
from services.rules import nightly, reviews, views
from services.rules.models import Rule, RuleReview, RuleRun
from services.rules.tests.fixtures import SURVEY, RuleFixture

CAMPAIGN = {"action": "campaign", "campaign": 1, "without_review": False}
URL = "/api/v1/rules/"


class KindFixture(RuleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.rule = cls.make_rule()
        # "the_run", not "run": `cls.run` in setUpTestData shadows
        # unittest.TestCase.run on this Django/Python combo and crashes the
        # whole test class ("'RuleRun' object is not callable").
        cls.the_run = RuleRun.objects.create(rule=cls.rule, run_on=cls.today, started_at=cls.now)

    def review(self, kind="survey", **fields):
        fields.setdefault("action", SURVEY if kind == "survey" else CAMPAIGN)
        return RuleReview.objects.create(
            rule=self.rule, run=self.the_run, kind=kind, records=[], **fields
        )

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client


class KindModelTests(KindFixture):
    def test_old_reviews_are_surveys_and_a_night_holds_one_of_each(self):
        survey = RuleReview.objects.create(
            rule=self.rule, run=self.the_run, action=SURVEY, records=[]
        )
        self.assertEqual(survey.kind, "survey")
        campaign = self.review("campaign")
        self.assertEqual(set(self.the_run.reviews.all()), {survey, campaign})
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.review("campaign")


class KindReadingTests(KindFixture):
    def test_a_nights_row_names_both_reviews_survey_first(self):
        campaign = self.review("campaign")
        survey = self.review("survey", status="skipped")
        (row,) = self.api(self.csm).get(f"{URL}{self.rule.pk}/runs/").data["results"]
        self.assertEqual(row["review"], {"id": survey.pk, "status": "skipped"})
        self.assertEqual(
            row["reviews"],
            [
                {"id": survey.pk, "kind": "survey", "status": "skipped"},
                {"id": campaign.pk, "kind": "campaign", "status": "waiting"},
            ],
        )

    def test_the_nights_read_in_a_fixed_number_of_queries_however_many_reviews(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                response = self.api(self.csm).get(f"{URL}{self.rule.pk}/runs/")
            self.assertEqual(response.status_code, 200)
            return len(ctx.captured_queries)

        self.review("survey")
        one = count()
        self.review("campaign")
        earlier = RuleRun.objects.create(
            rule=self.rule, run_on=self.today - timedelta(days=1), started_at=self.now
        )
        for kind in ("survey", "campaign"):
            RuleReview.objects.create(
                rule=self.rule, run=earlier, kind=kind, records=[], action=SURVEY
            )
        self.assertEqual(count(), one)

    def test_another_reader_sees_neither(self):
        self.rule.sharing = "workspace"
        self.rule.save(update_fields=["sharing"])
        self.review("campaign")
        (row,) = self.api(self.other).get(f"{URL}{self.rule.pk}/runs/").data["results"]
        self.assertEqual((row["review"], row["reviews"]), (None, []))

    def test_the_last_night_waits_when_any_review_waits(self):
        self.review("survey", status="skipped")
        self.review("campaign")
        data = self.api(self.csm).get(f"{URL}{self.rule.pk}/").data
        self.assertTrue(data["last_run"]["waiting"])

    def test_the_review_list_says_which_kind(self):
        self.review("campaign")
        (item,) = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(item["kind"], "campaign")


class KindNoticeTests(KindFixture):
    def test_the_words(self):
        say = nightly.waiting_message
        self.assertEqual(say(1), "A survey from your rules is waiting for your review.")
        self.assertEqual(say(2), "2 surveys from your rules are waiting for your review.")
        self.assertEqual(say(0, 1), "A campaign from your rules is waiting for your review.")
        self.assertEqual(say(0, 3), "3 campaigns from your rules are waiting for your review.")
        self.assertEqual(say(1, 1), "2 emails from your rules are waiting for your review.")

    def test_one_notice_per_owner_covering_both_kinds(self):
        self.review("survey")
        self.review("campaign")
        self.assertEqual(nightly._tell_owners(None, now=self.now), 0)
        self.assertEqual(
            self.notes(),
            [
                (
                    self.csm.pk,
                    "2 emails from your rules are waiting for your review.",
                    "/work/mine?kind=approval",
                )
            ],
        )

    def notes(self):
        rows = Notification.objects.filter(kind="rule_review").order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))

    def test_campaign_reviews_are_never_sent_as_surveys(self):
        self.review("campaign", action={**CAMPAIGN, "without_review": True})
        self.assertEqual(nightly._unsent(None, today=self.today), [])


class DeletedMidDecisionTests(KindFixture):
    """The rule (and with it the review) deleted after the view found the
    review: a 404, never a 500, for either kind, whether it goes before the
    approval starts or just before the review's lock."""

    def deleted_during(self, module, name):
        real = getattr(module, name)

        def deleting(*args, **kwargs):
            Rule.objects.filter(pk=self.rule.pk).delete()  # its reviews go with it
            return real(*args, **kwargs)

        return mock.patch.object(module, name, deleting)

    def test_approving_answers_404(self):
        for kind in ("survey", "campaign"):
            for module, name in ((views, "send_review"), (reviews, "_locked")):
                with self.subTest(kind=kind, at=name), transaction.atomic():
                    review = self.review(kind)
                    with self.deleted_during(module, name):
                        response = self.api(self.csm).post(f"{URL}reviews/{review.pk}/approve/")
                    self.assertEqual(response.status_code, 404, response.content)
                    transaction.set_rollback(True)

    def test_skipping_answers_404(self):
        review = self.review("survey")
        with self.deleted_during(reviews, "_locked"):
            response = self.api(self.csm).post(f"{URL}reviews/{review.pk}/skip/")
        self.assertEqual(response.status_code, 404, response.content)
