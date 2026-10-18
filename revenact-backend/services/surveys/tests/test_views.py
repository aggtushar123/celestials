"""The builder's endpoints: list, create, read, edit and delete a send, and
the audience count. Missing and hidden read the same; only the owner
writes; a shared reader's figures cover only people they may open."""

from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.tests.fixtures import SurveyFixture

URL = "/api/v1/surveys/sends/"
AUDIENCE = URL + "audience/"
NOT_OWNER = {"detail": "Only the survey's owner can change it."}
NOT_SEGMENT_OWNER = {"detail": "You can only survey your own segments."}
LOCKED = "A sent survey can only be renamed or re-shared."
DETAIL_KEYS = {
    "id", "name", "survey_type", "subject", "intro", "segment", "roles", "status", "sharing",
    "shared_with", "owner", "is_owner", "started_at", "sent_at", "counts", "summary",
    "created_at", "updated_at",
}  # fmt: skip
ROW_KEYS = {
    "id", "name", "survey_type", "status", "segment", "owner", "is_owner", "sharing",
    "sent_at", "sent", "answered", "rate", "updated_at",
}  # fmt: skip
SENT_COUNTS = {
    "audience": 4, "sent": 3, "failed": 1, "skipped_recent": 0, "skipped_no_email": 0,
    "skipped_cap": 0,
}  # fmt: skip


class Endpoint(SurveyFixture):
    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))


class CreateTests(Endpoint):
    def post(self, user, **body):
        payload = {"name": "Q3 NPS", "survey_type": "nps", "subject": "A quick question", **body}
        return self.api(user).post(URL, payload, format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().post(AUDIENCE, {}, format="json").status_code, 401)

    def test_a_draft_is_created_for_its_owner(self):
        segment = self.pinned("customer", [self.pizza])
        response = self.post(
            self.csm,
            segment=segment.pk,
            roles=["champion", "champion", "decision_maker"],
            intro="Two minutes, promise.",
        )
        self.assertEqual(response.status_code, 201, response.content)
        send = SurveySend.objects.get(pk=response.data["id"])
        self.assertEqual(
            (send.owner, send.organisation, send.status, send.segment),
            (self.csm, self.org, "draft", segment),
        )
        self.assertEqual(send.roles, ["champion", "decision_maker"])
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(
            response.data["segment"], {"id": segment.pk, "name": "Renewal risk", "kind": "customer"}
        )
        self.assertEqual(self.events("survey.created"), [(str(send.pk), {"survey_type": "nps"})])
        self.assertEqual(self.events("survey.shared"), [])

    def test_a_draft_may_wait_for_its_segment(self):
        response = self.post(self.csm)
        self.assertEqual(
            (response.status_code, response.data["segment"], response.data["roles"]),
            (201, None, []),
        )

    def test_an_organisation_segment_needs_a_role(self):
        segment = self.pinned("customer", [self.pizza])
        response = self.post(self.csm, segment=segment.pk)
        self.assertEqual(
            (response.status_code, response.data), (400, {"roles": ["Choose at least one role."]})
        )

    def test_a_contact_segment_ignores_roles(self):
        segment = self.pinned("contact", [self.ann])
        response = self.post(self.csm, segment=segment.pk, roles=["champion"])
        self.assertEqual((response.status_code, response.data["roles"]), (201, []))

    def test_someone_elses_segment_is_403_and_an_unreadable_one_404(self):
        shared = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        hidden = self.pinned("customer", [self.taco], owner=self.other)
        response = self.post(self.csm, segment=shared.pk, roles=["champion"])
        self.assertEqual((response.status_code, response.data), (403, NOT_SEGMENT_OWNER))
        self.assertEqual(
            self.post(self.csm, segment=hidden.pk, roles=["champion"]).status_code, 404
        )
        self.assertEqual(self.post(self.csm, segment=999999, roles=["champion"]).status_code, 404)
        self.assertFalse(SurveySend.objects.exists())

    def test_limits_on_the_builders_words(self):
        response = self.post(self.csm, name="x" * 121, subject="y" * 121, intro="z" * 501)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {"name", "subject", "intro"})

    def test_an_unknown_type_or_role_is_refused(self):
        response = self.post(self.csm, survey_type="nps2", roles=["boss"])
        self.assertEqual(
            (response.status_code, set(response.data)), (400, {"survey_type", "roles"})
        )

    def test_sharing_with_people_needs_teammates_in_the_workspace(self):
        response = self.post(self.csm, sharing="people")
        self.assertEqual(response.data, {"shared_with": ["Choose at least one teammate."]})
        response = self.post(self.csm, sharing="people", shared_with=[self.stranger.pk])
        self.assertEqual((response.status_code, set(response.data)), (400, {"shared_with"}))
        response = self.post(self.csm, sharing="people", shared_with=[self.other.pk])
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["shared_with"], [{"id": self.other.pk, "name": "Dana CSM"}])
        self.assertEqual(
            self.events("survey.shared"),
            [(str(response.data["id"]), {"sharing": "people", "shared_with": [self.other.pk]})],
        )


class ReadTests(Endpoint):
    """Carl's private draft, and Alice's workspace CSAT send to Pizza Hut and
    Taco Bell: Ann answered 5, Tia 1, Ben is pending and Tom's email failed."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.private = cls.make_send(name="Carl's draft")
        cls.team_segment = cls.pinned("customer", [cls.pizza, cls.taco], owner=cls.admin)
        cls.team = cls.make_send(
            owner=cls.admin,
            name="Team CSAT",
            survey_type="csat",
            segment=cls.team_segment,
            sharing="workspace",
            status="sent",
            started_at=cls.now,
            sent_at=cls.now,
            counts=SENT_COUNTS,
        )
        cls.answered(cls.team, cls.ann, 5)
        cls.answered(cls.team, cls.tia, 1)
        cls.make_invite(cls.team, cls.ben)
        cls.make_invite(cls.team, cls.tom, status="failed", failure="bounced")

    def names(self, user, **query):
        return [row["name"] for row in self.api(user).get(URL, query).data]

    def fresh(self, user):
        """A client for the user loaded anew, as each real request loads
        it, so nothing is cached on the object from an earlier call."""
        return self.api(User.objects.get(pk=user.pk))

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        # sends, readable segments, the reader's workspace, membership, role
        # and reports (once per request), one aggregated tally
        client = self.fresh(self.csm)
        with self.assertNumQueries(7):
            client.get(URL)
        for i in range(5):
            self.make_send(owner=self.admin, name=f"More {i}", sharing="workspace")
        client = self.fresh(self.csm)
        with self.assertNumQueries(7):
            rows = client.get(URL).data
        self.assertEqual(len(rows), 7)

    def test_the_detail_reads_in_a_fixed_number_of_queries(self):
        # A shared reader: the send, readable segments, shared_with, their
        # workspace, membership, role and reports, the summary. The owner's
        # summary covers every invite, so it needs no visibility reads.
        for user, queries in ((self.csm, 8), (self.admin, 4)):
            client = self.fresh(user)
            with self.assertNumQueries(queries):
                client.get(f"{URL}{self.team.pk}/")

    def test_the_list_is_mine_and_what_is_shared_with_me(self):
        self.assertEqual(self.names(self.csm), ["Team CSAT", "Carl's draft"])
        self.assertEqual(self.names(self.other), ["Team CSAT"])
        self.assertEqual(self.names(self.csm, scope="mine"), ["Carl's draft"])
        self.assertEqual(self.names(self.csm, scope="shared"), ["Team CSAT"])
        self.assertEqual(set(self.api(self.csm).get(URL).data[0]), ROW_KEYS)

    def test_a_shared_reader_counts_only_people_they_may_open(self):
        path = f"{URL}{self.team.pk}/"
        self.assertEqual(
            self.api(self.admin).get(path).data["summary"],
            {
                "sent": 3,
                "answered": 2,
                "rate": 67,
                "figure": 50,
                "bands": {"low": 1, "mid": 0, "high": 1},
            },
        )
        self.assertEqual(
            self.api(self.csm).get(path).data["summary"],
            {
                "sent": 2,
                "answered": 1,
                "rate": 50,
                "figure": 100,
                "bands": {"low": 0, "mid": 0, "high": 1},
            },
        )
        for user, expected in ((self.admin, (3, 2, 67)), (self.csm, (2, 1, 50))):
            rows = {row["id"]: row for row in self.api(user).get(URL).data}
            row = rows[self.team.pk]
            self.assertEqual((row["sent"], row["answered"], row["rate"]), expected)

    def test_a_shared_reader_gets_no_counts_and_no_link_to_a_segment_they_cannot_read(self):
        body = self.api(self.csm).get(f"{URL}{self.team.pk}/").data
        self.assertEqual(set(body), DETAIL_KEYS)
        self.assertEqual(
            (body["is_owner"], body["counts"], body["segment"]),
            (False, None, {"id": None, "name": "Renewal risk", "kind": "customer"}),
        )
        body = self.api(self.admin).get(f"{URL}{self.team.pk}/").data
        self.assertEqual(
            (body["counts"], body["segment"]["id"]), (SENT_COUNTS, self.team_segment.pk)
        )

    def test_a_send_the_reader_may_not_see_reads_like_a_missing_one(self):
        self.assertEqual(self.api(self.other).get(f"{URL}{self.private.pk}/").status_code, 404)
        self.assertEqual(self.api(self.other).get(f"{URL}999999/").status_code, 404)


class WriteTests(Endpoint):
    def patch(self, user, send, **body):
        return self.api(user).patch(f"{URL}{send.pk}/", body, format="json")

    def test_only_the_owner_writes(self):
        team = self.make_send(owner=self.admin, sharing="workspace")
        response = self.patch(self.csm, team, name="Mine now")
        self.assertEqual((response.status_code, response.data), (403, NOT_OWNER))
        self.assertEqual(self.api(self.csm).delete(f"{URL}{team.pk}/").status_code, 403)
        private = self.make_send(owner=self.admin)
        self.assertEqual(self.patch(self.csm, private, name="x").status_code, 404)

    def test_a_draft_edit_is_audited_by_field_name(self):
        send = self.make_send()
        response = self.patch(self.csm, send, name="Renamed", subject="A quick question")
        self.assertEqual((response.status_code, response.data["name"]), (200, "Renamed"))
        self.assertEqual(self.events("survey.updated"), [(str(send.pk), {"fields": ["name"]})])

    def test_after_sending_only_the_name_and_sharing_change(self):
        send = self.make_send(status="sent", started_at=self.now, sent_at=self.now)
        response = self.patch(self.csm, send, subject="New", intro="x")
        self.assertEqual(
            (response.status_code, response.data), (400, {"intro": [LOCKED], "subject": [LOCKED]})
        )
        response = self.patch(self.csm, send, name="Renamed", sharing="workspace")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.events("survey.shared"),
            [(str(send.pk), {"sharing": "workspace", "shared_with": []})],
        )

    def test_a_draft_is_deleted_and_audited(self):
        send = self.make_send()
        self.assertEqual(self.api(self.csm).delete(f"{URL}{send.pk}/").status_code, 204)
        self.assertFalse(SurveySend.objects.filter(pk=send.pk).exists())
        self.assertEqual(self.events("survey.deleted"), [(str(send.pk), {"survey_type": "nps"})])

    def test_a_sent_survey_cannot_be_deleted(self):
        send = self.make_send(status="sent", started_at=self.now, sent_at=self.now)
        response = self.api(self.csm).delete(f"{URL}{send.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (
                409,
                {"detail": "Only a draft can be deleted; a sent survey's answers feed the scores."},
            ),
        )


class AudienceEndpointTests(Endpoint):
    def count(self, user, **body):
        return self.api(user).post(AUDIENCE, body, format="json")

    def test_the_count_for_the_modal_creates_nothing(self):
        segment = self.pinned("customer", [self.pizza, self.taco])
        response = self.count(self.csm, segment=segment.pk, roles=["champion", "decision_maker"])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.data,
            {
                "audience": 2,
                "organisations": 2,
                "skipped_recent": 0,
                "skipped_no_email": 0,
                "skipped_cap": 0,
                "hidden_count": 0,
                "limit": 500,
            },
        )
        self.assertFalse(SurveySend.objects.exists())
        self.assertFalse(SurveyInvite.objects.exists())

    def test_the_segment_must_be_the_callers_own(self):
        shared = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        hidden = self.pinned("customer", [self.taco], owner=self.other)
        response = self.count(self.csm, segment=shared.pk, roles=["champion"])
        self.assertEqual((response.status_code, response.data), (403, NOT_SEGMENT_OWNER))
        self.assertEqual(
            self.count(self.csm, segment=hidden.pk, roles=["champion"]).status_code, 404
        )

    def test_an_organisation_segment_needs_a_role(self):
        segment = self.pinned("customer", [self.pizza])
        response = self.count(self.csm, segment=segment.pk, roles=[])
        self.assertEqual(
            (response.status_code, response.data), (400, {"roles": ["Choose at least one role."]})
        )
