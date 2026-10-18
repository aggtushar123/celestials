"""The MIME builder (D3 contract §4 "The message"): text alone, or
multipart/alternative; files make multipart/mixed; a forward's inline
images ride in multipart/related; From is RFC 2047 encoded; In-Reply-To and
References answer the source; no Message-ID; Bcc kept in the owner's copy."""

import email
from email import policy

from django.test import SimpleTestCase

from services.mail import mime


def parsed(out):
    return email.message_from_bytes(mime.build(out), policy=policy.default)


def outgoing(**fields):
    values = {
        "from_name": "Dana Ruiz",
        "from_address": "dana@acme.io",
        "to": [["Ann Lee", "ann@pizzahut.com"]],
        "subject": "Re: Renewal terms",
        "text": "Works for us.",
    }
    values.update(fields)
    return mime.Outgoing(**values)


class MimeTests(SimpleTestCase):
    def test_text_alone_is_one_text_part_with_the_headers(self):
        message = parsed(outgoing())
        self.assertEqual(message.get_content_type(), "text/plain")
        self.assertEqual(message.get_content().strip(), "Works for us.")
        self.assertEqual(message["From"].addresses[0].display_name, "Dana Ruiz")
        self.assertEqual(message["From"].addresses[0].addr_spec, "dana@acme.io")
        self.assertEqual(message["To"].addresses[0].addr_spec, "ann@pizzahut.com")
        self.assertEqual(str(message["Subject"]), "Re: Renewal terms")
        self.assertIsNotNone(message["Date"])
        self.assertIsNone(message["Message-ID"])
        self.assertIsNone(message["In-Reply-To"])

    def test_html_makes_an_alternative_text_first(self):
        message = parsed(outgoing(html="<p>Works for us.</p>"))
        self.assertEqual(message.get_content_type(), "multipart/alternative")
        plain, html = message.get_payload()
        self.assertEqual(plain.get_content_type(), "text/plain")
        self.assertEqual(html.get_content_type(), "text/html")
        self.assertIn("<html><body><p>Works for us.</p></body></html>", html.get_content())

    def test_files_make_a_mixed_message(self):
        quote = mime.Part("Quote v2.pdf", "application/pdf", b"%PDF-1.4 quote")
        message = parsed(outgoing(html="<p>Attached.</p>", attachments=[quote]))
        self.assertEqual(message.get_content_type(), "multipart/mixed")
        body, attached = message.get_payload()
        self.assertEqual(body.get_content_type(), "multipart/alternative")
        self.assertEqual(attached.get_content_disposition(), "attachment")
        self.assertEqual(attached.get_filename(), "Quote v2.pdf")
        self.assertEqual(attached.get_content_type(), "application/pdf")
        self.assertEqual(attached.get_content(), b"%PDF-1.4 quote")

    def test_a_forwards_inline_images_ride_in_related_around_the_html(self):
        logo = mime.Part("logo.png", "image/png", b"\x89PNG logo", content_id="logo@pizzahut")
        message = parsed(
            outgoing(html='<p>See below.</p><img src="cid:logo@pizzahut">', related=[logo])
        )
        plain, related = message.get_payload()
        self.assertEqual(related.get_content_type(), "multipart/related")
        html, image = related.get_payload()
        self.assertEqual(html.get_content_type(), "text/html")
        self.assertEqual(image["Content-ID"], "<logo@pizzahut>")
        self.assertEqual(image.get_content(), b"\x89PNG logo")

    def test_a_reply_answers_its_source_with_the_newest_twenty_references(self):
        older = " ".join(f"<m{n}@x>" for n in range(25))
        message = parsed(outgoing(in_reply_to="<quote@x>", references=older))
        self.assertEqual(message["In-Reply-To"], "<quote@x>")
        ids = str(message["References"]).split()
        self.assertEqual(len(ids), 20)
        self.assertEqual(ids[-1], "<quote@x>")
        self.assertEqual(ids[0], "<m6@x>")

    def test_references_name_each_id_once(self):
        self.assertEqual(mime.references_header("<a@x> <b@x>", "<b@x>"), "<a@x> <b@x>")
        self.assertEqual(mime.references_header("", "<b@x>"), "<b@x>")

    def test_cc_and_bcc_are_kept_in_the_owners_copy(self):
        message = parsed(outgoing(cc=[["", "ops@pizzahut.com"]], bcc=[["", "carl@acme.io"]]))
        self.assertEqual(message["Cc"].addresses[0].addr_spec, "ops@pizzahut.com")
        self.assertEqual(message["Bcc"].addresses[0].addr_spec, "carl@acme.io")

    def test_a_non_ascii_name_is_encoded(self):
        raw = mime.build(outgoing(from_name="Dána Ruíz"))
        self.assertIn(b"=?utf-8?", raw.split(b"\r\n\r\n", 1)[0])
        self.assertEqual(
            parsed(outgoing(from_name="Dána Ruíz"))["From"].addresses[0].display_name, "Dána Ruíz"
        )

    def test_an_unknown_type_goes_as_octet_stream(self):
        odd = mime.Part("notes", "", b"plain bytes")
        attached = parsed(outgoing(attachments=[odd])).get_payload()[1]
        self.assertEqual(attached.get_content_type(), "application/octet-stream")
