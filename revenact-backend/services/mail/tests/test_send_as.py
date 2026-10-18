"""The send-as name and signature (D3 decisions 17, 18): read from Gmail's
primary sendAs entry, sanitised, refreshed by the tick when older than
MAIL_SEND_AS_REFRESH_HOURS and after every connect; a failure is a tick
failure. The HTML helpers a draft's text and signature need."""

from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from services.mail import gmail_sync, html, send_as, views
from services.mail.models import MailboxConnection
from services.mail.providers.base import Credentials

from .gmail_fixtures import CREDENTIALS, GRANTED, GmailFixture


class RefreshTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )

    def tick(self, now):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        result = gmail_sync.tick(connection, now=now)
        self.mailbox.refresh_from_db()
        return result

    def reads(self):
        return [where for _, where, _ in self.fake.calls if where.endswith("/settings/sendAs")]

    def test_the_first_tick_stores_the_primary_entry_sanitised(self):
        self.fake.send_as = [
            {"sendAsEmail": "alias@acme.io", "displayName": "Alias", "isPrimary": False},
            {
                "sendAsEmail": "dana@acme.io",
                "displayName": "Dana Ruiz",
                "signature": '<div dir="ltr">Dana Ruiz<script>alert(1)</script><br>Acme</div>',
                "isPrimary": True,
            },
        ]
        self.assertEqual(self.tick(self.now).outcome, "ok")
        self.assertEqual(self.mailbox.send_as_name, "Dana Ruiz")
        self.assertIn("Dana Ruiz", self.mailbox.signature_html)
        self.assertNotIn("script", self.mailbox.signature_html)
        self.assertEqual(self.mailbox.send_as_synced_at, self.now)

    def test_without_a_primary_entry_the_mailboxs_own_address_is_used(self):
        self.fake.send_as = [
            {"sendAsEmail": "alias@acme.io", "displayName": "Alias"},
            {"sendAsEmail": "Dana@Acme.io", "displayName": "Dana R"},
        ]
        self.tick(self.now)
        self.assertEqual(self.mailbox.send_as_name, "Dana R")

    def test_refreshed_once_a_day(self):
        self.tick(self.now)
        self.tick(self.now + timedelta(hours=1))
        self.assertEqual(len(self.reads()), 1)
        self.tick(self.now + timedelta(hours=25))
        self.assertEqual(len(self.reads()), 2)

    def test_a_failure_is_a_tick_failure(self):
        self.fake.fail(r"/settings/sendAs$", 503)
        self.assertEqual(self.tick(self.now).outcome, "backoff")
        self.assertIsNone(self.mailbox.send_as_synced_at)

    def test_a_reconnect_reads_it_again(self):
        self.tick(self.now)
        request = APIRequestFactory().post("/")
        request.user = self.dana
        creds = Credentials(address="dana@acme.io", data=dict(CREDENTIALS), scopes=list(GRANTED))
        views._save_google(request, self.dana, creds, {"historyId": "5", "messagesTotal": 3})
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.send_as_synced_at)

    def test_the_signature_block(self):
        self.mailbox.signature_html = "Dana Ruiz<br>Acme"
        self.assertEqual(
            send_as.signature_block(self.mailbox),
            "<div data-revenact-signature>Dana Ruiz<br>Acme</div>",
        )
        self.mailbox.signature_html = ""
        self.assertEqual(send_as.signature_block(self.mailbox), "")


class HtmlHelperTests(SimpleTestCase):
    def test_text_from_a_reply_with_its_signature_and_quote(self):
        markup = html.sanitise(
            "<p>Works for us.</p>"
            "<div data-revenact-signature>Dana Ruiz<br>Dough Co</div>"
            '<div class="gmail_quote">On 11 Oct 2026, Ann Lee &lt;ann@pizzahut.com&gt; wrote:'
            "<blockquote><p>Can we do two years?</p></blockquote></div>"
        )
        self.assertIn("data-revenact-signature", markup)
        self.assertEqual(
            html.to_text(markup),
            "Works for us.\n\n-- \nDana Ruiz\nDough Co\n\n"
            "On 11 Oct 2026, Ann Lee <ann@pizzahut.com> wrote:\n> Can we do two years?",
        )

    def test_text_from_lists_and_an_empty_paragraph(self):
        self.assertEqual(html.to_text("<p></p><ul><li>One</li><li>Two</li></ul>"), "- One\n- Two")
        self.assertEqual(html.to_text(""), "")

    def test_paragraphs_from_text(self):
        self.assertEqual(
            html.paragraphs("Hi Ann,\nthanks.\n\n<b>Two</b> years."),
            "<p>Hi Ann,<br>thanks.</p><p>&lt;b&gt;Two&lt;/b&gt; years.</p>",
        )
        self.assertEqual(html.paragraphs("  "), "")

    def test_clean_never_empties_a_long_message(self):
        long = "<p>" + "x" * 1_100_000 + "</p>"
        self.assertEqual(html.sanitise(long), "")
        self.assertTrue(html.clean(long).startswith("<p>x"))
