"""The mail HTML policy (contract §6): layout survives, anything that runs
or submits does not, only http, https, mailto and cid URLs are kept, and an
oversized result is dropped for the text body."""

from django.test import SimpleTestCase, override_settings

from services.mail import html
from services.mail.html import sanitise


@override_settings(MAIL_HTML_MAX_BYTES=1_000_000)
class SanitiseTests(SimpleTestCase):
    def test_layout_and_style_blocks_survive(self):
        clean = sanitise(
            '<style>p{color:red}</style><table cellpadding="2"><tr>'
            '<td bgcolor="#fff" colspan="2" style="padding:4px">c</td></tr></table>'
            '<center><font color="red">f</font></center>'
        )
        for kept in (
            "<style>p{color:red}</style>",
            'cellpadding="2"',
            'bgcolor="#fff"',
            'colspan="2"',
            'style="padding:4px"',
            "<center>",
            '<font color="red">',
        ):
            self.assertIn(kept, clean)

    def test_anything_that_runs_or_submits_goes(self):
        clean = sanitise(
            '<p onclick="steal()">hi</p><script>alert(1)</script>'
            '<iframe src="https://x.io"></iframe><object>o</object><embed src="x">'
            '<form><input value="1"><button>b</button></form><svg><circle/></svg>'
            '<math><mi>x</mi></math><link rel="stylesheet" href="https://x.io/s.css">'
            '<meta http-equiv="refresh" content="0"><base href="https://x.io/">'
        )
        for gone in (
            "onclick",
            "<script",
            "alert(1)",
            "<iframe",
            "<object",
            "<embed",
            "<form",
            "<input",
            "<button",
            "<svg",
            "<math",
            "<link",
            "<meta",
            "<base",
        ):
            self.assertNotIn(gone, clean)
        self.assertIn("<p>hi</p>", clean)

    def test_only_http_https_mailto_and_cid_urls(self):
        clean = sanitise(
            '<a href="javascript:x()">j</a><a href="vbscript:x">v</a>'
            '<a href="mailto:ann@pizzahut.com">m</a><a href="https://pizzahut.com" title="t">h</a>'
            '<img src="data:image/png;base64,AAAA"><img src="cid:logo@pizzahut.com" alt="logo">'
            '<img src="https://cdn.pizzahut.com/sig.png" width="10">'
        )
        for gone in ("javascript:", "vbscript:", "data:"):
            self.assertNotIn(gone, clean)
        for kept in (
            'href="mailto:ann@pizzahut.com"',
            'href="https://pizzahut.com"',
            'title="t"',
            'src="cid:logo@pizzahut.com"',
            # Remote images stay; the frontend's sandbox blocks them until asked.
            'src="https://cdn.pizzahut.com/sig.png"',
            'rel="noopener noreferrer"',
        ):
            self.assertIn(kept, clean)

    def test_remote_css_is_left_in_place(self):
        self.assertIn(
            "url(https://x.io/a.png)",
            sanitise('<div style="background:url(https://x.io/a.png)">x</div>'),
        )

    @override_settings(MAIL_HTML_MAX_BYTES=40)
    def test_an_oversized_result_is_dropped(self):
        self.assertEqual(sanitise("<p>" + "x" * 100 + "</p>"), "")

    def test_nothing_is_nothing(self):
        self.assertEqual(sanitise(""), "")


class RestoreSignatureTests(SimpleTestCase):
    """Round 2 D1 contract R2D1-16."""

    BLOCK = (
        '<div data-revenact-signature=""><div>Dana<br>'
        '<img src="https://dough.co/l.png"></div></div>'
    )

    def test_the_block_is_replaced_nested_divs_and_all(self):
        edited = '<p>Hi</p><div data-revenact-signature="">Dana<div>x</div></div><p>after</p>'
        self.assertEqual(
            html.restore_signature(edited, self.BLOCK), f"<p>Hi</p>{self.BLOCK}<p>after</p>"
        )

    def test_no_block_stays_none(self):
        self.assertEqual(html.restore_signature("<p>Hi</p>", self.BLOCK), "<p>Hi</p>")

    def test_an_empty_signature_removes_the_block(self):
        edited = '<p>Hi</p><div data-revenact-signature="">Dana</div>'
        self.assertEqual(html.restore_signature(edited, ""), "<p>Hi</p>")
