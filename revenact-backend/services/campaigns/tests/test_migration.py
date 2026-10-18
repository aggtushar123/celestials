"""The data migration (spec §1.2), tested as customers' 0028 is: its logic
is importable and takes the model classes, so it runs here against today's
tables with literal pre-segments values. It must be safe on production's
real rows."""

from datetime import timedelta
from importlib import import_module
from types import SimpleNamespace

from services.accounts.models import Organisation, User
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.customers.models import Contact, Email
from services.identity.models import OrganizationMembership

# A migration module's name isn't an identifier, so it can't be imported with `from … import`.
migration = import_module("services.campaigns.migrations.0004_migrate_campaigns")

#: Today's tables stand in for the historical ones: every column the
#: migration writes exists in both.
MODELS = SimpleNamespace(
    Campaign=Campaign,
    CampaignSend=CampaignSend,
    CampaignDelivery=CampaignDelivery,
    Contact=Contact,
    Email=Email,
    User=User,
    Membership=OrganizationMembership,
)


def models():
    return MODELS


class PureTests(CampaignFixture):
    def test_entries_one_per_known_contact_in_log_order_detail_dropped(self):
        log = [
            {
                "contact_id": 2,
                "contact_name": "B",
                "status": "skipped",
                "detail": "ValueError: b@x",
            },
            {"contact_id": 1, "status": "sent", "detail": "Emailed a@x"},
            {"contact_id": 2, "status": "sent"},
            {"contact_id": 9, "status": "sent"},
            "garbage",
            {"status": "sent"},
        ]
        self.assertEqual(migration.entries(log, {1, 2}), [(2, "skipped"), (1, "sent")])
        self.assertEqual(migration.entries(None, {1}), [])

    def test_counts(self):
        self.assertEqual(
            migration.counts([(1, "sent"), (2, "skipped"), (3, "sent")]),
            {
                "reached": 3,
                "sent": 2,
                "skipped": {
                    "unsubscribed": 0,
                    "no_email": 0,
                    "already_received": 0,
                    "recent_campaign": 0,
                    "over_limit": 0,
                    "failed": 1,
                },
            },
        )

    def test_trim(self):
        self.assertEqual((migration.trim("x" * 200, 120), migration.trim(None, 5)), ("x" * 120, ""))


class OwnerTests(CampaignFixture):
    def test_the_workspace_owner_first(self):
        OrganizationMembership.objects.filter(user=self.other).update(is_owner=True)
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.other.pk)

    def test_then_the_first_active_admin_then_any_active_then_anyone(self):
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.admin.pk)
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.csm.pk)
        User.objects.filter(organisation=self.org).update(is_active=False)
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.admin.pk)

    def test_nobody_at_all(self):
        empty = Organisation.objects.create(name="Empty", currency="USD")
        self.assertIsNone(migration.owner_for(models(), empty.pk))

    def test_a_suspended_owner_membership_is_skipped(self):
        membership = OrganizationMembership.objects.get(user=self.other)
        membership.is_owner = True
        membership.status = "suspended"
        membership.save(update_fields=["is_owner", "status"])
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.admin.pk)

    def test_an_owner_whose_user_has_gone_inactive_is_skipped(self):
        OrganizationMembership.objects.filter(user=self.other).update(is_owner=True)
        self.other.is_active = False
        self.other.save(update_fields=["is_active"])
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.admin.pk)

    def test_the_cache_answers_once_per_organisation(self):
        cache = {}
        self.assertEqual(migration.owner_for(models(), self.org.pk, cache), self.admin.pk)
        OrganizationMembership.objects.filter(user=self.other).update(is_owner=True)
        # Stale answer served from the cache — proves it was not recomputed.
        self.assertEqual(migration.owner_for(models(), self.org.pk, cache), self.admin.pk)
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.other.pk)


class MoveTests(CampaignFixture):
    def row(self, campaign, **values):
        base = {
            "pk": campaign.pk,
            "organisation_id": campaign.organisation_id,
            "status": "draft",
            "name": campaign.name,
            "subject": campaign.subject,
            "body": campaign.body,
            "send_log": [],
            "sent_at": None,
            "updated_at": campaign.updated_at,
        }
        return SimpleNamespace(**{**base, **values})

    def test_a_sent_campaign_becomes_active_with_one_migrated_send(self):
        campaign = self.make_campaign(owner=self.other, subject="Hi")
        sent_at = self.now - timedelta(days=40)
        filed = Email.objects.create(
            customer=self.pizza,
            campaign=campaign,
            subject="Hi",
            body="Body",
            sender_name="Acme Inc",
            recipient_name="Ann",
            sent_at=sent_at,
        )
        log = [
            {
                "contact_id": self.ann.pk,
                "contact_name": "Ann",
                "status": "sent",
                "detail": "Emailed ann@example.com",
            },
            {
                "contact_id": self.ben.pk,
                "contact_name": "Ben",
                "status": "skipped",
                "detail": "SMTP 550 ben@example.com",
            },
            {"contact_id": 999999, "status": "sent"},
        ]
        long_subject = "S" * 200
        result = migration.move_campaign(
            models(),
            self.row(
                campaign,
                status="sent",
                send_log=log,
                sent_at=sent_at,
                name="N" * 130,
                subject=long_subject,
            ),
        )
        self.assertEqual(result, "sent")
        campaign.refresh_from_db()
        self.assertEqual(
            (
                campaign.status,
                campaign.owner,
                campaign.sharing,
                campaign.segment,
                campaign.name,
                campaign.subject,
            ),
            ("active", self.admin, "private", None, "N" * 120, "S" * 150),
        )
        send = campaign.sends.get()
        self.assertEqual(
            (
                send.kind,
                send.status,
                send.migrated,
                send.sent_by,
                send.started_at,
                send.finished_at,
                send.subject,
            ),
            ("manual", "sent", True, None, sent_at, sent_at, long_subject),
        )
        self.assertEqual(send.counts["reached"], 2)
        self.assertEqual((send.counts["sent"], send.counts["skipped"]["failed"]), (1, 1))
        rows = list(
            send.deliveries.order_by("pk").values_list(
                "contact", "status", "reason", "email", "sent_at"
            )
        )
        self.assertEqual(
            rows,
            [
                (self.ann.pk, "sent", "", filed.pk, sent_at),
                (self.ben.pk, "skipped", "failed", None, None),
            ],
        )
        self.assertNotIn("ben@example.com", str(list(CampaignSend.objects.values())))

    def test_a_campaign_stuck_sending_becomes_active_with_a_sent_send(self):
        campaign = self.make_campaign()
        result = migration.move_campaign(
            models(), self.row(campaign, status="sending", send_log=[])
        )
        self.assertEqual(result, "sent")
        campaign.refresh_from_db()
        send = campaign.sends.get()
        self.assertEqual(
            (campaign.status, send.status, send.deliveries.count()), ("active", "sent", 0)
        )
        self.assertEqual(
            (send.started_at, send.finished_at), (campaign.updated_at, campaign.updated_at)
        )

    def test_a_draft_keeps_its_recipients_and_waits_for_a_segment(self):
        campaign = self.make_campaign(owner=self.other)
        campaign.recipients.set([self.ann, self.tia])
        before = campaign.updated_at
        self.assertEqual(migration.move_campaign(models(), self.row(campaign)), "draft")
        campaign.refresh_from_db()
        self.assertEqual(
            (campaign.status, campaign.segment, campaign.owner, campaign.updated_at),
            ("draft", None, self.admin, before),
        )
        self.assertEqual(
            set(campaign.recipients.values_list("pk", flat=True)), {self.ann.pk, self.tia.pk}
        )
        self.assertFalse(campaign.sends.exists())

    def test_a_workspace_with_nobody_loses_its_campaigns(self):
        empty = Organisation.objects.create(name="Empty", currency="USD")
        campaign = Campaign.objects.create(organisation=empty, owner=self.csm, name="Orphan")
        self.assertEqual(migration.move_campaign(models(), self.row(campaign)), "deleted")
        self.assertFalse(Campaign.objects.filter(pk=campaign.pk).exists())

    def test_running_it_twice_does_not_duplicate_the_migrated_send(self):
        """A rollback (0005 reversed, `backwards` flipping the status back
        to `sent`) followed by a redeploy must not build a second send for
        the same history."""
        campaign = self.make_campaign(owner=self.other, subject="Hi")
        sent_at = self.now - timedelta(days=10)
        log = [{"contact_id": self.ann.pk, "status": "sent"}]
        row = self.row(campaign, status="sent", send_log=log, sent_at=sent_at)
        self.assertEqual(migration.move_campaign(models(), row), "sent")
        self.assertEqual(campaign.sends.count(), 1)
        # What `backwards` does on a rollback: flips the status, leaves the send.
        Campaign.objects.filter(pk=campaign.pk).update(status="sent")
        self.assertEqual(migration.move_campaign(models(), row), "sent")
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, "active")
        self.assertEqual(campaign.sends.count(), 1)
        self.assertEqual(campaign.sends.get().deliveries.count(), 1)

    def test_a_campaign_stuck_sending_recovers_deliveries_filed_but_not_logged(self):
        """The old view files an Email row for each success as it goes but
        only writes `send_log` at the finish — a send cut off before that
        leaves real `Email` rows with nothing in the log naming them."""
        campaign = self.make_campaign(segment=self.people)
        at = self.now - timedelta(hours=2)
        filed = Email.objects.create(
            customer=self.pizza,
            campaign=campaign,
            subject="Hi",
            body="Body",
            sender_name="Acme Inc",
            recipient_name=self.ann.name,
            sent_at=at,
        )
        result = migration.move_campaign(
            models(), self.row(campaign, status="sending", send_log=[])
        )
        self.assertEqual(result, "sent")
        campaign.refresh_from_db()
        send = campaign.sends.get()
        self.assertEqual((send.counts["reached"], send.counts["sent"]), (1, 1))
        self.assertEqual(
            list(send.deliveries.values_list("contact", "status", "email")),
            [(self.ann.pk, "sent", filed.pk)],
        )

    def test_a_log_entry_for_another_workspaces_contact_is_dropped(self):
        stranger = Contact.objects.create(customer=self.globex, name="Spy", email="spy@example.com")
        campaign = self.make_campaign()
        log = [
            {"contact_id": self.ann.pk, "status": "sent"},
            {"contact_id": stranger.pk, "status": "sent"},
        ]
        result = migration.move_campaign(models(), self.row(campaign, status="sent", send_log=log))
        self.assertEqual(result, "sent")
        send = campaign.sends.get()
        self.assertEqual(list(send.deliveries.values_list("contact", flat=True)), [self.ann.pk])
