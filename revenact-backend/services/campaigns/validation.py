"""What a campaign may say, and every refusal's words. These are UI copy:
the frontend shows them as they are."""

import re

from .models import MAX_BODY, MAX_NAME, MAX_OWNED, MAX_SHARED, MAX_SUBJECT

NOT_OWNER = "Only the campaign's owner can change it."
NO_NAME = "Give it a name."
LONG_NAME = f"Keep the name to {MAX_NAME} characters."
LONG_SUBJECT = f"Keep the subject to {MAX_SUBJECT} characters."
LONG_BODY = f"Keep the body to {MAX_BODY} characters."
MERGE_FIELDS_ONLY = "Use {first_name}, {organisation} or {sender_name}."
OWN_SEGMENT = "Choose one of your own segments."
NO_TEAMMATES = "Choose at least one teammate."
TOO_MANY_SHARED = f"Share with at most {MAX_SHARED} teammates."
LIMIT_REACHED = f"You can own at most {MAX_OWNED} campaigns."
CHOOSE_STATUS = "Choose archived or active."
CAMPAIGN_SENT = "Archive it instead: it has been sent."
EMAIL_NOT_SET_UP = "Email isn't set up for this workspace yet, so campaigns can't be sent."
ARCHIVED = "This campaign is archived."
#: Copy shared with Rule.Paused.OWNER_INACTIVE and Segment's own nightly pause.
OWNER_INACTIVE = "Its owner is no longer active."
CHOOSE_SEGMENT = "Choose a segment first."
NEEDS_WORDS = "Write a subject and a body first."
NOBODY = "Nobody in this segment can be emailed right now."
NOT_IN_AUDIENCE = "Choose someone this campaign would email."
ONLY_THE_PERSON = "Only the person can unsubscribe, with the link in a campaign email."
EXPIRED = {"detail": "This link has expired."}
#: A rule's `campaign` action, when the campaign is not one it may use.
CHOOSE_CAMPAIGN = "Choose one of your active campaigns for these records."

MERGE_FIELDS = ("first_name", "organisation", "sender_name")
#: A `{…}` in the owner's text: a merge field, or a refusal.
FIELD_PATTERN = re.compile(r"\{([^{}]*)\}")


def merge_field_errors(text):
    """The `{…}` names in `text` that are not merge fields, in order."""
    return [name for name in FIELD_PATTERN.findall(text or "") if name not in MERGE_FIELDS]
