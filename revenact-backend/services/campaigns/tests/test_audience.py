"""Who a campaign reaches (spec §1.3): Surveys' audience as the campaign's
owner, then the five skips in order, then Surveys' cap of three per record,
then the 500 limit. Nothing is written."""

from datetime import timedelta
from unittest import mock

from services.campaigns.audience import Reach, build, valid_email
from services.campaigns.models import CampaignDelivery
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.audience import candidates, resolve
from services.surveys.tests.fixtures import contact

ALL_ZERO = {
    "unsubscribed": 0,
    "no_email": 0,
    "already_received": 0,
    "recent_campaign": 0,
    "over_limit": 0,
    "failed": 0,
}


class AudienceTests(CampaignFixture):
    def reach(self, campaign, **kwargs):
        return build(campaign, today=self.today, now=self.now, **kwargs)

    def names(self, people):
        return [person.name for person in people]

    def test_a_contact_segment_reaches_its_people_by_name(self):
        reach = self.reach(self.make_campaign(segment=self.people))
        self.assertEqual(self.names(reach.queued), ["Ann", "Dot"])
        self.assertEqual(reach.tally(), ALL_ZERO)

    def test_an_organisation_segment_reaches_ticked_roles_on_its_records_and_their_accounts(self):
        reach = self.reach(self.make_campaign(segment=self.book))
        # champions first, then decision makers; Ben is Pizza EMEA's, an account of Pizza Hut
        self.assertEqual(self.names(reach.queued), ["Ann", "Dot", "Ben"])
        only_champions = self.make_campaign(segment=self.book, roles=["champion"])
        self.assertEqual(self.names(self.reach(only_champions).queued), ["Ann", "Dot"])

    def test_it_reads_as_the_owner_never_wider(self):
        everything = self.pinned("customer", [self.pizza, self.taco], owner=self.csm)
        reach = self.reach(self.make_campaign(segment=everything))
        self.assertNotIn("Tia", self.names(reach.queued))  # Taco Bell is Dana's

    def test_records_replace_the_members_and_still_read_as_the_owner(self):
        campaign = self.make_campaign(segment=self.book)
        reach = self.reach(campaign, records=[self.dough.pk, self.taco.pk])
        self.assertEqual(self.names(reach.queued), ["Dot"])

    def test_the_skips_in_order_first_match_wins(self):
        campaign = self.make_campaign(segment=self.people)
        nell = contact(self.pizza, "Nell", email="", campaigns_unsubscribed_at=self.now)
        noel = contact(self.pizza, "Noel", email="  ")
        rae = contact(self.dough, "Rae")
        other = self.make_campaign(name="Other", segment=self.people)
        self.make_send(campaign, [self.ann], at=self.now - timedelta(days=30))
        self.make_send(other, [rae], at=self.now - timedelta(days=2))
        self.people.pinned_ids = [p.pk for p in (self.ann, self.dot, nell, noel, rae)]
        self.people.save(update_fields=["pinned_ids"])
        reach = self.reach(campaign)
        self.assertEqual(self.names(reach.queued), ["Dot"])
        self.assertEqual(
            [(person.name, reason) for person, reason in reach.skipped],
            [
                ("Ann", "already_received"),
                ("Nell", "unsubscribed"),  # unsubscribed comes before no email
                ("Noel", "no_email"),
                ("Rae", "recent_campaign"),
            ],
        )

    def test_the_gap_is_three_days_from_now(self):
        other = self.make_campaign(name="Other", segment=self.people)
        self.make_send(other, [self.ann], at=self.now - timedelta(days=3, seconds=1))
        reach = self.reach(self.make_campaign(segment=self.people))
        self.assertEqual(self.names(reach.queued), ["Ann", "Dot"])

    def test_a_queued_person_counts_as_received_and_recent(self):
        campaign = self.make_campaign(segment=self.people)
        cut_off = self.make_send(campaign, status="sending")
        CampaignDelivery.objects.create(send=cut_off, contact=self.ann)
        self.assertEqual(
            [(p.name, r) for p, r in self.reach(campaign).skipped], [("Ann", "already_received")]
        )
        other = self.make_campaign(name="Other", segment=self.people)
        self.assertEqual(
            [(p.name, r) for p, r in self.reach(other).skipped], [("Ann", "recent_campaign")]
        )

    def test_a_skipped_or_failed_delivery_never_counts(self):
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign)
        CampaignDelivery.objects.create(
            send=send, contact=self.ann, status="skipped", reason="failed"
        )
        self.assertEqual(self.names(self.reach(campaign).queued), ["Ann", "Dot"])

    def test_a_failed_delivery_that_may_have_gone_out_counts_as_received_and_recent(self):
        # resumed as stale after a crash: skipped `failed` but its hash kept,
        # since the email may already have gone out
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign, at=self.now - timedelta(days=2))
        CampaignDelivery.objects.create(
            send=send, contact=self.ann, status="skipped", reason="failed", token_hash="t" * 64
        )
        self.assertEqual(
            [(p.name, r) for p, r in self.reach(campaign).skipped], [("Ann", "already_received")]
        )
        other = self.make_campaign(name="Other", segment=self.people)
        self.assertEqual(
            [(p.name, r) for p, r in self.reach(other).skipped], [("Ann", "recent_campaign")]
        )
        send.started_at = self.now - timedelta(days=3, seconds=1)
        send.save(update_fields=["started_at"])
        self.assertEqual(self.names(self.reach(other).queued), ["Ann", "Dot"])

    def test_another_workspaces_campaigns_never_count(self):
        theirs = self.make_campaign(segment=self.people, name="Theirs")
        theirs.organisation = self.other_org
        theirs.save(update_fields=["organisation"])
        self.make_send(theirs, [self.ann], at=self.now)
        self.assertEqual(
            self.names(self.reach(self.make_campaign(segment=self.people)).queued), ["Ann", "Dot"]
        )

    def test_three_per_record_after_the_skips(self):
        """Abe ranks first but is unsubscribed: he is counted, and Cy still
        gets the third place (a cap before the skips would have dropped Cy)."""
        extra = [contact(self.pizza, name) for name in ("Abe", "Bea", "Cy")]
        extra[0].campaigns_unsubscribed_at = self.now
        extra[0].save(update_fields=["campaigns_unsubscribed_at"])
        reach = self.reach(self.make_campaign(segment=self.book, roles=["champion"]))
        # Pizza Hut's champions by name: Abe (unsubscribed, counted), Ann, Bea, Cy; three reach
        self.assertEqual(self.names(reach.queued), ["Ann", "Bea", "Cy", "Dot"])
        self.assertEqual([(p.name, r) for p, r in reach.skipped], [("Abe", "unsubscribed")])

    def test_over_the_limit_is_skipped_and_counted(self):
        with mock.patch("services.campaigns.audience.MAX_PEOPLE", 1):
            reach = self.reach(self.make_campaign(segment=self.people))
        self.assertEqual(self.names(reach.queued), ["Ann"])
        self.assertEqual([(p.name, r) for p, r in reach.skipped], [("Dot", "over_limit")])

    def test_the_shapes(self):
        reach = Reach(queued=[self.ann, self.dot], skipped=[(self.ben, "no_email")])
        self.assertEqual(reach.reach, 2)
        self.assertEqual(reach.tally(), {**ALL_ZERO, "no_email": 1})
        self.assertEqual(
            reach.counts(), {"reached": 3, "sent": 0, "skipped": {**ALL_ZERO, "no_email": 1}}
        )
        self.assertEqual(
            reach.payload(sample=1),
            {
                "reach": 2,
                "skipped": {**ALL_ZERO, "no_email": 1},
                "sample": [{"id": self.ann.pk, "name": "Ann"}],
            },
        )

    def test_valid_email(self):
        self.assertTrue(valid_email("ann@example.com"))
        self.assertTrue(valid_email(" ann@example.com "))
        for bad in ("", "   ", "ann", "ann@", None):
            self.assertFalse(valid_email(bad), bad)


class SurveysUnchangedTests(CampaignFixture):
    def test_candidates_is_what_resolve_reads(self):
        people, hidden, capped = candidates(self.book, ["champion"], self.csm, today=self.today)
        self.assertEqual(([p.name for p in people], hidden, capped), (["Ann", "Dot"], 0, True))
        audience = resolve(self.book, ["champion"], self.csm, today=self.today)
        self.assertEqual([p.name for p in audience.people], ["Ann", "Dot"])

    def test_campaign_opt_out_does_not_touch_surveys(self):
        self.ann.campaigns_unsubscribed_at = self.now
        self.ann.save(update_fields=["campaigns_unsubscribed_at"])
        audience = resolve(self.people, [], self.csm, today=self.today)
        self.assertEqual([p.name for p in audience.people], ["Ann", "Dot"])
