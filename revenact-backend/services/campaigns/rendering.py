"""A campaign email as one person reads it (spec §1.5). Plain text: the
merge fields are filled in one pass over the owner's own text (never
`str.format`), so a contact's name holding braces is never read as a field,
and nothing is escaped into HTML. The subject is kept to one line
(an email header cannot hold a line break)."""

from django.conf import settings

from .validation import FIELD_PATTERN

#: What a preview's footer links to: never a working token.
PREVIEW_TOKEN = "preview"


def first_name(name):
    words = (name or "").split()
    return words[0] if words else "there"


def organisation_name(contact):
    parent = contact.customer if contact.customer_id else contact.account
    return parent.name if parent is not None else ""


def link(token):
    return f"{settings.FRONTEND_URL}/u/{token}"


def footer(sender_name, workspace, url):
    return f"—\n{sender_name}, {workspace}\nUnsubscribe from these emails: {url}"


def _fill(text, values):
    """One pass over the owner's own text: a value put in is never read
    again, so a contact named "{sender_name}" stays that text."""
    return FIELD_PATTERN.sub(lambda match: values.get(match.group(1), match.group(0)), text or "")


def render(source, contact, *, sender_name):
    """(subject, body) for `contact`, without the footer."""
    values = {
        "first_name": first_name(contact.name),
        "organisation": organisation_name(contact),
        "sender_name": sender_name,
    }
    subject = " ".join(_fill(source.subject, values).split())
    return subject, _fill(source.body, values)


def compose(source, contact, *, sender_name, workspace, url):
    """(subject, body) as the email carries them: the body and the footer."""
    subject, body = render(source, contact, sender_name=sender_name)
    return subject, f"{body}\n\n{footer(sender_name, workspace, url)}"
