"""Writing campaigns (spec §1.1, §1.7, §4): only the owner writes (403 for
another reader, 404 for anyone else); every refusal is the UI's own words;
writes are audited by id and field name only."""

from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.campaigns import validation as say
from services.campaigns.models import Campaign
from services.campaigns.tests.fixtures import CampaignFixture

URL = "/api/v1/campaigns/"


class CreateTests(CampaignFixture):
    def create(self, user=None, **body):
        return self.api(user or self.csm).post(URL, body, format="json")

    def test_a_name_is_enough(self):
        response = self.create(name="Win-back")
        self.assertEqual(response.status_code, 201, response.content)
        campaign = Campaign.objects.get(pk=response.data["id"])
        self.assertEqual(
            (campaign.owner, campaign.organisation, campaign.status, campaign.sharing),
            (self.csm, self.org, "draft", "private"),
        )
        self.assertEqual(
            (campaign.subject, campaign.body, campaign.roles),
            ("", "", ["champion", "decision_maker"]),
        )
        self.assertEqual(response.data["is_owner"], True)
        self.assertEqual(self.events("campaign.created"), [(str(campaign.pk), {"segment": None})])
        self.assertEqual(self.events("campaign.shared"), [])

    def test_the_whole_body(self):
        response = self.create(
            name="Win-back",
            segment=self.book.pk,
            roles=["decision_maker", "champion", "champion"],
            subject="Hi {first_name}",
            body="From {sender_name} at {organisation}",
            sharing="people",
            shared_with=[self.other.pk],
            status="archived",
        )
        self.assertEqual(response.status_code, 201, response.content)
        campaign = Campaign.objects.get(pk=response.data["id"])
        self.assertEqual(
            (campaign.segment, campaign.roles, campaign.status),
            (self.book, ["decision_maker", "champion"], "draft"),  # status is ignored on create
        )
        self.assertEqual(list(campaign.shared_with.all()), [self.other])
        self.assertEqual(
            self.events("campaign.shared"),
            [(str(campaign.pk), {"sharing": "people", "shared_with": [self.other.pk]})],
        )

    def test_roles_follow_the_segments_kind(self):
        contacts = self.create(name="A", segment=self.people.pk, roles=["champion"])
        self.assertEqual(Campaign.objects.get(pk=contacts.data["id"]).roles, [])
        self.assertEqual(
            self.create(name="B", segment=self.book.pk, roles=[]).data,
            {"roles": ["Choose at least one role."]},
        )

    def test_field_refusals(self):
        cases = [
            ({}, {"name": [say.NO_NAME]}),
            ({"name": ""}, {"name": [say.NO_NAME]}),
            ({"name": "x" * 121}, {"name": [say.LONG_NAME]}),
            ({"name": "A", "subject": "x" * 151}, {"subject": [say.LONG_SUBJECT]}),
            ({"name": "A", "body": "x" * 5001}, {"body": [say.LONG_BODY]}),
            ({"name": "A", "subject": "Hi {name}"}, {"subject": [say.MERGE_FIELDS_ONLY]}),
            ({"name": "A", "body": "{first_name} {First_Name}"}, {"body": [say.MERGE_FIELDS_ONLY]}),
            ({"name": "A", "sharing": "people"}, {"shared_with": [say.NO_TEAMMATES]}),
        ]
        for body, refusal in cases:
            response = self.create(**body)
            self.assertEqual((response.status_code, response.data), (400, refusal), body)
        self.assertFalse(Campaign.objects.exists())

    def test_only_your_own_segment(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        for segment in (danas.pk, 999999):
            response = self.create(name="A", segment=segment)
            self.assertEqual(response.data, {"segment": [say.OWN_SEGMENT]}, segment)

    def test_only_active_teammates_in_the_workspace(self):
        response = self.create(name="A", sharing="people", shared_with=[self.stranger.pk])
        self.assertEqual((response.status_code, list(response.data)), (400, ["shared_with"]))

    def test_at_most_fifty_owned_archived_included(self):
        self.make_campaign(status="archived")
        with mock.patch("services.campaigns.views.MAX_OWNED", 1):
            response = self.create(name="Second")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": ["You can own at most 50 campaigns."]}),
        )
        self.assertEqual(self.create(user=self.other, name="Dana's").status_code, 201)


class EditFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = cls.make_campaign(segment=cls.book, sharing="workspace")

    def patch(self, user=None, **body):
        return self.api(user or self.csm).patch(f"{URL}{self.campaign.pk}/", body, format="json")


class EditTests(EditFixture):
    def test_the_owner_edits_and_only_changed_field_names_are_audited(self):
        response = self.patch(name="Win-back", subject="New {first_name}", roles=["champion"])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            (response.data["subject"], response.data["roles"]), ("New {first_name}", ["champion"])
        )
        self.assertEqual(
            self.events("campaign.updated"),
            [(str(self.campaign.pk), {"fields": ["roles", "subject"]})],
        )

    def test_nothing_changed_is_not_audited(self):
        self.assertEqual(self.patch(name="Win-back").status_code, 200)
        self.assertEqual(self.events("campaign.updated"), [])

    def test_another_reader_is_403_anyone_else_404(self):
        self.assertEqual(
            (
                self.patch(self.other, name="Mine now").status_code,
                self.patch(self.other, name="x").data,
            ),
            (403, {"detail": say.NOT_OWNER}),
        )
        self.assertEqual(self.patch(self.stranger, name="x").status_code, 404)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.name, "Win-back")

    def test_a_contact_segment_clears_the_roles_and_back_restores_the_defaults(self):
        self.assertEqual(self.patch(segment=self.people.pk).data["roles"], [])
        self.assertEqual(
            self.patch(segment=self.book.pk).data["roles"], ["champion", "decision_maker"]
        )

    def test_sharing_changes_are_audited_as_shared(self):
        self.patch(sharing="private")
        self.assertEqual(
            self.events("campaign.shared"),
            [(str(self.campaign.pk), {"sharing": "private", "shared_with": []})],
        )

    def test_the_edit_waits_for_the_campaigns_row_lock(self):
        with CaptureQueriesContext(connection) as ctx:
            self.patch(name="Locked")
        locks = [
            q["sql"]
            for q in ctx.captured_queries
            if q["sql"].endswith('FOR NO KEY UPDATE OF "campaigns_campaign"')
        ]
        self.assertEqual(len(locks), 1)


class StatusTests(EditFixture):
    def test_archive_and_unarchive(self):
        response = self.patch(status="archived")
        self.assertEqual(response.data["status"], "archived")
        self.assertEqual(self.events("campaign.archived"), [(str(self.campaign.pk), {})])
        self.assertEqual(self.events("campaign.updated"), [])
        self.assertEqual(self.patch(status="active").data["status"], "draft")  # never sent
        self.patch(status="archived")
        self.make_send(self.campaign)
        self.assertEqual(self.patch(status="active").data["status"], "active")
        self.assertEqual(
            self.events("campaign.updated"),
            [(str(self.campaign.pk), {"fields": ["status"]})] * 2,
        )

    def test_active_on_a_live_campaign_changes_nothing(self):
        self.assertEqual(self.patch(status="active").data["status"], "draft")
        self.assertEqual(self.events("campaign.updated"), [])

    def test_other_statuses_are_refused(self):
        for value in ("draft", "sent", "sending", ""):
            response = self.patch(status=value)
            self.assertEqual(
                (response.status_code, response.data), (400, {"status": [say.CHOOSE_STATUS]}), value
            )

    def test_an_archived_campaign_is_still_editable(self):
        self.patch(status="archived")
        self.assertEqual(self.patch(subject="Still {first_name}").status_code, 200)


class DeleteTests(EditFixture):
    def delete(self, user=None):
        return self.api(user or self.csm).delete(f"{URL}{self.campaign.pk}/")

    def test_a_campaign_never_sent_is_deleted_and_audited(self):
        self.assertEqual(self.delete().status_code, 204)
        self.assertFalse(Campaign.objects.filter(pk=self.campaign.pk).exists())
        self.assertEqual(self.events("campaign.deleted"), [(str(self.campaign.pk), {})])

    def test_a_sent_campaign_is_409(self):
        self.make_send(self.campaign, [self.ann])
        response = self.delete()
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "CAMPAIGN_SENT", "detail": "Archive it instead: it has been sent."}),
        )
        self.assertTrue(Campaign.objects.filter(pk=self.campaign.pk).exists())

    def test_only_the_owner(self):
        self.assertEqual(self.delete(self.other).status_code, 403)
        self.assertEqual(self.delete(self.stranger).status_code, 404)
