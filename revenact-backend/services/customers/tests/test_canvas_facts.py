"""A map as the reader sees it (spec §1.3): each person's facts under the
reader's rules, hidden and removed people, the tray, the record's open plans
and the delete rule, in a query count that does not grow with the map."""

import json
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.customers.canvas_payloads import DETAIL_RELATED, canvas_payload
from services.customers.models import Call, Canvas, Contact
from services.customers.tests.canvas_fixtures import CanvasFixture
from services.plans.models import Plan
from services.plans.payloads import plan_rows
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.tests.fixtures import contact


class CanvasFactsFixture(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.called = cls.now - timedelta(days=12)
        for at, people in (
            (cls.called, [cls.ann]),
            (cls.now + timedelta(days=3), [cls.ann, cls.cal]),
        ):
            call = Call.objects.create(
                customer=cls.pizza, title="QBR", host_name="Carl", occurred_at=at
            )
            call.participants.add(*people)
        cls.mailed = cls.now - timedelta(days=2)
        cls.mail(
            cls.emea, cls.mailed, from_address="carl@acme.io", to_addresses=["ben@example.com"]
        )
        cls.mail(cls.globex, cls.now - timedelta(hours=1), from_address="ben@example.com")
        cls.carls_mail = cls.now - timedelta(days=1)
        cls.mail(cls.pizza, cls.carls_mail, from_address="CAL@example.com", mailbox_owner=cls.csm)
        Contact.objects.filter(pk=cls.cal.pk).update(campaigns_unsubscribed_at=cls.now)
        Contact.objects.filter(pk=cls.ben.pk).update(sentiment=Contact.Sentiment.POSITIVE)
        cls.answered(cls.make_send(survey_type="nps"), cls.ann, 9, days_ago=1)
        cls.answered(cls.make_send(survey_type="csat", name="CSAT"), cls.ann, 4, days_ago=5)
        gone = contact(cls.pizza, "Gone")
        cls.gone_id = gone.pk
        gone.delete()
        cls.removed = {
            "id": "gone",
            "position": {"x": 0, "y": 320},
            "data": {"contact_id": cls.gone_id},
        }
        cls.map = cls.make_canvas(
            people=[cls.ann, cls.ben, cls.cal],
            extra=[cls.removed],
            lines=[cls.line(cls.ben, cls.ann)],
            created_by=cls.csm,
        )
        cls.taco_map = cls.make_canvas(
            cls.taco, [cls.tia, cls.tom, cls.eve], name="Taco map", created_by=cls.other
        )

    def payload(self, user=None, canvas=None):
        canvas = Canvas.objects.select_related(*DETAIL_RELATED).get(pk=(canvas or self.map).pk)
        return canvas_payload(canvas, user or self.csm, now=self.now, today=self.today)


class PersonFactsTests(CanvasFactsFixture):
    def test_each_persons_facts(self):
        people = self.payload()["people_by_contact"]
        self.assertEqual(
            people[str(self.ann.pk)],
            {
                "name": "Ann",
                "role": "champion",
                "role_display": "Champion",
                "sentiment": "neutral",
                "sentiment_label": "Neutral",
                "last_contacted_at": self.called.isoformat(),
                "latest_survey": {
                    "type": "nps",
                    "score": 9,
                    "answered_at": (self.now - timedelta(days=1)).isoformat(),
                },
                "campaigns_unsubscribed": False,
            },
        )
        ben, cal = people[str(self.ben.pk)], people[str(self.cal.pk)]
        self.assertEqual(
            (
                ben["sentiment"],
                ben["sentiment_label"],
                ben["last_contacted_at"],
                ben["latest_survey"],
            ),
            ("positive", "Positive", self.mailed.isoformat(), None),
        )
        self.assertEqual(
            (
                cal["role"],
                cal["role_display"],
                cal["last_contacted_at"],
                cal["campaigns_unsubscribed"],
            ),
            ("economic_buyer", "Economic Buyer", self.carls_mail.isoformat(), True),
        )

    def test_mail_follows_its_mailbox_rule_and_upcoming_calls_do_not_count(self):
        people = self.payload(self.admin)["people_by_contact"]
        self.assertIsNone(people[str(self.cal.pk)]["last_contacted_at"])
        self.assertEqual(people[str(self.ann.pk)]["last_contacted_at"], self.called.isoformat())

    def test_latest_survey_requires_reading_the_send_too(self):
        """Ann's nps send is Carl's own, private send. Mona may open Pizza
        Hut through Carl (her report) but may not read a send she neither
        owns nor is shared on, so she sees no score for Ann at all."""
        people = self.payload(self.mona)["people_by_contact"]
        self.assertIsNone(people[str(self.ann.pk)]["latest_survey"])

    def test_latest_survey_shows_once_the_reader_may_read_the_send(self):
        SurveySend.objects.filter(survey_type="nps").update(sharing=SurveySend.Sharing.WORKSPACE)
        people = self.payload(self.mona)["people_by_contact"]
        self.assertEqual(people[str(self.ann.pk)]["latest_survey"]["score"], 9)

    def test_an_answer_on_a_record_the_reader_cannot_open_is_never_used(self):
        """A newer answer whose invite's own record is Taco West's — an
        account Carl may not open (unlike Taco Bell itself, which he may
        open through Taco East) — never wins over Ann's own, visible nps
        answer, even though it is the most recent answer on file."""
        hidden = self.answered(
            self.make_send(survey_type="csat", name="Hidden"), self.ann, 1, days_ago=0
        )
        SurveyInvite.objects.filter(pk=hidden.pk).update(customer_id=None, account_id=self.west.pk)
        survey = self.payload()["people_by_contact"][str(self.ann.pk)]["latest_survey"]
        self.assertEqual(
            survey,
            {"type": "nps", "score": 9, "answered_at": (self.now - timedelta(days=1)).isoformat()},
        )

    def test_a_deleted_person_is_removed(self):
        body = self.payload()
        self.assertEqual(body["removed"], ["gone"])
        self.assertNotIn(str(self.gone_id), body["people_by_contact"])
        self.assertEqual((body["people"], len(body["nodes"]), body["hidden"]), (4, 4, []))

    def test_a_person_the_reader_may_not_open_is_hidden_and_nameless(self):
        body = self.payload(self.csm, self.taco_map)
        self.assertEqual(body["hidden"], [f"c{self.tom.pk}"])
        self.assertEqual(set(body["people_by_contact"]), {str(self.tia.pk), str(self.eve.pk)})
        self.assertNotIn("Tom", json.dumps(body))
        self.assertEqual(self.payload(self.other, self.taco_map)["hidden"], [])

    def test_a_foreign_tenants_contact_is_removed_not_hidden(self):
        """An old map stored any contact id unvalidated. One belonging to
        another tenant altogether exists in the database but is outside the
        reader's own organisation, not merely outside what they may open —
        it must read as removed, the same as a deleted contact, never as
        hidden (which would confirm some record of the reader's own
        organisation holds this person)."""
        foreign = contact(self.globex, "Gia")
        canvas = self.make_canvas(
            extra=[
                {"id": "foreign", "position": {"x": 0, "y": 0}, "data": {"contact_id": foreign.pk}}
            ]
        )
        body = self.payload(self.csm, canvas)
        self.assertEqual(body["removed"], ["foreign"])
        self.assertEqual(body["hidden"], [])
        self.assertNotIn(str(foreign.pk), body["people_by_contact"])


class MapPayloadTests(CanvasFactsFixture):
    def test_the_whole_map(self):
        body = self.payload()
        self.assertEqual(
            set(body),
            {
                "id",
                "name",
                "record",
                "people",
                "updated_at",
                "updated_by",
                "made_by",
                "version",
                "nodes",
                "edges",
                "people_by_contact",
                "hidden",
                "removed",
                "not_on_map",
                "open_plans",
                "can_delete",
                "created_by",
            },
        )
        self.assertEqual(
            body["record"], {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(body["edges"], [self.line(self.ben, self.ann)])
        self.assertEqual(
            (body["version"], body["created_by"], body["updated_by"]),
            (1, {"id": self.csm.pk, "name": "Carl CSM"}, None),
        )

    def test_not_on_map_lists_the_records_people_the_reader_may_open(self):
        lone = self.make_canvas(people=[self.ann], name="Lone")
        self.assertEqual(
            self.payload(canvas=lone)["not_on_map"],
            [
                {
                    "id": self.ben.pk,
                    "name": "Ben",
                    "role": "decision_maker",
                    "role_display": "Decision Maker",
                },
                {
                    "id": self.cal.pk,
                    "name": "Cal",
                    "role": "economic_buyer",
                    "role_display": "Economic Buyer",
                },
            ],
        )
        empty = self.make_canvas(self.taco, name="Empty")
        self.assertEqual(
            [p["name"] for p in self.payload(canvas=empty)["not_on_map"]], ["Eve", "Tia"]
        )
        with patch("services.customers.canvas_payloads.NOT_ON_MAP_LIMIT", 1):
            self.assertEqual(len(self.payload(canvas=lone)["not_on_map"]), 1)

    def test_open_plans_are_the_records_own_open_plans(self):
        open_plan = self.build_plan(self.pizza)
        self.build_plan(self.pizza, status="done", name="Finished")
        account_plan = self.build_plan(self.emea, name="EMEA plan")
        expected = plan_rows(
            Plan.objects.filter(pk=open_plan.pk).select_related("customer", "account", "owner"),
            self.csm,
            today=self.today,
        )
        self.assertEqual(self.payload()["open_plans"], expected)
        emea_map = self.make_canvas(self.emea, [self.ben], name="EMEA map")
        self.assertEqual(
            [r["id"] for r in self.payload(canvas=emea_map)["open_plans"]], [account_plan.pk]
        )

    def test_the_creator_and_their_managers_may_delete(self):
        for user, allowed in ((self.csm, True), (self.mona, True), (self.admin, False)):
            with self.subTest(user=user.name):
                self.assertEqual(self.payload(user)["can_delete"], allowed)
        legacy = self.make_canvas(name="Old")
        self.assertTrue(self.payload(self.admin, legacy)["can_delete"])

    def test_the_queries_do_not_grow_with_the_people_on_the_map(self):
        small = self.make_canvas(people=[self.ann], name="Small", created_by=self.csm)
        self.payload(canvas=small)  # Carl's chart walk, memoised on the user
        with CaptureQueriesContext(connection) as one:
            self.payload(canvas=small)
        with CaptureQueriesContext(connection) as many:
            self.payload(canvas=self.map)
        self.assertEqual(len(one), len(many))
        canvas_sql = [q["sql"] for q in many.captured_queries if "customers_canvas" in q["sql"]]
        self.assertTrue(canvas_sql)
        self.assertFalse([sql for sql in canvas_sql if "DISTINCT" in sql.upper()])
        survey_sql = [q["sql"] for q in many.captured_queries if "surveys_surveyinvite" in q["sql"]]
        self.assertEqual(len(survey_sql), 1)
