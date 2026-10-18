"""Reading campaigns (spec §1.7, §4): the owner and whoever it is shared with
read; anyone else gets a 404 that reads like a missing campaign. Sharing by
name is a `pk__in` over the through table. Hand-picked recipients, sends'
rules and deliveries are filtered twice: named only to a reader who may open
them, the rest counted."""

from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.campaigns.models import Campaign, CampaignDelivery, empty_counts
from services.campaigns.tests.fixtures import BODY, SUBJECT, CampaignFixture

URL = "/api/v1/campaigns/"


def assert_no_outer_distinct(test, queries):
    """DISTINCT ON (the last send per campaign) is fine; a de-duplicated
    join is not (#86's PG16 cost)."""
    for query in queries:
        sql = query["sql"]
        test.assertFalse(
            sql.startswith("SELECT DISTINCT ") and not sql.startswith("SELECT DISTINCT ON"), sql
        )


class ReadingFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.mine = cls.make_campaign(segment=cls.book)
        cls.shared = cls.make_campaign(name="Shared", segment=cls.book, sharing="workspace")
        cls.named = cls.make_campaign(name="Named", sharing="people")
        cls.named.shared_with.add(cls.other)
        cls.danas = cls.make_campaign(owner=cls.other, name="Dana's")
        cls.old = cls.make_campaign(name="Old", status="archived")
        cls.theirs = Campaign.objects.create(
            organisation=cls.other_org, owner=cls.stranger, name="Theirs"
        )

    def get(self, user, path="", **params):
        return self.api(user).get(f"{URL}{path}", params)


class ListTests(ReadingFixture):
    def names(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        return [row["name"] for row in response.data["results"]]

    def test_mine_is_the_default_tab_newest_first_without_archived(self):
        self.assertEqual(self.names(self.get(self.csm)), ["Named", "Shared", "Win-back"])
        self.assertEqual(
            self.names(self.get(self.csm, tab="nonsense")), ["Named", "Shared", "Win-back"]
        )

    def test_archived_are_added_on_request(self):
        self.assertEqual(
            self.names(self.get(self.csm, archived="1")), ["Old", "Named", "Shared", "Win-back"]
        )

    def test_shared_with_me_is_the_workspace_and_by_name(self):
        self.assertEqual(self.names(self.get(self.other, tab="shared")), ["Named", "Shared"])
        self.assertEqual(self.names(self.get(self.other, tab="mine")), ["Dana's"])
        self.assertEqual(self.names(self.get(self.admin, tab="shared")), ["Shared"])

    def test_another_workspace_sees_none_of_it(self):
        self.assertEqual(self.names(self.get(self.stranger)), ["Theirs"])
        self.assertEqual(self.names(self.get(self.stranger, tab="shared")), [])

    def test_a_row(self):
        send = self.make_send(self.mine, [self.ann])
        row = next(r for r in self.get(self.csm).data["results"] if r["id"] == self.mine.pk)
        self.mine.refresh_from_db()
        self.assertEqual(
            row,
            {
                "id": self.mine.pk,
                "name": "Win-back",
                "status": "draft",
                "segment": {"id": self.book.pk, "name": "My book", "kind": "customer"},
                "roles": ["champion", "decision_maker"],
                "owner": {"id": self.csm.pk, "name": "Carl CSM"},
                "is_owner": True,
                "sharing": "private",
                "shared_with": [],
                "last_send": {
                    "id": send.pk,
                    "finished_at": self.now.isoformat(),
                    "status": "sent",
                    "counts": empty_counts(),
                },
                "needs_segment": False,
                "updated_at": self.mine.updated_at.isoformat(),
                "made_by": None,
            },
        )

    def test_a_shared_reader_sees_the_segment_by_name_only_and_the_teammates(self):
        row = next(
            r for r in self.get(self.other, tab="shared").data["results"] if r["name"] == "Named"
        )
        self.assertEqual((row["is_owner"], row["segment"]), (False, None))
        self.assertEqual(row["shared_with"], [{"id": self.other.pk, "name": "Dana CSM"}])
        row = next(
            r for r in self.get(self.other, tab="shared").data["results"] if r["name"] == "Shared"
        )
        self.assertEqual(row["segment"], {"id": None, "name": "My book", "kind": "customer"})

    def test_a_migrated_draft_needs_a_segment(self):
        legacy = self.make_campaign(name="Legacy")
        legacy.recipients.add(self.ann)
        row = next(r for r in self.get(self.csm).data["results"] if r["name"] == "Legacy")
        self.assertTrue(row["needs_segment"])
        self.assertFalse(
            next(r for r in self.get(self.csm).data["results"] if r["name"] == "Named")[
                "needs_segment"
            ]
        )

    def test_paging(self):
        with mock.patch("services.campaigns.payloads.PAGE_SIZE", 2):
            first = self.get(self.csm).data
            self.assertEqual([r["name"] for r in first["results"]], ["Named", "Shared"])
            second = self.get(self.csm, cursor=first["next"]).data
        self.assertEqual(
            ([r["name"] for r in second["results"]], second["next"]), (["Win-back"], None)
        )
        self.assertIsInstance(first["next"], str)
        for bad in ("x", "e30=", "WzEsMl0=", "WyIyMDI2LTAxLTAxVDAwOjAwOjAwIiwgMV0="):
            self.assertEqual(
                self.names(self.get(self.csm, cursor=bad)), ["Named", "Shared", "Win-back"]
            )

    def test_a_fixed_number_of_queries_and_no_distinct(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.get(self.csm)
            return ctx.captured_queries

        one = len(count())
        for name in ("A", "B", "C"):
            campaign = self.make_campaign(name=name, segment=self.people, sharing="people")
            campaign.shared_with.add(self.other)
            campaign.recipients.add(self.ann)
            self.make_send(campaign, [self.ann])
        queries = count()
        self.assertEqual(len(queries), one)
        assert_no_outer_distinct(self, queries)

    def test_signed_out_is_401(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)


class DetailTests(ReadingFixture):
    def test_the_owner_reads_the_whole_campaign(self):
        data = self.get(self.csm, f"{self.mine.pk}/").data
        self.assertEqual(
            (data["subject"], data["body"], data["legacy_recipients"], data["legacy_hidden"]),
            (SUBJECT, BODY, [], 0),
        )
        self.assertTrue(data["can_delete"])
        self.make_send(self.mine)
        self.assertFalse(self.get(self.csm, f"{self.mine.pk}/").data["can_delete"])

    def test_a_shared_reader_reads_it_but_may_not_delete(self):
        data = self.get(self.other, f"{self.shared.pk}/").data
        self.assertEqual((data["is_owner"], data["can_delete"]), (False, False))

    def test_anyone_else_gets_404(self):
        for user in (self.other, self.stranger):
            self.assertEqual(self.get(user, f"{self.mine.pk}/").status_code, 404)
        self.assertEqual(self.get(self.csm, "999999/").status_code, 404)

    def test_hand_picked_recipients_are_named_only_to_who_may_open_them(self):
        self.shared.recipients.add(self.ann, self.tia)
        carl = self.get(self.csm, f"{self.shared.pk}/").data
        dana = self.get(self.other, f"{self.shared.pk}/").data
        self.assertEqual(
            (carl["legacy_recipients"], carl["legacy_hidden"]),
            ([{"id": self.ann.pk, "name": "Ann"}], 1),
        )
        self.assertEqual(
            (dana["legacy_recipients"], dana["legacy_hidden"]),
            ([{"id": self.tia.pk, "name": "Tia"}], 1),
        )
        self.assertNotIn("ann@example.com", str(dana))

    def test_the_campaign_is_read_once(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.get(self.other, f"{self.shared.pk}/")
        self.assertEqual(response.status_code, 200)
        reads = [
            q["sql"]
            for q in ctx.captured_queries
            if q["sql"].startswith("SELECT") and 'FROM "campaigns_campaign" ' in q["sql"]
        ]
        self.assertEqual(len(reads), 1, reads)
        assert_no_outer_distinct(self, ctx.captured_queries)

    def test_the_old_send_route_is_gone(self):
        response = self.api(self.csm).post(f"{URL}{self.mine.pk}/send/")
        self.assertEqual(response.status_code, 404)


class SendReadingTests(ReadingFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.rule = cls.make_rule()
        cls.send = cls.make_send(
            cls.shared, [cls.ann, cls.ben, cls.tia], kind="rule", rule=cls.rule, sent_by=None
        )
        CampaignDelivery.objects.filter(send=cls.send, contact=cls.ben).update(
            status="skipped", reason="no_email", sent_at=None
        )

    def test_the_sends_newest_first(self):
        manual = self.make_send(self.shared, sent_by=self.csm)
        data = self.get(self.csm, f"{self.shared.pk}/sends/").data
        self.assertEqual([row["id"] for row in data["results"]], [manual.pk, self.send.pk])
        self.assertEqual(data["next"], None)
        row = data["results"][1]
        self.assertEqual(
            row,
            {
                "id": self.send.pk,
                "kind": "rule",
                "status": "sent",
                "migrated": False,
                "sent_by": None,
                "rule": {"id": self.rule.pk, "name": "Renewal watch"},
                "started_at": self.now.isoformat(),
                "finished_at": self.now.isoformat(),
                "subject": SUBJECT,
                "body": BODY,
                "counts": empty_counts(),
            },
        )
        self.assertEqual(data["results"][0]["sent_by"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_reading_sends_takes_a_fixed_number_of_queries_and_no_distinct(self):
        path = f"{self.shared.pk}/sends/"

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.get(self.other, path)
            return ctx.captured_queries

        one = count()
        assert_no_outer_distinct(self, one)
        self.make_send(self.shared, sent_by=self.csm)
        self.make_send(self.shared, kind="rule", rule=self.make_rule(name="Other"), sent_by=None)
        two = count()
        self.assertEqual(len(two), len(one))
        assert_no_outer_distinct(self, two)

    def test_a_rule_the_reader_may_not_read_is_a_rule(self):
        data = self.get(self.other, f"{self.shared.pk}/sends/{self.send.pk}/").data
        self.assertEqual(data["rule"], {"id": None, "name": "a rule"})

    def test_a_deleted_rule_is_none(self):
        send = self.make_send(self.shared, kind="rule")
        self.assertIsNone(self.get(self.csm, f"{self.shared.pk}/sends/{send.pk}/").data["rule"])

    def test_a_send_of_another_campaign_is_404(self):
        self.assertEqual(
            self.get(self.csm, f"{self.mine.pk}/sends/{self.send.pk}/").status_code, 404
        )
        self.assertEqual(self.get(self.stranger, f"{self.shared.pk}/sends/").status_code, 404)

    def test_deliveries_are_filtered_twice(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"
        carl = self.get(self.csm, path).data
        self.assertEqual(
            carl["results"],
            [
                {
                    "id": self.send.deliveries.get(contact=self.ann).pk,
                    "status": "sent",
                    "reason": "",
                    "contact": {"id": self.ann.pk, "name": "Ann"},
                    "record": {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"},
                    "sent_at": self.now.isoformat(),
                },
                {
                    "id": self.send.deliveries.get(contact=self.ben).pk,
                    "status": "skipped",
                    "reason": "no_email",
                    "contact": {"id": self.ben.pk, "name": "Ben"},
                    "record": {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"},
                    "sent_at": None,
                },
            ],
        )
        self.assertEqual((carl["hidden"], carl["next"]), (1, None))
        dana = self.get(self.other, path).data
        self.assertEqual(
            ([r["contact"]["name"] for r in dana["results"]], dana["hidden"]), (["Tia"], 2)
        )

    def test_deliveries_filter_by_status_and_reason(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"
        sent = self.get(self.csm, path, status="sent").data
        self.assertEqual(
            ([r["contact"]["name"] for r in sent["results"]], sent["hidden"]), (["Ann"], 1)
        )
        skipped = self.get(self.csm, path, status="skipped", reason="no_email").data
        self.assertEqual([r["contact"]["name"] for r in skipped["results"]], ["Ben"])
        self.assertEqual(skipped["hidden"], 0)
        ignored = self.get(self.csm, path, status="bogus", reason="bogus").data
        self.assertEqual(len(ignored["results"]), 2)

    def test_deliveries_page(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"
        with mock.patch("services.campaigns.payloads.DELIVERY_PAGE", 1):
            first = self.get(self.csm, path).data
            second = self.get(self.csm, path, cursor=first["next"]).data
        self.assertEqual(
            ([r["contact"]["name"] for r in first["results"] + second["results"]], second["next"]),
            (["Ann", "Ben"], None),
        )

    def test_reading_deliveries_takes_a_fixed_number_of_queries_and_no_distinct(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.get(self.csm, path)
            return ctx.captured_queries

        one = count()
        assert_no_outer_distinct(self, one)
        CampaignDelivery.objects.create(
            send=self.send, contact=self.dot, status="sent", sent_at=self.now
        )
        two = count()
        self.assertEqual(len(two), len(one))
        assert_no_outer_distinct(self, two)
