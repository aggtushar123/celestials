"""The sixth rule action, "Send a campaign" (campaigns spec §1.8): what it
may say, how the rule reads it back, the pause when its campaign is archived
or deleted, the dry run, and (Task 12) the night and the Review Queue."""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core import mail
from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import ValidationError

from services.campaigns import sending
from services.campaigns import validation as campaign_say
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.rules import validation as say
from services.rules.models import Rule, RuleReview, RuleRunRecord
from services.rules.nightly import evaluate_rules
from services.rules.payloads import campaign_preview
from services.rules.reviews import Answer, send_review
from services.rules.selection import Selection
from services.rules.tests.fixtures import NOTIFY_ME, SURVEY, TASK
from services.segments.models import Segment

RULES = "/api/v1/rules/"


class CampaignActionFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.win_back = cls.make_campaign(segment=cls.book)

    def action(self, campaign=None, without_review=False):
        return {
            "action": "campaign",
            "campaign": (campaign or self.win_back).pk,
            "without_review": without_review,
        }

    def night(self, days=0):
        return evaluate_rules(today=self.today + timedelta(days=days), now=self.now)

    def records(self, rule):
        rows = RuleRunRecord.objects.filter(run__rule=rule).order_by("record_id")
        return [(row.record_id, row.outcome, row.reason, row.actions) for row in rows]


class CampaignValidationTests(CampaignActionFixture):
    def refused(self, actions, kind="customer"):
        with self.assertRaises(ValidationError) as caught:
            say.clean_actions(actions, kind, self.csm)
        return caught.exception.detail

    def test_a_campaign_action_is_normalised(self):
        cleaned = say.clean_actions([{**self.action(), "x": 1}], "customer", self.csm)
        self.assertEqual(cleaned, [self.action()])
        sent_back = {"action": "campaign", "campaign": {"id": self.win_back.pk, "name": "Win-back"}}
        self.assertEqual(say.clean_actions([sent_back], "customer", self.csm), [self.action()])

    def test_only_the_owners_active_campaigns_for_these_records(self):
        refusal = {"actions": [{"campaign": [say.CHOOSE_CAMPAIGN]}]}
        danas = self.make_campaign(
            owner=self.other, segment=self.pinned("customer", [self.taco], owner=self.other)
        )
        archived = self.make_campaign(segment=self.book, status="archived")
        unsegmented = self.make_campaign()
        contacts = self.make_campaign(segment=self.people)
        for campaign in (
            danas.pk,
            archived.pk,
            unsegmented.pk,
            contacts.pk,
            999999,
            None,
            "x",
            True,
        ):
            item = {"action": "campaign", "campaign": campaign}
            self.assertEqual(self.refused([item]), refusal, campaign)
        self.assertEqual(
            say.clean_actions([self.action(contacts)], "contact", self.csm), [self.action(contacts)]
        )

    def test_without_review_is_true_or_false(self):
        self.assertEqual(
            self.refused([{**self.action(), "without_review": "yes"}]),
            {"actions": [{"without_review": [say.YES_OR_NO]}]},
        )

    def test_still_one_to_three_actions_each_once(self):
        self.assertEqual(
            self.refused([NOTIFY_ME, TASK, SURVEY, self.action()]), {"actions": [say.ACTION_COUNT]}
        )
        self.assertEqual(
            self.refused([self.action(), self.action()]),
            {"actions": [{}, {"action": [say.ONE_OF_EACH]}]},
        )
        self.assertEqual(len(say.clean_actions([SURVEY, self.action()], "customer", self.csm)), 2)


class CampaignPayloadTests(CampaignActionFixture):
    def create(self, actions):
        body = {
            "name": "Win them back",
            "segment": self.book.pk,
            "trigger": "entered",
            "actions": actions,
        }
        return self.api(self.csm).post(RULES, body, format="json")

    def test_the_rule_reads_its_campaign_by_name(self):
        response = self.create([self.action(without_review=True)])
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            response.data["actions"],
            [
                {
                    "action": "campaign",
                    "campaign": {"id": self.win_back.pk, "name": "Win-back"},
                    "without_review": True,
                }
            ],
        )

    def test_a_deleted_campaign_reads_as_none_and_the_rule_cannot_be_turned_on(self):
        doomed = self.make_campaign(name="Doomed", segment=self.book)
        rule = self.make_rule(actions=[self.action(doomed)], is_active=False)
        doomed.delete()
        data = self.api(self.csm).get(f"{RULES}{rule.pk}/").data
        self.assertEqual(
            data["actions"], [{"action": "campaign", "campaign": None, "without_review": False}]
        )
        response = self.api(self.csm).patch(
            f"{RULES}{rule.pk}/", {"is_active": True}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"actions": [{"campaign": [say.CHOOSE_CAMPAIGN]}]}),
        )

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(RULES)
            return len(ctx.captured_queries)

        self.make_rule(name="A", actions=[self.action()])
        one = count()
        for name in ("B", "C"):
            campaign = self.make_campaign(name=name, segment=self.book)
            self.make_rule(name=name, actions=[self.action(campaign)])
        self.assertEqual(count(), one)

    def test_the_dry_run_counts_who_it_would_email(self):
        self.dot.campaigns_unsubscribed_at = self.now
        self.dot.save(update_fields=["campaigns_unsubscribed_at"])
        # the preview reads today's SegmentChange rows only once the segment
        # has been evaluated today (as test_selection.py's dry-run test does)
        Segment.objects.filter(pk=self.book.pk).update(last_evaluated_on=self.today)
        self.changed(self.book, [self.pizza, self.dough])
        body = {"segment": self.book.pk, "trigger": "entered", "actions": [self.action()]}
        data = self.api(self.csm).post(f"{RULES}test/", body, format="json").data
        # Pizza Hut reaches Ann and Ben (Pizza EMEA's); Dough Co's Dot has unsubscribed
        self.assertEqual(data["campaigns"], {"would_email": 2, "skipped": 1})
        no_campaign = {"segment": self.book.pk, "trigger": "entered", "actions": [NOTIFY_ME]}
        self.assertNotIn(
            "campaigns", self.api(self.csm).post(f"{RULES}test/", no_campaign, format="json").data
        )

    def test_the_dry_run_counts_nobody_for_a_campaign_on_another_kind(self):
        # the campaign moved to a contact segment after the rule was saved:
        # the customer ids fired tonight are not contact ids
        on_people = self.make_campaign(name="People", segment=self.people)
        rule = Rule(organisation=self.org, owner=self.csm, actions=[self.action(on_people)])
        selection = Selection(kind="customer", fire=[self.ann.pk, self.dot.pk])
        self.assertEqual(
            campaign_preview(rule, selection, today=self.today, now=self.now),
            {"would_email": 0, "skipped": 0},
        )
        selection = Selection(kind="contact", fire=[self.ann.pk, self.dot.pk])
        self.assertEqual(
            campaign_preview(rule, selection, today=self.today, now=self.now),
            {"would_email": 2, "skipped": 0},
        )


class CampaignGoneTests(CampaignActionFixture):
    def test_an_archived_or_deleted_campaign_pauses_the_rule(self):
        for gone in ("archived", "deleted"):
            campaign = self.make_campaign(name=gone, segment=self.book)
            rule = self.make_rule(name=gone, actions=[self.action(campaign)])
            if gone == "archived":
                Campaign.objects.filter(pk=campaign.pk).update(status="archived")
            else:
                campaign.delete()
        result = self.night()
        self.assertEqual(result.paused, 2)
        for rule in Rule.objects.filter(name__in=["archived", "deleted"]):
            self.assertEqual((rule.is_active, rule.paused_reason), (False, "campaign_gone"))
        self.assertEqual(
            Rule.Paused("campaign_gone").label, "Its campaign was archived or deleted."
        )
        notes = self.notes("rule_fired")
        self.assertIn("was switched off: Its campaign was archived or deleted.", notes[0][1])


CONSOLE = "django.core.mail.backends.console.EmailBackend"
QUEUED = {"action": "campaign", "status": "queued", "detail": "waiting for your review"}
EMAILED = {"action": "campaign", "status": "done", "detail": "emailed"}
NOBODY = {"action": "campaign", "status": "skipped", "detail": "nobody it could reach"}


class CampaignNightTests(CampaignActionFixture):
    def test_with_review_the_night_waits_for_the_owner(self):
        rule = self.make_rule(actions=[self.action()])
        self.changed(self.book, [self.dough])
        result = self.night()
        self.assertEqual((result.ran, result.fired, result.reviews), (1, 1, 1))
        self.assertEqual(self.records(rule), [(self.dough.pk, "fired", "", [QUEUED])])
        review = RuleReview.objects.get()
        self.assertEqual(
            (review.kind, review.action, review.records),
            ("campaign", self.action(), [{"kind": "customer", "id": self.dough.pk}]),
        )
        self.assertEqual(review.counts["reach"], 1)
        self.assertEqual(review.counts["skipped"]["unsubscribed"], 0)
        self.assertFalse(CampaignSend.objects.exists())
        self.assertEqual(mail.outbox, [])
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "A campaign from your rules is waiting for your review.",
                    "/work/mine?kind=approval",
                )
            ],
        )

    def test_a_survey_and_a_campaign_make_two_reviews_and_one_notice(self):
        self.make_rule(actions=[SURVEY, self.action()])
        self.changed(self.book, [self.dough])
        self.assertEqual(self.night().reviews, 2)
        self.assertEqual(
            sorted(RuleReview.objects.values_list("kind", flat=True)), ["campaign", "survey"]
        )
        self.assertEqual(
            [note[1] for note in self.notes("rule_review")],
            ["2 emails from your rules are waiting for your review."],
        )

    def test_without_review_the_night_emails_after_it_commits(self):
        rule = self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        result = self.night()
        self.assertEqual((result.fired, result.reviews, result.campaign_sends), (1, 0, 1))
        self.assertEqual(self.records(rule), [(self.pizza.pk, "fired", "", [EMAILED])])
        send = CampaignSend.objects.get()
        self.assertEqual(
            (send.kind, send.rule, send.review, send.sent_by, send.status),
            ("rule", rule, None, None, "sent"),
        )
        self.assertEqual(sorted(self.mail_to()), ["ann@example.com", "ben@example.com"])
        self.assertEqual(
            self.notes("campaign_sent"),
            [(self.csm.pk, "Win-back emailed 2 people.", f"/campaigns/{self.win_back.pk}")],
        )

    def test_a_rerun_finishes_a_send_cut_off_and_never_sends_twice(self):
        self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        with mock.patch("services.rules.nightly.deliver_pending", return_value=(0, 0)):
            self.night()
        self.assertEqual((CampaignSend.objects.get().status, mail.outbox), ("sending", []))
        again = self.night()
        self.assertEqual((again.ran, again.campaign_sends), (0, 1))
        self.assertEqual(CampaignSend.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 2)
        self.night()
        self.assertEqual(len(mail.outbox), 2)

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_without_review_and_no_email_set_up_fails_in_the_owners_words(self):
        rule = self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        self.night()
        failed = {"action": "campaign", "status": "failed", "detail": campaign_say.EMAIL_NOT_SET_UP}
        self.assertEqual(self.records(rule), [(self.pizza.pk, "skipped", "failed", [failed])])
        self.assertFalse(CampaignSend.objects.exists())

    def nobody(self, without_review):
        rule = self.make_rule(actions=[self.action(without_review=without_review)])
        self.dot.campaigns_unsubscribed_at = self.now
        self.dot.save(update_fields=["campaigns_unsubscribed_at"])
        self.changed(self.book, [self.dough])
        self.night()
        self.assertEqual(self.records(rule), [(self.dough.pk, "skipped", "nobody", [NOBODY])])
        self.assertFalse(RuleReview.objects.exists())
        self.assertFalse(CampaignSend.objects.exists())

    def test_nobody_to_email_makes_no_review(self):
        self.nobody(without_review=False)

    def test_nobody_to_email_makes_no_send(self):
        self.nobody(without_review=True)

    def test_a_campaign_without_a_segment_fails_its_records(self):
        rule = self.make_rule(actions=[NOTIFY_ME, self.action()])
        Campaign.objects.filter(pk=self.win_back.pk).update(segment=None)
        self.changed(self.book, [self.dough])
        self.night()
        (row,) = self.records(rule)
        self.assertEqual(
            row[3][1],
            {"action": "campaign", "status": "failed", "detail": "its campaign can't be used"},
        )

    def test_a_segment_swapped_before_the_lock_is_refused_under_it(self):
        # the owner moves the campaign to a contact segment between the
        # night's unlocked check and the claim's lock
        rule = self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        real = sending._lock

        def swapped(campaign_id):
            Campaign.objects.filter(pk=campaign_id).update(segment=self.people)
            return real(campaign_id)

        with mock.patch("services.campaigns.sending._lock", swapped):
            self.night()
        unusable = {
            "action": "campaign",
            "status": "failed",
            "detail": "its campaign can't be used",
        }
        self.assertEqual(self.records(rule), [(self.pizza.pk, "skipped", "failed", [unusable])])
        self.assertFalse(CampaignSend.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_the_night_takes_the_workspace_lock_before_the_campaigns(self):
        self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        with (
            mock.patch("services.rules.nightly.deliver_pending", return_value=(0, 0)),
            CaptureQueriesContext(connection) as ctx,
        ):
            self.night()
        sqls = [q["sql"] for q in ctx.captured_queries]
        rule_lock = next(
            i for i, s in enumerate(sqls) if 'FROM "rules_rule"' in s and "FOR UPDATE" in s
        )
        workspace = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "accounts_organisation"' in s and s.endswith("FOR NO KEY UPDATE")
        )
        campaign = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "campaigns_campaign"' in s and "FOR NO KEY UPDATE" in s
        )
        self.assertLess(rule_lock, workspace, sqls)
        self.assertLess(workspace, campaign, sqls)


class CampaignReviewTests(CampaignActionFixture):
    def setUp(self):
        self.rule = self.make_rule(actions=[self.action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.review = RuleReview.objects.get()

    def approve(self, actor="owner"):
        return send_review(
            self.review.pk,
            actor=self.csm if actor == "owner" else actor,
            today=self.today,
            now=self.now,
        )

    def test_approving_queues_the_fired_records_and_the_runner_sends(self):
        answer = self.approve()
        send = CampaignSend.objects.get()
        self.assertEqual(answer, Answer(200, {"campaign_send_id": send.pk}))
        # Approval only claims: the every-minute runner delivers.
        self.assertEqual(
            (send.kind, send.rule, send.review, send.sent_by, send.status),
            ("rule", self.rule, self.review, self.csm, "sending"),
        )
        self.assertEqual(
            set(CampaignDelivery.objects.filter(send=send).values_list("status", flat=True)),
            {"queued"},
        )
        self.assertEqual(mail.outbox, [])
        call_command("deliver_pending", stdout=StringIO())
        send.refresh_from_db()
        self.assertEqual(send.status, "sent")
        self.assertEqual(sorted(self.mail_to()), ["ann@example.com", "ben@example.com"])
        self.review.refresh_from_db()
        self.assertEqual(
            (self.review.status, self.review.decided_by, self.review.result),
            ("approved", self.csm, {"campaign_send_id": send.pk}),
        )
        self.assertEqual(
            self.events("rule.review_approved"),
            [
                (
                    str(self.review.pk),
                    {
                        "rule": self.rule.pk,
                        "kind": "campaign",
                        "campaign_send": send.pk,
                        "without_review": False,
                    },
                )
            ],
        )
        self.assertEqual(self.notes("campaign_sent"), [])

    def assert_refused(self, detail):
        answer = self.approve()
        self.assertEqual(answer, Answer(400, {"detail": detail}))
        self.review.refresh_from_db()
        self.assertEqual(
            (self.review.status, self.review.result), ("waiting", {"error": {"detail": detail}})
        )
        self.assertFalse(CampaignSend.objects.exists())

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_email_not_set_up_is_stored_and_the_review_waits(self):
        self.assert_refused(campaign_say.EMAIL_NOT_SET_UP)

    def test_an_archived_campaign_is_refused(self):
        Campaign.objects.filter(pk=self.win_back.pk).update(status="archived")
        self.assert_refused("Its campaign was archived or deleted.")

    def test_a_campaign_now_on_another_kind_is_refused(self):
        Campaign.objects.filter(pk=self.win_back.pk).update(segment=self.people)
        self.assert_refused(campaign_say.CHOOSE_CAMPAIGN)

    def test_a_segment_swapped_before_the_lock_is_refused_under_it(self):
        real = sending._lock

        def swapped(campaign_id):
            Campaign.objects.filter(pk=campaign_id).update(segment=self.people)
            return real(campaign_id)

        with mock.patch("services.campaigns.sending._lock", swapped):
            self.assert_refused(campaign_say.CHOOSE_CAMPAIGN)

    def test_a_campaign_no_longer_the_rule_owners_is_refused(self):
        Campaign.objects.filter(pk=self.win_back.pk).update(owner=self.admin)
        self.assert_refused(campaign_say.CHOOSE_CAMPAIGN)

    def test_nobody_left_is_refused(self):
        for person in (self.ann, self.ben):
            person.campaigns_unsubscribed_at = self.now
            person.save(update_fields=["campaigns_unsubscribed_at"])
        self.assert_refused(campaign_say.NOBODY)

    def test_the_lock_order_is_rule_review_workspace_campaign(self):
        with CaptureQueriesContext(connection) as ctx:
            self.approve()
        sqls = [q["sql"] for q in ctx.captured_queries]

        def first(table, mode):
            return next(i for i, s in enumerate(sqls) if f'FROM "{table}"' in s and mode in s)

        rule, review = (
            first("rules_rule", "FOR NO KEY UPDATE"),
            first("rules_rulereview", "FOR UPDATE"),
        )
        workspace, campaign = (
            first("accounts_organisation", "FOR NO KEY UPDATE"),
            first("campaigns_campaign", "FOR NO KEY UPDATE"),
        )
        insert = next(
            i for i, s in enumerate(sqls) if s.startswith('INSERT INTO "campaigns_campaignsend"')
        )
        self.assertEqual(
            sorted([rule, review, workspace, campaign, insert]),
            [rule, review, workspace, campaign, insert],
        )

    def test_approving_never_opens_a_mail_connection(self):
        dead = mock.Mock(side_effect=ConnectionRefusedError("x"))
        with mock.patch("services.campaigns.sending.get_connection", dead):
            response = self.api(self.csm).post(f"{RULES}reviews/{self.review.pk}/approve/")
        dead.assert_not_called()
        send = CampaignSend.objects.get()
        self.assertEqual(
            (response.status_code, response.data), (200, {"campaign_send_id": send.pk})
        )
        self.assertEqual((send.status, mail.outbox), ("sending", []))
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, "approved")

    def test_the_review_list_names_the_campaign(self):
        (item,) = self.api(self.csm).get(f"{RULES}reviews/").data
        self.assertEqual(
            (item["kind"], item["campaign"], item["counts"]["reach"]),
            ("campaign", {"id": self.win_back.pk, "name": "Win-back"}, 2),
        )
        self.win_back.delete()
        (item,) = self.api(self.csm).get(f"{RULES}reviews/").data
        self.assertIsNone(item["campaign"])

    def test_the_api_approves_and_skips(self):
        response = self.api(self.csm).post(f"{RULES}reviews/{self.review.pk}/approve/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(set(response.data), {"campaign_send_id"})
        again = self.api(self.csm).post(f"{RULES}reviews/{self.review.pk}/skip/")
        self.assertEqual(again.status_code, 409)
