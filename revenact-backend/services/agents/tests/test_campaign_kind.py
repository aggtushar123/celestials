"""campaign.create (contract): a segment, roles and plain words with three
merge fields, naming nothing internal; applied, a draft on the approver's
own new segment; undo while unsent and unedited."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import campaigns
from services.agents.kinds import ChangedSince, Invalid, OwnerLimit
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign, CampaignSend
from services.customers.models import Note
from services.segments.models import Segment

CREATE = campaigns.CREATE


def campaign(**fields):
    return {
        "name": "Champion check-in",
        "segment": definition(),
        "roles": ["champion", "champion"],
        "subject": "A quick check-in, {first_name}",
        "body": "Hi {first_name}, how is {organisation} finding things? {sender_name}",
        **fields,
    }


class CampaignKindTests(AgentsFixture):
    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def validate(self, **fields):
        return CREATE.validate(campaign(**fields), None, self.ctx(), [])

    def action(self, name="Champion check-in"):
        return builder_action(self.org, "campaign.create", self.validate(name=name))

    def applied(self):
        action = self.action()
        action.after, action.result = CREATE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action):
        with transaction.atomic():
            CREATE.undo(action, self.lee)

    def test_the_kind_validate_and_preview(self):
        self.assertEqual(
            (CREATE.label, CREATE.max_level, CREATE.agents), ("Draft a campaign", "ask", ("ops",))
        )
        self.assertTrue(CREATE.workspace_level and CREATE.builder)
        clean = self.validate()
        self.assertEqual(clean["roles"], ["champion"])
        self.assertEqual(CREATE.target(clean), "campaign:champion check-in")
        self.assertIn("A quick check-in, {first_name}", CREATE.texts(clean))
        contacts = definition(
            kind="contact",
            rules={"match": "all", "conditions": [{"field": "role", "op": "is", "value": "other"}]},
        )
        self.assertEqual(self.validate(segment=contacts)["roles"], [])
        body = "x" * 300
        action = builder_action(self.org, "campaign.create", self.validate(body=body))
        self.assertEqual(
            CREATE.preview(action),
            {
                "campaign": {
                    "name": "Champion check-in",
                    "segment": "Poor health",
                    "roles": ["Champion"],
                    "subject": "A quick check-in, {first_name}",
                    "excerpt": "x" * 280,
                }
            },
        )

    def test_what_is_refused(self):
        Note.objects.create(
            customer=self.pizza, title="Discount promised to Ann", body="b", logged_at=self.today
        )
        for fields in (
            {"name": ""},
            {"subject": "x" * 151},
            {"body": "x" * 5001},
            {"body": "Hi {last_name}"},
            {"subject": "Hi {company}"},
            {"roles": []},
            {"roles": ["ceo"]},
            {"roles": "champion"},
            {"body": "About the Discount promised to Ann, {first_name}."},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.validate(**fields)

    def test_apply_makes_a_draft_on_the_approvers_segment(self):
        action = self.applied()
        made = Campaign.objects.get(pk=action.result["campaign_id"])
        self.assertEqual(
            (made.owner, made.status, made.segment_id, made.agent_action, made.roles),
            (self.admin, "draft", action.result["segment_id"], action, ["champion"]),
        )
        self.assertEqual(made.segment.owner, self.admin)
        event = AuditEvent.objects.get(action="campaign.created")
        self.assertEqual(
            (event.actor, event.metadata),
            (self.admin, {"segment": made.segment_id, "agent_action": action.pk}),
        )

    def test_past_fifty_campaigns_nothing_is_made(self):
        Campaign.objects.bulk_create(
            Campaign(organisation=self.org, owner=self.admin, name=f"C{i}") for i in range(50)
        )
        with self.assertRaises(OwnerLimit) as caught, transaction.atomic():
            CREATE.apply(self.action(), self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 campaigns.")
        self.assertFalse(Segment.objects.exists())

    def test_undo_deletes_the_draft_and_its_segment(self):
        action = self.applied()
        self.undo(action)
        self.assertFalse(Campaign.objects.exists())
        self.assertFalse(Segment.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="campaign.deleted").actor, self.lee)

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        made = Campaign.objects.get(pk=action.result["campaign_id"])
        later = timezone.now() + timedelta(minutes=1)
        Campaign.objects.filter(pk=made.pk).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This campaign has been edited since.")
        CampaignSend.objects.create(campaign=made, kind="manual", started_at=timezone.now())
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This campaign has been sent.")
        CampaignSend.objects.all().delete()
        Campaign.objects.filter(pk=made.pk).delete()
        Segment.objects.all().delete()
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This campaign has been deleted.")

    def test_a_gone_campaign_still_releases_its_untouched_segment(self):
        action = self.applied()
        Campaign.objects.filter(pk=action.result["campaign_id"]).delete()
        self.undo(action)
        self.assertFalse(Segment.objects.exists())

    def test_an_edited_segment_survives_the_undo(self):
        action = self.applied()
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=action.result["segment_id"]).update(updated_at=later)
        self.undo(action)
        self.assertFalse(Campaign.objects.exists())
        self.assertTrue(Segment.objects.filter(pk=action.result["segment_id"]).exists())
