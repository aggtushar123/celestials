"""Reading a send's answers and who has not answered: rows only for people
the reader may open, a count for the rest, filters, a keyset cursor, and
the same 404 for a send the reader may not see."""

from datetime import timedelta
from unittest.mock import patch

from rest_framework.test import APIClient

from services.surveys.models import SurveyInvite
from services.surveys.tests.fixtures import SurveyFixture, contact

URL = "/api/v1/surveys/sends/{}/{}/"


class ReadingFixture(SurveyFixture):
    """Alice's workspace NPS send: Ben answered 3 a day ago, Ann 10 ("Love
    it") two days ago, Tia 0 ("Slow") three days ago. Tom's link expired
    unanswered; Una's email (Pizza Hut) failed. Carl may open Ann, Ben and
    Una; Tia and Tom are Dana's."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.send = cls.make_send(
            owner=cls.admin, sharing="workspace", status="sent", started_at=cls.now, sent_at=cls.now
        )
        cls.ben_answer = cls.answered(cls.send, cls.ben, 3, days_ago=1)
        cls.ann_answer = cls.answered(cls.send, cls.ann, 10, days_ago=2, comment="Love it")
        cls.tia_answer = cls.answered(cls.send, cls.tia, 0, days_ago=3, comment="Slow")
        cls.tom_invite = cls.make_invite(cls.send, cls.tom, expires_at=cls.now - timedelta(days=1))
        cls.una = contact(cls.pizza, "Una")
        cls.una_invite = cls.make_invite(cls.send, cls.una, status="failed", failure="mailbox full")
        cls.private = cls.make_send(owner=cls.admin)

    def read(self, user, what, send=None, **query):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(URL.format((send or self.send).pk, what), query)

    def names(self, body):
        return [row["contact"]["name"] if row["contact"] else None for row in body["results"]]


class AnswersTests(ReadingFixture):
    def test_the_owner_reads_every_answer_newest_first(self):
        body = self.read(self.admin, "answers").data
        self.assertEqual(
            (self.names(body), body["hidden_count"], body["filter"]),
            (["Ben", "Ann", "Tia"], 0, "all"),
        )
        self.assertEqual(
            body["results"][0],
            {
                "id": self.ben_answer.pk,
                "contact": {"id": self.ben.pk, "name": "Ben"},
                "record": {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"},
                "score": 3,
                "band": "detractors",
                "comment": "",
                "answered_at": self.ben_answer.answered_at.isoformat(),
            },
        )

    def test_a_shared_reader_reads_only_people_they_may_open(self):
        body = self.read(self.csm, "answers").data
        self.assertEqual((self.names(body), body["hidden_count"]), (["Ben", "Ann"], 1))

    def test_the_filters(self):
        detractors = self.read(self.admin, "answers", filter="detractors").data
        self.assertEqual(self.names(detractors), ["Ben", "Tia"])
        comments = self.read(self.csm, "answers", filter="comments").data
        self.assertEqual((self.names(comments), comments["hidden_count"]), (["Ann"], 1))
        unknown = self.read(self.admin, "answers", filter="everything").data
        self.assertEqual((unknown["filter"], len(unknown["results"])), ("all", 3))

    def test_hidden_count_is_the_same_whatever_the_filter(self):
        """Tia (hidden from Carl) answered 0 with a comment. A per-filter
        count would tell Carl her band; one unfiltered count tells nothing."""
        counts = {
            choice: self.read(self.csm, "answers", filter=choice).data["hidden_count"]
            for choice in ("all", "detractors", "comments")
        }
        self.assertEqual(counts, {"all": 1, "detractors": 1, "comments": 1})
        # Without her comment, the comments filter must still say 1.
        SurveyInvite.objects.filter(pk=self.tia_answer.pk).update(comment="")
        uncommented = self.read(self.csm, "answers", filter="comments").data
        self.assertEqual(uncommented["hidden_count"], 1)

    def test_an_answer_whose_contact_was_deleted_stays_unnamed(self):
        self.ann.delete()
        body = self.read(self.csm, "answers").data
        self.assertEqual(self.names(body), ["Ben", None])
        self.assertEqual(
            body["results"][1]["record"],
            {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
        )

    def test_pages_follow_an_opaque_cursor(self):
        with patch("services.surveys.answers.PAGE_SIZE", 2):
            first = self.read(self.admin, "answers").data
            second = self.read(self.admin, "answers", cursor=first["next_cursor"]).data
            broken = self.read(self.admin, "answers", cursor="not!base64").data
        self.assertEqual((self.names(first), self.names(second)), (["Ben", "Ann"], ["Tia"]))
        self.assertIsNone(second["next_cursor"])
        self.assertNotIn("/", first["next_cursor"])
        self.assertEqual(self.names(broken), ["Ben", "Ann"])


class PendingTests(ReadingFixture):
    def test_the_owner_sees_who_has_not_answered_and_why(self):
        body = self.read(self.admin, "pending").data
        self.assertEqual(body["hidden_count"], 0)
        rows = {row["contact"]["name"]: row for row in body["results"]}
        self.assertEqual(set(rows), {"Tom", "Una"})
        self.assertEqual(
            rows["Tom"],
            {
                "id": self.tom_invite.pk,
                "contact": {"id": self.tom.pk, "name": "Tom"},
                "record": {"kind": "account", "id": self.west.pk, "name": "Taco West"},
                "status": "expired",
                "expires_at": self.tom_invite.expires_at.isoformat(),
                "failure": None,
            },
        )
        self.assertEqual(
            (rows["Una"]["status"], rows["Una"]["failure"]), ("failed", "mailbox full")
        )
        self.assertNotIn("email", rows["Una"])

    def test_a_shared_reader_sees_only_people_they_may_open(self):
        body = self.read(self.csm, "pending").data
        self.assertEqual(
            ([row["contact"]["name"] for row in body["results"]], body["hidden_count"]),
            (["Una"], 1),
        )


class ReadingAccessTests(ReadingFixture):
    def test_a_send_the_reader_may_not_see_is_404(self):
        for what in ("answers", "pending"):
            self.assertEqual(self.read(self.csm, what, send=self.private).status_code, 404)
            self.assertEqual(APIClient().get(URL.format(self.send.pk, what)).status_code, 401)
