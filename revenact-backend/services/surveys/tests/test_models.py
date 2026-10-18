"""The two survey tables, their constraints, the link token and the log
row's link back to its send."""

import hashlib

from django.db import IntegrityError, transaction
from django.test import SimpleTestCase

from services.customers.models import Survey
from services.surveys import models as limits
from services.surveys.models import SurveyInvite
from services.surveys.tests.fixtures import SurveyFixture
from services.surveys.tokens import hash_token, new_token


class SendModelTests(SurveyFixture):
    def test_a_new_send_is_a_private_draft(self):
        send = self.make_send()
        self.assertEqual(
            (send.status, send.sharing, send.counts, send.started_at, send.sent_at),
            ("draft", "private", {}, None, None),
        )
        self.assertEqual(str(send), f"Survey send {send.pk}")

    def test_the_limits_are_the_specs(self):
        self.assertEqual(
            (
                limits.LINK_DAYS,
                limits.QUIET_DAYS,
                limits.WINDOW_DAYS,
                limits.PER_RECORD_CAP,
                limits.MAX_PEOPLE,
                limits.DAILY_SENDS,
                limits.MAX_SHARED,
            ),
            (14, 30, 90, 3, 500, 20, 50),
        )

    def test_deleting_the_segment_keeps_the_send(self):
        segment = self.pinned("customer", [self.pizza])
        send = self.make_send(segment=segment)
        segment.delete()
        send.refresh_from_db()
        self.assertIsNone(send.segment)

    def test_deleting_a_send_deletes_its_invites(self):
        send = self.make_send()
        self.make_invite(send, self.ann)
        send.delete()
        self.assertFalse(SurveyInvite.objects.exists())


class InviteModelTests(SurveyFixture):
    def test_an_invite_belongs_to_exactly_one_record(self):
        send = self.make_send()
        for parents in ({}, {"customer": self.pizza, "account": self.emea}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                SurveyInvite.objects.create(
                    send=send,
                    email="x@example.com",
                    token_hash=hash_token(str(parents)),
                    expires_at=self.now,
                    **parents,
                )

    def test_the_token_hash_is_unique(self):
        send = self.make_send()
        self.make_invite(send, self.ann, token="same")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_invite(send, self.ben, token="same")

    def test_a_score_is_0_to_10(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_invite(self.make_send(), self.ann, score=11)

    def test_an_answer_has_a_score_and_a_time(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_invite(self.make_send(), self.ann, status="answered")

    def test_a_deleted_contact_keeps_the_answer_unnamed(self):
        invite = self.answered(self.make_send(), self.ann, 9)
        self.ann.delete()
        invite.refresh_from_db()
        self.assertEqual((invite.contact, invite.customer, invite.score), (None, self.pizza, 9))
        self.assertEqual(str(invite), f"Survey invite {invite.pk}")


class SurveyLogLinkTests(SurveyFixture):
    def log_row(self, send, **parent):
        return Survey.objects.create(
            survey_type="nps", status="responded", score=40, sent_at=self.today, send=send, **parent
        )

    def test_a_log_row_keeps_its_score_when_its_send_goes(self):
        send = self.make_send()
        row = self.log_row(send, customer=self.pizza)
        send.delete()
        row.refresh_from_db()
        self.assertEqual((row.send, row.score), (None, 40))

    def test_one_log_row_per_send_and_record(self):
        send = self.make_send()
        self.log_row(send, customer=self.pizza)
        self.log_row(send, account=self.emea)
        self.log_row(send, customer=self.taco)
        for parent in ({"customer": self.pizza}, {"account": self.emea}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                self.log_row(send, **parent)

    def test_rows_logged_by_hand_are_not_limited(self):
        self.log_row(None, customer=self.pizza)
        self.log_row(None, customer=self.pizza)
        self.assertEqual(Survey.objects.filter(customer=self.pizza).count(), 2)


class TokenTests(SimpleTestCase):
    def test_a_token_is_32_random_bytes_url_safe_and_only_its_hash_is_kept(self):
        token, token_hash = new_token()
        self.assertGreaterEqual(len(token), 43)
        self.assertRegex(token, r"^[A-Za-z0-9_-]+$")
        self.assertEqual(token_hash, hashlib.sha256(token.encode()).hexdigest())
        self.assertEqual(len(token_hash), 64)

    def test_every_token_is_new(self):
        self.assertEqual(len({new_token()[0] for _ in range(20)}), 20)

    def test_the_hash_is_stable(self):
        self.assertEqual(hash_token("abc"), hashlib.sha256(b"abc").hexdigest())
