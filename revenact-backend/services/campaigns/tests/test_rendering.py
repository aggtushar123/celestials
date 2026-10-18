"""Plain-text rendering (spec §1.5): three merge fields, filled by plain
replacement (never `str.format`), nothing escaped into HTML, a one-line
subject, and the fixed footer with the unsubscribe link."""

from types import SimpleNamespace

from django.conf import settings
from django.test import SimpleTestCase

from services.campaigns import validation as say
from services.campaigns.rendering import (
    compose,
    first_name,
    footer,
    link,
    organisation_name,
    render,
)
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.tests.fixtures import contact


class MergeFieldTests(SimpleTestCase):
    def test_only_the_three_fields_pass(self):
        self.assertEqual(
            say.merge_field_errors("Hi {first_name} at {organisation}, {sender_name}"), []
        )
        self.assertEqual(say.merge_field_errors("Hi {name} {first_name} {0} {}"), ["name", "0", ""])
        self.assertEqual(say.merge_field_errors("No fields, {{ nor braces"), [])

    def test_the_words(self):
        self.assertEqual(
            say.MERGE_FIELDS_ONLY, "Use {first_name}, {organisation} or {sender_name}."
        )
        self.assertEqual(
            say.EMAIL_NOT_SET_UP,
            "Email isn't set up for this workspace yet, so campaigns can't be sent.",
        )
        self.assertEqual(say.NOT_OWNER, "Only the campaign's owner can change it.")
        self.assertEqual(say.CAMPAIGN_SENT, "Archive it instead: it has been sent.")
        self.assertEqual(say.NOBODY, "Nobody in this segment can be emailed right now.")
        self.assertEqual(
            say.CHOOSE_CAMPAIGN, "Choose one of your active campaigns for these records."
        )

    def test_first_name(self):
        self.assertEqual(first_name("Ann Lee"), "Ann")
        self.assertEqual(first_name("  Ann  "), "Ann")
        self.assertEqual(first_name(""), "there")
        self.assertEqual(first_name("   "), "there")

    def test_the_link_and_the_footer(self):
        self.assertEqual(link("abc"), f"{settings.FRONTEND_URL}/u/abc")
        self.assertEqual(
            footer("Carl CSM", "Acme Inc", "https://x/u/abc"),
            "—\nCarl CSM, Acme Inc\nUnsubscribe from these emails: https://x/u/abc",
        )


class RenderTests(CampaignFixture):
    def source(self, subject, body):
        return SimpleNamespace(subject=subject, body=body)

    def test_each_field_is_filled(self):
        subject, body = render(
            self.source("Hi {first_name}", "{organisation} misses {sender_name}"),
            self.ann,
            sender_name="Carl CSM",
        )
        self.assertEqual((subject, body), ("Hi Ann", "Pizza Hut misses Carl CSM"))

    def test_an_account_contact_names_its_account(self):
        self.assertEqual(organisation_name(self.ben), "Pizza EMEA")
        self.assertEqual(organisation_name(self.ann), "Pizza Hut")

    def test_nothing_is_escaped_or_formatted(self):
        odd = contact(self.pizza, "<b>{sender_name}</b>")
        subject, body = render(
            self.source("{first_name}", "{first_name} & {x}"), odd, sender_name="Carl"
        )
        # the contact's own braces are text, not a second round of fields
        self.assertEqual(subject, "<b>{sender_name}</b>")
        self.assertEqual(body, "<b>{sender_name}</b> & {x}")

    def test_the_subject_is_one_line(self):
        subject, _body = render(self.source("A\r\nB {first_name}", ""), self.ann, sender_name="C")
        self.assertEqual(subject, "A B Ann")

    def test_compose_appends_the_footer(self):
        subject, body = compose(
            self.source("Hi", "Body"),
            self.ann,
            sender_name="Carl CSM",
            workspace="Acme Inc",
            url="https://x/u/t",
        )
        self.assertEqual(
            (subject, body),
            ("Hi", "Body\n\n—\nCarl CSM, Acme Inc\nUnsubscribe from these emails: https://x/u/t"),
        )
