"""Mail HTML, made safe once, when it is stored (contract §6).

An allow-list (nh3, the Rust `ammonia` sanitiser): layout tags, tables,
inline styles and <style> blocks survive, because that is what mail is made
of; anything that runs, submits or loads a document (script, iframe,
object, embed, form controls, svg, math, link, meta, base) is stripped,
every on* handler goes, and only http, https, mailto and cid URLs are kept.
Remote images and CSS url() are left in place: the frontend renders the
result in a sandboxed iframe (no scripts, no same-origin) whose CSP blocks
remote images until the person asks. The raw HTML is never kept.
"""

import re
from html import escape
from html.parser import HTMLParser

import nh3
from django.conf import settings

TAGS = frozenset(nh3.ALLOWED_TAGS) | {
    "style",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "colgroup",
    "col",
    "center",
    "font",
    "span",
}
#: Marks the signature inside a draft's HTML (D3 decision 17). Allowed on
#: div, or every write would strip it.
SIGNATURE_ATTR = "data-revenact-signature"
GENERIC_ATTRIBUTES = frozenset(
    {
        "style",
        "class",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "color",
        "border",
        "cellpadding",
        "cellspacing",
        "colspan",
        "rowspan",
        "dir",
        "lang",
    }
)
ATTRIBUTES = {
    "*": GENERIC_ATTRIBUTES,
    "a": frozenset({"href", "title"}),
    "div": frozenset({SIGNATURE_ATTR}),
    "img": frozenset({"src", "alt", "width", "height"}),
}
URL_SCHEMES = frozenset({"http", "https", "mailto", "cid"})


def clean(raw):
    """The safe HTML for `raw`, whatever its size ("" when there is none). A
    draft's write checks the size itself and answers 400 instead of
    silently dropping the person's writing (D3 §3)."""
    if not raw:
        return ""
    return nh3.clean(
        raw,
        tags=set(TAGS),
        # <style> is a tag we keep; only a script's content is dropped with it.
        clean_content_tags={"script"},
        attributes={tag: set(names) for tag, names in ATTRIBUTES.items()},
        url_schemes=set(URL_SCHEMES),
        link_rel="noopener noreferrer",
        strip_comments=True,
    )


def sanitise(raw):
    """The safe HTML for `raw`; "" when there is none, or when the result is
    over MAIL_HTML_MAX_BYTES (the text body is shown instead)."""
    safe = clean(raw)
    if len(safe.encode()) > settings.MAIL_HTML_MAX_BYTES:
        return ""
    return safe


#: Tags that end a paragraph of the text version.
BLOCKS = frozenset({"p", "div", "ul", "ol", "table", "pre", "h1", "h2", "h3", "h4", "h5", "h6"})


class _Text(HTMLParser):
    """A draft's HTML as the text sent beside it (D3 §1 `text`): paragraphs
    apart by a blank line, `-- ` before the signature, `> ` before a quote."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines = []  # (quote depth, text)
        self.line = ""
        self.depth = 0
        self.skip = 0

    def _end_line(self):
        self.lines.append((self.depth, self.line.strip()))
        self.line = ""

    def _paragraph(self):
        """Ends the line, then one blank line, unless a quote has just opened."""
        if self.line.strip():
            self._end_line()
        if self.lines and self.lines[-1][1] != "" and self.lines[-1][0] == self.depth:
            self.lines.append((self.depth, ""))

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.skip += 1
        elif tag in ("br", "tr"):
            if tag == "br" or self.line.strip():
                self._end_line()
        elif tag == "blockquote":
            if self.line.strip():
                self._end_line()
            self.depth += 1
        elif tag == "li":
            if self.line.strip():
                self._end_line()
            self.line = "- "
        elif tag == "div" and any(name == SIGNATURE_ATTR for name, _ in attrs):
            self._paragraph()
            self.lines.append((self.depth, "-- "))
        elif tag in BLOCKS:
            self._paragraph()

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.skip = max(self.skip - 1, 0)
        elif tag == "blockquote":
            if self.line.strip():
                self._end_line()
            self.depth = max(self.depth - 1, 0)
            self._paragraph()
        elif tag == "li":
            if self.line.strip():
                self._end_line()
        elif tag in BLOCKS:
            self._paragraph()

    def handle_data(self, data):
        if self.skip:
            return
        text = re.sub(r"\s+", " ", data)
        if not self.line.strip():
            text = text.lstrip()
        self.line += text

    def text(self):
        if self.line.strip():
            self._end_line()
        out = []
        for depth, text in self.lines:
            line = f"{'> ' * depth}{text}" if text else ""
            if line == "" and (not out or out[-1] == ""):
                continue
            out.append(line)
        while out and out[-1] == "":
            out.pop()
        return "\n".join(out)


def to_text(markup):
    """The plain text for a draft's sanitised HTML (D3 §1: derived, never the client's)."""
    parser = _Text()
    parser.feed(markup or "")
    parser.close()
    return parser.text()


def paragraphs(text):
    """Plain text as HTML paragraphs, line breaks kept and everything escaped."""
    blocks = [block for block in re.split(r"\n\s*\n", (text or "").strip()) if block.strip()]
    return "".join(
        "<p>" + "<br>".join(escape(line) for line in block.split("\n")) + "</p>" for block in blocks
    )


_SIGNATURE_OPEN = re.compile(rf"<div\b[^>]*\b{SIGNATURE_ATTR}\b[^>]*>", re.IGNORECASE)
_DIV = re.compile(r"<div\b[^>]*>|</div\s*>", re.IGNORECASE)


def restore_signature(markup, block):
    """`markup` (already sanitised) with its signature block, nested divs and
    all, replaced by `block`: the mailbox's signature as it is now (round 2
    D1 R2D1-16). No block, nothing to put back."""
    start = _SIGNATURE_OPEN.search(markup or "")
    if start is None:
        return markup
    depth, end = 0, len(markup)
    for tag in _DIV.finditer(markup, start.start()):
        depth += -1 if tag.group(0).startswith("</") else 1
        if depth == 0:
            end = tag.end()
            break
    return markup[: start.start()] + block + markup[end:]
