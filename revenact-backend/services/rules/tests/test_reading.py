"""Reading a rule's nights twice filtered: the owner reads each night's own
counts, anyone else only the records they may open now plus a count; a
night's records likewise. Then the owner's reviews: list, approve (the
survey or Surveys' refusal), skip, and 409 once decided."""

from datetime import timedelta

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.accounts.models import User
from services.customers.models import Customer
from services.rules.models import RuleReview, RuleRun, RuleRunRecord
from services.rules.reviews import RULE_CHANGED, create_review
from services.rules.tests.fixtures import NOTIFY_ME, SURVEY, RuleFixture
from services.surveys.models import SurveySend
from services.surveys.sending import CONSOLE_BACKEND, EMAIL_NOT_SET_UP

URL = "/api/v1/rules/"
SKIPS = {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0, "nobody": 0}
DONE = [{"action": "notify", "status": "done", "detail": ""}]


class ReadingFixture(RuleFixture):
    """Alice's shared rule on Pizza Hut (Carl's) and Taco Bell (Dana's), and
    last night's run, which fired on both."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        everyone = cls.pinned("customer", [cls.pizza, cls.taco], owner=cls.admin, name="Everyone")
        cls.rule = cls.make_rule(owner=cls.admin, segment=everyone, sharing="workspace")
        # "the_run", not "run": `cls.run` in setUpTestData shadows
        # unittest.TestCase.run on this Django/Python combo and crashes the
        # whole test class ("'RuleRun' object is not callable").
        cls.the_run = cls.night(cls.rule, cls.today, [cls.pizza, cls.taco])

    @classmethod
    def night(cls, rule, day, records):
        run = RuleRun.objects.create(
            rule=rule, run_on=day, started_at=cls.now, matched=len(records), fired=len(records)
        )
        RuleRunRecord.objects.bulk_create(
            [
                RuleRunRecord(
                    run=run,
                    record_kind="customer",
                    record_id=record.pk,
                    outcome="fired",
                    actions=DONE,
                )
                for record in records
            ]
        )
        return run

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client


class RunsTests(ReadingFixture):
    def runs(self, user, **query):
        return self.api(user).get(f"{URL}{self.rule.pk}/runs/", query)

    def test_the_owner_reads_each_nights_own_counts(self):
        data = self.runs(self.admin).data
        self.assertEqual(
            data,
            {
                "results": [
                    {
                        "id": self.the_run.pk,
                        "run_on": self.today.isoformat(),
                        "matched": 2,
                        "fired": 2,
                        "skipped": SKIPS,
                        "review": None,
                        "reviews": [],
                        "hidden_count": 0,
                        "started_at": self.now.isoformat(),
                        "finished_at": None,
                    }
                ],
                "next": None,
            },
        )

    def test_a_reader_reads_only_what_they_may_open_plus_a_count(self):
        (row,) = self.runs(self.csm).data["results"]
        self.assertEqual(
            (row["matched"], row["fired"], row["skipped"], row["review"], row["hidden_count"]),
            (None, 1, None, None, 1),
        )

    def test_unreadable_is_404(self):
        self.assertEqual(self.runs(self.stranger).status_code, 404)

    def test_the_owner_sees_the_nights_review(self):
        review = RuleReview.objects.create(
            rule=self.rule, run=self.the_run, action=SURVEY, records=[]
        )
        (row,) = self.runs(self.admin).data["results"]
        self.assertEqual(row["review"], {"id": review.pk, "status": "waiting"})
        (row,) = self.runs(self.csm).data["results"]
        self.assertIsNone(row["review"])

    def test_newest_first_twenty_a_page_under_a_cursor(self):
        for days in range(1, 25):
            self.night(self.rule, self.today - timedelta(days=days), [self.pizza])
        first = self.runs(self.admin).data
        self.assertEqual(len(first["results"]), 20)
        self.assertEqual(first["results"][0]["run_on"], self.today.isoformat())
        second = self.runs(self.admin, cursor=first["next"]).data
        self.assertEqual((len(second["results"]), second["next"]), (5, None))
        days = [row["run_on"] for row in first["results"] + second["results"]]
        self.assertEqual(days, sorted(days, reverse=True))
        self.assertEqual(len(set(days)), 25)

    def test_a_malformed_cursor_reads_the_first_page(self):
        for cursor in ("nonsense", "W10=", "WyJ4IiwgMV0="):
            with self.subTest(cursor=cursor):
                data = self.runs(self.admin, cursor=cursor).data
                self.assertEqual(data["results"][0]["id"], self.the_run.pk)

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as one:
            self.runs(self.csm)
        for days in range(1, 4):
            self.night(self.rule, self.today - timedelta(days=days), [self.pizza, self.taco])
        with CaptureQueriesContext(connection) as four:
            self.runs(self.csm)
        self.assertEqual(len(four.captured_queries), len(one.captured_queries))


class RunDetailTests(ReadingFixture):
    def detail(self, user, run=None):
        run = run or self.the_run
        return self.api(user).get(f"{URL}{self.rule.pk}/runs/{run.pk}/")

    def test_the_owner_reads_every_record_by_name(self):
        data = self.detail(self.admin).data
        self.assertEqual(
            data,
            {
                "id": self.the_run.pk,
                "run_on": self.today.isoformat(),
                "records": [
                    {
                        "kind": "customer",
                        "id": self.pizza.pk,
                        "name": "Pizza Hut",
                        "outcome": "fired",
                        "reason": "",
                        "actions": DONE,
                    },
                    {
                        "kind": "customer",
                        "id": self.taco.pk,
                        "name": "Taco Bell",
                        "outcome": "fired",
                        "reason": "",
                        "actions": DONE,
                    },
                ],
                "hidden_count": 0,
            },
        )

    def test_a_reader_reads_only_records_they_may_open_plus_a_count(self):
        data = self.detail(self.csm).data
        self.assertEqual(
            ([record["name"] for record in data["records"]], data["hidden_count"]),
            (["Pizza Hut"], 1),
        )

    def test_a_deleted_record_is_a_count(self):
        Customer.objects.filter(pk=self.taco.pk).delete()
        data = self.detail(self.admin).data
        self.assertEqual((len(data["records"]), data["hidden_count"]), (1, 1))

    def test_a_run_of_another_rule_is_404(self):
        other = self.make_rule(owner=self.admin, name="Other", sharing="workspace")
        theirs = self.night(other, self.today, [self.pizza])
        self.assertEqual(self.detail(self.admin, theirs).status_code, 404)

    def test_it_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as two:
            self.detail(self.csm)
        bigger = self.night(
            self.rule, self.today - timedelta(days=1), [self.pizza, self.taco, self.dough]
        )
        with CaptureQueriesContext(connection) as three:
            self.detail(self.csm, bigger)
        self.assertEqual(len(three.captured_queries), len(two.captured_queries))


class ReviewTests(RuleFixture):
    def setUp(self):
        self.rule = self.make_rule(actions=[SURVEY, NOTIFY_ME])
        self.run = RuleRun.objects.create(rule=self.rule, run_on=self.today, started_at=self.now)
        self.review = create_review(self.rule, self.run, [self.dough.pk], SURVEY, today=self.today)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client

    def decide(self, verb, user=None):
        return self.api(user or self.csm).post(f"{URL}reviews/{self.review.pk}/{verb}/")

    def test_the_owner_lists_their_waiting_reviews(self):
        data = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(
            data,
            [
                {
                    "id": self.review.pk,
                    "kind": "survey",
                    "rule": {
                        "id": self.rule.pk,
                        "name": "Renewal watch",
                        "trigger": "entered",
                        "score": "",
                        "direction": "",
                        "threshold": None,
                        "cadence": "",
                        "weekday": None,
                        "segment": {"id": self.book.pk, "name": "My book", "kind": "customer"},
                    },
                    "run_on": self.today.isoformat(),
                    "action": SURVEY,
                    "counts": {"people": 1, "records": 1},
                    "organisation_name": "Acme Inc",
                    "status": "waiting",
                    "result": {},
                    "created_at": self.review.created_at.isoformat(),
                    "expires_at": self.review.expires_at.isoformat(),
                    "decided_at": None,
                }
            ],
        )

    def test_nobody_else_sees_them(self):
        for user in (self.admin, self.other, self.stranger):
            self.assertEqual(self.api(user).get(f"{URL}reviews/").data, [])

    def test_a_status_filter_and_an_unknown_one_reads_waiting(self):
        self.assertEqual(self.api(self.csm).get(f"{URL}reviews/", {"status": "approved"}).data, [])
        self.assertEqual(len(self.api(self.csm).get(f"{URL}reviews/", {"status": "x"}).data), 1)

    def test_approve_sends_the_survey_and_a_second_decision_is_409(self):
        response = self.decide("approve")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data, {"survey_send_id": SurveySend.objects.get().pk})
        for verb in ("approve", "skip"):
            again = self.decide(verb)
            self.assertEqual(
                (again.status_code, again.data),
                (409, {"detail": "This review has already been decided."}),
            )

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_a_refusal_is_400_and_stored_on_the_item(self):
        response = self.decide("approve")
        self.assertEqual((response.status_code, response.data), (400, {"detail": EMAIL_NOT_SET_UP}))
        (item,) = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(item["result"], {"error": {"detail": EMAIL_NOT_SET_UP}})

    def test_approving_after_the_rule_moved_to_another_kind_is_400_and_expires(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        edit = self.api(self.csm).patch(
            f"{URL}{self.rule.pk}/", {"segment": accounts.pk}, format="json"
        )
        # the edit already expired it, so approving is a decided review
        self.assertEqual(edit.status_code, 200, edit.content)
        self.assertEqual(self.decide("approve").status_code, 409)
        self.assertFalse(SurveySend.objects.exists())

    def test_approving_a_review_whose_records_are_another_kind_is_400(self):
        # an edit that bypassed the API (or raced it): the approve refuses on its own
        accounts = self.pinned("account", [self.emea], name="Accounts")
        type(self.rule).objects.filter(pk=self.rule.pk).update(segment=accounts)
        response = self.decide("approve")
        self.assertEqual((response.status_code, response.data), (400, {"detail": RULE_CHANGED}))
        (item,) = self.api(self.csm).get(f"{URL}reviews/", {"status": "expired"}).data
        self.assertEqual(item["status"], "expired")
        self.assertFalse(SurveySend.objects.exists())

    def test_skip(self):
        response = self.decide("skip")
        self.assertEqual((response.status_code, response.data["status"]), (200, "skipped"))
        self.assertFalse(SurveySend.objects.exists())

    def test_only_the_owner_decides(self):
        for user in (self.admin, self.other, self.stranger):
            for verb in ("approve", "skip"):
                self.assertEqual(self.decide(verb, user).status_code, 404)
        self.assertEqual(APIClient().post(f"{URL}reviews/{self.review.pk}/skip/").status_code, 401)

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as one:
            self.api(self.csm).get(f"{URL}reviews/")
        for days in range(1, 4):
            run = RuleRun.objects.create(
                rule=self.rule, run_on=self.today - timedelta(days=days), started_at=self.now
            )
            create_review(self.rule, run, [self.dough.pk], SURVEY, today=self.today)
        with CaptureQueriesContext(connection) as four:
            rows = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(len(rows), 4)
        self.assertEqual(len(four.captured_queries), len(one.captured_queries))
