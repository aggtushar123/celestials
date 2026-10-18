"""A draft whose send was never confirmed (cleanup batch, owner decision
2026-10-09): a read timeout after the request went out leaves it `sending`
(504 SEND_UNCONFIRMED); after UNCONFIRMED_AFTER its owner says whether it
went (confirm-sent) or not (reopen)."""

import http.client
import socket
import urllib.error
from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.drafts_fixtures import draft, inbound, mailbox, share
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.drafts import UNCONFIRMED_AFTER
from services.customers.models import Email, ReplyDraft
from services.mail.providers.base import ProviderError, SendUnconfirmed, http_json
from services.mail.providers.google import GoogleProvider
from services.mail.tests.test_mail import FakeProvider
from services.mail.tests.test_unanswered import EXPIRED, URLOPEN

URL = "/api/v1/communications/drafts/"
SUPERSEDED = {"code": "SEND_SUPERSEDED", "detail": "This reply already went out."}
NOT_UNCONFIRMED = {
    "code": "NOT_UNCONFIRMED",
    "detail": "This draft isn't waiting for confirmation.",
}


class TimingOut(FakeProvider):
    def send(self, creds, **message):
        raise TimeoutError("The read operation timed out")


def aged(mine, by):
    """Stamp `mine` as last written `by` ago (auto_now bypassed)."""
    ReplyDraft.objects.filter(pk=mine.pk).update(updated_at=timezone.now() - by)


class UnconfirmedDraftTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.connection = mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)

    def setUp(self):
        FakeProvider.queued, FakeProvider.sent, FakeProvider.replied_to = [], [], []
        for target, options in (
            (
                "services.customers.classification.get_completion",
                {"side_effect": CopilotNotConfigured("no model in tests")},
            ),
            ("services.mail.sync.get_provider", {"return_value": FakeProvider()}),
        ):
            patcher = patch(target, **options)
            patcher.start()
            self.addCleanup(patcher.stop)

    def post(self, user, mine, verb):
        return self.client_for(user).post(f"{URL}{mine.pk}/{verb}/", {}, format="json")

    def stuck(self, by=UNCONFIRMED_AFTER + timedelta(seconds=1)):
        mine = draft(self.mail, self.csm, status=ReplyDraft.Status.SENDING)
        aged(mine, by)
        return mine

    # -- the payload's `sending` -------------------------------------------

    def test_sending_is_null_unless_the_draft_is_being_sent(self):
        client = self.client_for(self.csm)
        mine = draft(self.mail, self.csm)
        self.assertIsNone(client.get(f"{URL}{mine.pk}/").data["sending"])
        ReplyDraft.objects.filter(pk=mine.pk).update(status="sent", sent_at=timezone.now())
        body = client.get(f"{URL}{mine.pk}/").data
        self.assertEqual((body["status"], body["sending"]), ("sent", None))

    def test_sending_is_pending_then_unconfirmed(self):
        client = self.client_for(self.csm)
        mine = draft(self.mail, self.csm, status=ReplyDraft.Status.SENDING)
        aged(mine, UNCONFIRMED_AFTER - timedelta(seconds=5))
        body = client.get(f"{URL}{mine.pk}/").data
        self.assertEqual((body["status"], body["sending"]), ("sent", "pending"))
        aged(mine, UNCONFIRMED_AFTER + timedelta(seconds=5))
        body = client.get(f"{URL}{mine.pk}/").data
        self.assertEqual((body["status"], body["sending"]), ("sent", "unconfirmed"))
        listed = client.get(URL, {"status": "sent"}).data["results"]
        self.assertEqual([row["sending"] for row in listed], ["unconfirmed"])

    def test_can_resolve_only_for_the_owner_once_unconfirmed(self):
        mine = draft(self.mail, self.csm, status=ReplyDraft.Status.SENDING)
        aged(mine, UNCONFIRMED_AFTER - timedelta(seconds=5))
        owner = self.client_for(self.csm)
        self.assertFalse(owner.get(f"{URL}{mine.pk}/").data["can_resolve"])
        aged(mine, UNCONFIRMED_AFTER + timedelta(seconds=5))
        self.assertTrue(owner.get(f"{URL}{mine.pk}/").data["can_resolve"])
        # Mail is owner-only (2026-10-17): Mona never reads Carl's unsent reply,
        # not even once he adds the email to Revenact.
        self.assertEqual(self.client_for(self.mona).get(f"{URL}{mine.pk}/").status_code, 404)
        share(self.mail)
        self.assertEqual(self.client_for(self.mona).get(f"{URL}{mine.pk}/").status_code, 404)
        for state in ("open", "sent"):
            ReplyDraft.objects.filter(pk=mine.pk).update(status=state)
            aged(mine, timedelta(hours=1))
            self.assertFalse(owner.get(f"{URL}{mine.pk}/").data["can_resolve"])

    # -- a timeout on send -------------------------------------------------

    def test_a_timeout_after_the_request_went_out_is_504_and_stays_sending(self):
        mine = draft(self.mail, self.csm)
        with patch("services.mail.sync.get_provider", return_value=TimingOut()):
            response = self.post(self.csm, mine, "send")
        self.assertEqual(
            (response.status_code, response.data),
            (
                504,
                {
                    "code": "SEND_UNCONFIRMED",
                    "detail": "We couldn't confirm this was sent. Check your Sent folder.",
                },
            ),
        )
        mine.refresh_from_db()
        self.assertEqual(mine.status, "sending")
        body = self.client_for(self.csm).get(f"{URL}{mine.pk}/").data
        self.assertEqual(body["sending"], "pending")
        again = self.post(self.csm, mine, "send")
        self.assertEqual((again.status_code, again.data["code"]), (409, "ALREADY_SENT"))

    def test_an_smtp_disconnect_after_the_hand_over_is_504_and_stays_sending(self):
        mine = draft(self.mail, self.csm)

        class Dropped(FakeProvider):
            def send(self, creds, **message):
                raise SendUnconfirmed("SMTP send unconfirmed: SMTPServerDisconnected")

        with patch("services.mail.sync.get_provider", return_value=Dropped()):
            response = self.post(self.csm, mine, "send")
        self.assertEqual((response.status_code, response.data["code"]), (504, "SEND_UNCONFIRMED"))
        mine.refresh_from_db()
        self.assertEqual(mine.status, "sending")
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.status, "connected")

    def via_urlopen(self, error):
        """A provider whose send goes over `http_json`, its wire raising `error`."""

        class Wire(FakeProvider):
            def send(self, creds, **message):
                http_json("POST", "https://gmail.googleapis.com/x", data={})

        return (
            patch("services.mail.sync.get_provider", return_value=Wire()),
            patch(URLOPEN, side_effect=error),
        )

    def test_no_answer_to_the_request_is_504_and_stays_sending(self):
        for error in (
            TimeoutError("read timed out"),
            http.client.RemoteDisconnected("gone"),
            http.client.IncompleteRead(b""),
            ConnectionResetError("reset"),
        ):
            with self.subTest(error=type(error).__name__):
                mine = draft(self.mail, self.csm)
                provider, wire = self.via_urlopen(error)
                with provider, wire:
                    response = self.post(self.csm, mine, "send")
                self.assertEqual(
                    (response.status_code, response.data["code"]), (504, "SEND_UNCONFIRMED")
                )
                mine.refresh_from_db()
                self.assertEqual(mine.status, "sending")
                mine.delete()

    def test_failing_to_reach_the_host_reopens_it(self):
        mine = draft(self.mail, self.csm)
        provider, wire = self.via_urlopen(urllib.error.URLError(socket.timeout("timed out")))
        with provider, wire:
            response = self.post(self.csm, mine, "send")
        self.assertEqual(response.status_code, 502)
        mine.refresh_from_db()
        self.assertEqual(mine.status, "open")

    def test_a_token_refresh_timing_out_reopens_it(self):
        mine = draft(self.mail, self.csm)

        class Refreshing(FakeProvider):
            def send(self, creds, **message):
                GoogleProvider()._fresh(EXPIRED)

        with (
            patch("services.mail.sync.get_provider", return_value=Refreshing()),
            patch(URLOPEN, side_effect=TimeoutError("read timed out")),
        ):
            response = self.post(self.csm, mine, "send")
        self.assertEqual(response.status_code, 502)
        mine.refresh_from_db()
        self.assertEqual(mine.status, "open")
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.status, "connected")

    # -- a late answer to the first send (M2) --------------------------------

    def late_success(self, mine, meanwhile):
        """Send `mine`; while the provider holds it, `meanwhile()` runs."""

        class Slow(FakeProvider):
            def send(self, creds, **message):
                meanwhile()
                return super().send(creds, **message)

        sent_before = Email.objects.filter(direction="sent").count()
        with patch("services.mail.sync.get_provider", return_value=Slow()):
            response = self.post(self.csm, mine, "send")
        self.assertEqual((response.status_code, response.data), (409, SUPERSEDED))
        # The mail did go: filed and audited, never `reply_draft.sent`.
        self.assertEqual(Email.objects.filter(direction="sent").count(), sent_before + 1)
        self.assertEqual(AuditEvent.objects.filter(action="mailbox.reply").count(), 1)
        self.assertFalse(AuditEvent.objects.filter(action="reply_draft.sent").exists())

    def test_a_late_success_never_overwrites_a_draft_sent_again(self):
        mine = draft(self.mail, self.csm)
        later = timezone.now() + timedelta(minutes=11)
        self.late_success(
            mine,
            lambda: ReplyDraft.objects.filter(pk=mine.pk).update(
                status="sending", updated_at=later
            ),
        )
        mine.refresh_from_db()
        self.assertEqual(
            (mine.status, mine.updated_at, mine.sent_email, mine.sent_at),
            ("sending", later, None, None),
        )

    def test_a_late_success_never_overwrites_a_reopened_draft(self):
        mine = draft(self.mail, self.csm)
        later = timezone.now() + timedelta(minutes=11)
        self.late_success(
            mine,
            lambda: ReplyDraft.objects.filter(pk=mine.pk).update(status="open", updated_at=later),
        )
        mine.refresh_from_db()
        self.assertEqual((mine.status, mine.updated_at, mine.sent_email), ("open", later, None))

    def test_a_late_success_after_the_draft_was_discarded(self):
        mine = draft(self.mail, self.csm)
        self.late_success(mine, lambda: ReplyDraft.objects.filter(pk=mine.pk).delete())
        self.assertFalse(ReplyDraft.objects.filter(pk=mine.pk).exists())
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual(event.target_id, str(self.mail.pk))

    def test_a_late_refusal_never_reopens_a_draft_that_moved_on(self):
        mine = draft(self.mail, self.csm)
        later = timezone.now() + timedelta(minutes=11)

        class SlowRefusal(FakeProvider):
            def send(self, creds, **message):
                ReplyDraft.objects.filter(pk=mine.pk).update(status="sending", updated_at=later)
                raise ProviderError("try later")

        with patch("services.mail.sync.get_provider", return_value=SlowRefusal()):
            self.assertEqual(self.post(self.csm, mine, "send").status_code, 502)
        mine.refresh_from_db()
        self.assertEqual((mine.status, mine.updated_at), ("sending", later))

    # -- confirm-sent ------------------------------------------------------

    def test_the_owner_confirms_it_went(self):
        mine = self.stuck()
        response = self.post(self.csm, mine, "confirm-sent")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (
                response.data["status"],
                response.data["sending"],
                response.data["sent_by"],
                response.data["can_resolve"],
            ),
            ("sent", None, {"id": self.csm.pk, "name": "Carl CSM"}, False),
        )
        self.assertIsNotNone(response.data["sent_at"])
        mine.refresh_from_db()
        self.assertEqual((mine.status, mine.sent_by, mine.sent_email), ("sent", self.csm, None))
        event = AuditEvent.objects.get(action="reply_draft.confirmed_sent")
        self.assertEqual((event.actor_id, event.target_id), (self.csm.pk, str(mine.pk)))

    # -- reopen ------------------------------------------------------------

    def test_the_owner_reopens_it_and_can_send_it_again(self):
        mine = self.stuck()
        response = self.post(self.csm, mine, "reopen")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["status"], response.data["sending"], response.data["can_edit"]),
            ("open", None, True),
        )
        mine.refresh_from_db()
        self.assertEqual(mine.status, "open")
        self.assertGreater(mine.updated_at, timezone.now() - timedelta(minutes=1))
        event = AuditEvent.objects.get(action="reply_draft.reopened")
        self.assertEqual((event.actor_id, event.target_id), (self.csm.pk, str(mine.pk)))
        # Still the one open draft for its source.
        with self.assertRaises(IntegrityError), transaction.atomic():
            draft(self.mail, self.csm)
        sent = self.post(self.csm, mine, "send")
        self.assertEqual(sent.status_code, 200, sent.data)
        self.assertEqual(sent.data["draft"]["status"], "sent")

    # -- the guard ---------------------------------------------------------

    def test_too_early_is_409(self):
        for verb in ("confirm-sent", "reopen"):
            mine = self.stuck(UNCONFIRMED_AFTER - timedelta(seconds=30))
            response = self.post(self.csm, mine, verb)
            self.assertEqual((response.status_code, response.data), (409, NOT_UNCONFIRMED))
            mine.refresh_from_db()
            self.assertEqual(mine.status, "sending")
            mine.delete()

    def test_an_open_or_sent_draft_is_409(self):
        for state in ("open", "sent"):
            mine = draft(self.mail, self.csm, status=state)
            aged(mine, timedelta(hours=1))
            for verb in ("confirm-sent", "reopen"):
                response = self.post(self.csm, mine, verb)
                self.assertEqual((response.status_code, response.data), (409, NOT_UNCONFIRMED))
            mine.refresh_from_db()
            self.assertEqual(mine.status, state)
            mine.delete()
        self.assertFalse(
            AuditEvent.objects.filter(
                action__in=["reply_draft.confirmed_sent", "reply_draft.reopened"]
            ).exists()
        )

    def test_the_second_click_loses(self):
        for verb, first, other in (
            ("confirm-sent", "confirm-sent", "reopen"),
            ("reopen", "reopen", "confirm-sent"),
        ):
            mine = self.stuck()
            self.assertEqual(self.post(self.csm, mine, first).status_code, 200)
            for second in (verb, other):
                response = self.post(self.csm, mine, second)
                self.assertEqual((response.status_code, response.data), (409, NOT_UNCONFIRMED))
            mine.delete()

    def test_only_the_owner(self):
        mine = self.stuck()
        for verb in ("confirm-sent", "reopen"):
            # Mail is owner-only (2026-10-17): Carl's manager can't even read it.
            self.assertEqual(self.post(self.other, mine, verb).status_code, 404)
            self.assertEqual(self.post(self.mona, mine, verb).status_code, 404)
        share(self.mail)  # a shared conversation; the draft is still Carl's alone
        for verb in ("confirm-sent", "reopen"):
            self.assertEqual(self.post(self.mona, mine, verb).status_code, 404)
        mine.refresh_from_db()
        self.assertEqual(mine.status, "sending")
