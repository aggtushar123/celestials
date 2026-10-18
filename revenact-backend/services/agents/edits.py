"""Checking a person's edits to a step (Agent bundles, contract §2, D11).
Each kind's `edit` runs a small serializer over the fields it allows and
returns the new payload; a refusal is `FieldErrors` with the first sentence
per field, the same sentence that field has on its own page."""

from rest_framework import serializers

from .kinds import FieldErrors

PAST = "Choose today or a later date."
NO_NOTE_TITLE = "Give the note a title."
NO_NOTE_BODY = "Write the note."
LONG_NOTE_BODY = "Keep the note under 4000 characters."
NO_REPLY = "Write the reply."
LONG_REPLY = "Keep the reply under 4000 characters."
NO_NAME = "Name it."


def _first(value):
    if isinstance(value, dict):
        return _first(next(iter(value.values()), ""))
    if isinstance(value, list):
        return _first(value[0]) if value else ""
    return str(value)


def checked(serializer_class, fields, **context):
    body = serializer_class(data=fields, context=context)
    if not body.is_valid():
        raise FieldErrors({key: [_first(value)] for key, value in body.errors.items()})
    return body.validated_data


def text_field(limit, empty, long):
    return serializers.CharField(
        required=False,
        max_length=limit,
        error_messages={"blank": empty, "null": empty, "invalid": empty, "max_length": long},
    )
