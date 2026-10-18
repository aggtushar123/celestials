"""The owner's three send-side routes (spec §4): the audience count, the
preview, and Send now. Only the owner calls them (403 for another reader,
404 for anyone else); the first two write nothing."""

from io import StringIO
from unittest import mock

from django.conf import settings
from django.core import mail
from django.core.management import call_command
from django.test import override_settings

from services.campaigns import validation as say
from services.campaigns.models import CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.email import send_campaign_email
from services.surveys.tests.fixtures import contact

URL = "/api/v1/campaigns/"
CONSOLE = "django.core.mail.backends.console.EmailBackend"
ZERO = {
    "unsubscribed": 0,
    "no_email": 0,
    "already_received": 0,
    "recent_campaign": 0,
    "over_limit": 0,
    "failed": 0,
}


class SendViewFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = cls.make_campaign(segment=cls.people, sharing="workspace")

    def call(self, verb, path, user=None, body=None):
        client = self.api(user or self.csm)
        return getattr(client, verb)(f"{URL}{self.campaign.pk}/{path}", body or {}, format="json")

    def run_pending(self):
        call_command("deliver_pending", stdout=StringIO())


class AudienceViewTests(SendViewFixture):
    def test_the_owner_gets_the_counts_and_a_sample(self):
        self.dot.campaigns_unsubscribed_at = self.now
        self.dot.save(update_fields=["campaigns_unsubscribed_at"])
        response = self.call("get", "audience/")
        self.assertEqual(
            response.data,
            {
                "reach": 1,
                "skipped": {**ZERO, "unsubscribed": 1},
                "sample": [{"id": self.ann.pk, "name": "Ann"}],
            },
        )
        self.assertFalse(CampaignSend.objects.exists())

    def test_only_the_owner(self):
        self.assertEqual(self.call("get", "audience/", self.other).data, {"detail": say.NOT_OWNER})
        self.assertEqual(self.call("get", "audience/", self.stranger).status_code, 404)

    def test_no_segment(self):
        self.campaign.segment = None
        self.campaign.save(update_fields=["segment"])
        response = self.call("get", "audience/")
        self.assertEqual(
            (response.status_code, response.data), (400, {"detail": say.CHOOSE_SEGMENT})
        )


class PreviewTests(SendViewFixture):
    def test_the_first_person_by_default_with_a_placeholder_link(self):
        response = self.call("post", "preview/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.data,
            {
                "subject": "Hello Ann",
                "body": "We miss you at Pizza Hut.\nCarl CSM\n\n—\nCarl CSM, Acme Inc\n"
                f"Unsubscribe from these emails: {settings.FRONTEND_URL}/u/preview",
            },
        )
        self.assertEqual((mail.outbox, CampaignSend.objects.exists()), ([], False))

    def test_a_chosen_person_and_unsaved_words(self):
        response = self.call(
            "post",
            "preview/",
            body={"contact": self.dot.pk, "subject": "Yo {first_name}", "body": "{organisation}"},
        )
        self.assertEqual(response.data["subject"], "Yo Dot")
        self.assertTrue(response.data["body"].startswith("Dough Co\n\n—\n"))
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.subject, "Hello {first_name}")  # nothing saved

    def test_refusals(self):
        cases = [
            ({"contact": self.tia.pk}, {"contact": [say.NOT_IN_AUDIENCE]}),
            ({"contact": 999999}, {"contact": [say.NOT_IN_AUDIENCE]}),
            ({"subject": "{oops}"}, {"subject": [say.MERGE_FIELDS_ONLY]}),
            ({"body": "x" * 5001}, {"body": [say.LONG_BODY]}),
        ]
        for body, refusal in cases:
            response = self.call("post", "preview/", body=body)
            self.assertEqual((response.status_code, response.data), (400, refusal), body)

    def test_nobody_and_no_segment(self):
        for person in (self.ann, self.dot):
            person.campaigns_unsubscribed_at = self.now
            person.save(update_fields=["campaigns_unsubscribed_at"])
        self.assertEqual(self.call("post", "preview/").data, {"detail": say.NOBODY})
        self.campaign.segment = None
        self.campaign.save(update_fields=["segment"])
        self.assertEqual(self.call("post", "preview/").data, {"detail": say.CHOOSE_SEGMENT})

    def test_only_the_owner(self):
        self.assertEqual(self.call("post", "preview/", self.other).status_code, 403)
        self.assertEqual(self.call("post", "preview/", self.stranger).status_code, 404)


class SendNowTests(SendViewFixture):
    def test_send_now_emails_the_segment_and_answers_the_send(self):
        response = self.call("post", "sends/")
        self.assertEqual(response.status_code, 201, response.content)
        send = CampaignSend.objects.get()
        self.assertEqual(
            (response.data["id"], response.data["kind"], response.data["status"]),
            (send.pk, "manual", "sending"),
        )
        self.assertEqual(response.data["sent_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(response.data["counts"], {"reached": 2, "sent": 0, "skipped": ZERO})
        self.run_pending()
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts["sent"]), ("sent", 2))
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "active")

    def test_sending_again_reaches_only_who_is_new(self):
        self.call("post", "sends/")
        self.run_pending()
        again = self.call("post", "sends/")
        self.assertEqual((again.status_code, again.data), (400, {"detail": say.NOBODY}))
        newcomer = contact(self.pizza, "Nia")
        self.people.pinned_ids = [self.ann.pk, self.dot.pk, newcomer.pk]
        self.people.save(update_fields=["pinned_ids"])
        mail.outbox.clear()
        third = self.call("post", "sends/")
        self.assertEqual(third.status_code, 201, third.content)
        self.run_pending()
        self.assertEqual(self.mail_to(), ["nia@example.com"])
        self.assertEqual(third.data["counts"]["skipped"]["already_received"], 2)

    def test_a_mail_server_down_leaves_the_send_sending(self):
        response = self.call("post", "sends/")
        self.assertEqual(response.status_code, 201, response.content)
        dead = mock.Mock(open=mock.Mock(side_effect=ConnectionRefusedError("x")))
        with (
            mock.patch("services.campaigns.sending.get_connection", return_value=dead),
            self.assertLogs("services.campaigns.sending", "ERROR"),
        ):
            self.run_pending()
        send = CampaignSend.objects.get()
        self.assertEqual((send.status, send.counts["sent"]), ("sending", 0))
        self.assertEqual(mail.outbox, [])

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_email_not_set_up_keeps_the_campaign(self):
        response = self.call("post", "sends/")
        self.assertEqual(
            (response.status_code, response.data), (400, {"detail": say.EMAIL_NOT_SET_UP})
        )
        self.campaign.refresh_from_db()
        self.assertEqual((self.campaign.status, CampaignSend.objects.exists()), ("draft", False))

    def test_the_other_refusals_write_nothing(self):
        self.campaign.status = "archived"
        self.campaign.save(update_fields=["status"])
        self.assertEqual(self.call("post", "sends/").data, {"detail": say.ARCHIVED})
        self.assertFalse(CampaignSend.objects.exists())

    def test_only_the_owner(self):
        self.assertEqual(self.call("post", "sends/", self.other).data, {"detail": say.NOT_OWNER})
        self.assertEqual(self.call("post", "sends/", self.stranger).status_code, 404)
        self.assertEqual(mail.outbox, [])


class DeferredSendTests(SendViewFixture):
    """Send now only claims; `deliver_pending`, run every minute, emails."""

    def test_send_now_answers_at_once_still_sending_with_nobody_emailed(self):
        response = self.call("post", "sends/")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual((response.data["status"], response.data["counts"]["sent"]), ("sending", 0))
        self.assertEqual(mail.outbox, [])
        send = CampaignSend.objects.get()
        self.assertEqual(set(send.deliveries.values_list("status", flat=True)), {"queued"})

    def test_the_runner_delivers_and_finishes_it_at_once(self):
        self.call("post", "sends/")
        self.run_pending()
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        send = CampaignSend.objects.get()
        self.assertEqual((send.status, send.counts["sent"]), ("sent", 2))

    def test_running_it_twice_never_emails_twice(self):
        self.call("post", "sends/")
        self.run_pending()
        self.run_pending()
        self.assertEqual(len(mail.outbox), 2)

    def test_a_run_started_during_another_never_emails_twice(self):
        self.call("post", "sends/")
        inner = []

        def email_then_race(*args, **kwargs):
            if not inner:
                inner.append(True)
                self.run_pending()
            return send_campaign_email(*args, **kwargs)

        with mock.patch(
            "services.campaigns.sending.send_campaign_email", side_effect=email_then_race
        ):
            self.run_pending()
        self.assertEqual(sorted(self.mail_to()), ["ann@example.com", "dot@example.com"])
        self.assertEqual(CampaignSend.objects.get().status, "sent")
