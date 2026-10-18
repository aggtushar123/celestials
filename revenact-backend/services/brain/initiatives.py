"""Initiatives for everyone (spec §1.3): which numbers can be tracked for
one person's book, and who may change an initiative. `edited_as` is the one
rule: every row's `can_edit` and `PATCH initiatives/<id>/` both ask it, so
the page offers exactly what the route allows."""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from core import audit
from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.customers.scoping import sees_everything
from services.metrics.initiatives import as_decimal, closed_at_after, create_initiative
from services.metrics.models import Initiative
from services.metrics.registry import BY_KEY, METRICS, OWNER, compute_value
from services.metrics.signals import number

from .scope import COMPANY, ME, TEAM, book_actor

#: The metrics with an owner cut: the only ones Me and My team can track.
OWNER_METRICS = tuple(metric.key for metric in METRICS if OWNER in metric.slices)


def trackable():
    """The owner-cut metrics, for the New initiative form outside Company."""
    return [
        {"key": m.key, "label": m.label, "unit": m.unit, "better": m.better}
        for m in METRICS
        if m.key in OWNER_METRICS
    ]


def edited_as(reader, initiative, *, below=None, everything=None):
    """How `reader` may change `initiative`: "me" (they own it), "team" (its
    owner is below them), "company" (view_all_accounts), or None. A page of
    rows passes `below` (subtree_ids) and `everything` (sees_everything)
    computed once."""
    # SOC2:AUTH-02 an initiative is changed by its owner, anyone above them,
    # or view_all_accounts; never across organisations
    if initiative.organisation_id != reader.organisation_id:
        return None
    owner_id = initiative.owner_id
    if owner_id is not None:
        if owner_id == reader.id:
            return ME
        if owner_id in (subtree_ids(reader) if below is None else below):
            return TEAM
    if sees_everything(reader) if everything is None else everything:
        return COMPANY
    return None


NOT_TRACKABLE = "That number can't be tracked for one person's book."
NOT_EDITOR = "You can't change this initiative."
COMPANY_ELSEWHERE = "Company initiatives are started from the Company initiatives page."
NOT_BELOW = "Choose yourself or someone below you."
LOCKED_FIELD = "This can't be changed here."
#: What a Brain edit may not change: what the initiative tracks, and whose it is.
LOCKED = ("metric", "dimension", "member", "owner_id", "for_user")


class NotTrackable(Exception):
    """The metric has no owner cut."""


class InitiativeForm(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    hypothesis = serializers.CharField(allow_blank=True, default="")
    metric = serializers.CharField(max_length=64)
    target_value = serializers.DecimalField(max_digits=18, decimal_places=4)
    target_by = serializers.DateField()
    status = serializers.ChoiceField(
        choices=Initiative.Status.choices, default=Initiative.Status.ACTIVE
    )
    for_user = serializers.IntegerField(required=False, allow_null=True)

    def validate_metric(self, key):
        if key not in BY_KEY:
            raise serializers.ValidationError(f"No metric called {key!r}.")
        return key

    def validate_target_by(self, day):
        if day < timezone.localdate():
            raise serializers.ValidationError("The target date is in the past.")
        return day


class InitiativeEdit(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    hypothesis = serializers.CharField(allow_blank=True, required=False)
    target_value = serializers.DecimalField(max_digits=18, decimal_places=4, required=False)
    target_by = serializers.DateField(required=False)
    status = serializers.ChoiceField(choices=Initiative.Status.choices, required=False)
    outcome = serializers.CharField(allow_blank=True, required=False)

    def validate(self, attrs):
        locked = [name for name in LOCKED if name in self.initial_data]
        if locked:
            raise serializers.ValidationError({name: [LOCKED_FIELD] for name in locked})
        return attrs


def book_person(reader, scope, user_id):
    """Whose book a new initiative is on: the reader in Me (naming anyone
    else is refused); in My team the reader or someone below them."""
    if user_id is None or user_id == reader.pk:
        return reader
    if scope.key == ME:
        raise ValidationError({"detail": NOT_BELOW})
    # SOC2:AUTH-02 My team starts initiatives only on the reader's own book or
    # the book of someone below them, in their own organisation
    found = None
    if user_id in subtree_ids(reader):
        found = User.objects.filter(
            pk=user_id, organisation_id=reader.organisation_id, is_active=True
        ).first()
    if found is None:
        raise ValidationError({"for_user": [NOT_BELOW]})
    return found


def start(reader, scope, data, *, request=None):
    """A new initiative on one person's book, tracking the owner cut of a
    metric that has one. Through `create_initiative`, with the starting line
    read as the creator over that person's book (`baseline_scope` book), so
    it never counts what the creator can't read. Raises ValidationError or
    NotTrackable."""
    form = InitiativeForm(data=data)
    form.is_valid(raise_exception=True)
    values = dict(form.validated_data)
    wanted = values.pop("for_user", None)
    if OWNER not in BY_KEY[values["metric"]].slices:
        raise NotTrackable(values["metric"])
    person = book_person(reader, scope, wanted)
    # SOC2:AUTH-02 the starting line is what the creator may read of the book
    read = compute_value(
        reader.organisation, BY_KEY[values["metric"]], book_actor(reader, person.pk)
    )
    # The write and its audit row succeed or fail together: no initiative
    # without the event that proves who started it.
    with transaction.atomic():
        initiative = create_initiative(
            reader.organisation,
            reader,
            dimension=OWNER,
            member=str(person.pk),
            member_label=person.name,
            owner=person,
            baseline_value=as_decimal(number(read)),
            baseline_scope=Initiative.BaselineScope.BOOK,
            **values,
        )
        audit.record(  # SOC2:LOG-01
            "initiative.created",
            request=request,
            target=initiative,
            target_repr=f"Initiative {initiative.pk}",
            metadata={"scope": scope.key, "metric": initiative.metric, "for_user": person.pk},
        )
    return initiative


def edit(initiative, data, *, edited_as, request=None):
    """Applies an edit the caller has already allowed (`edited_as`). A PATCH
    that changes nothing writes and records nothing."""
    form = InitiativeEdit(data=data)
    form.is_valid(raise_exception=True)
    changes = {
        name: value
        for name, value in form.validated_data.items()
        if getattr(initiative, name) != value
    }
    if not changes:
        return initiative
    if "status" in changes:
        initiative.closed_at = closed_at_after(initiative, changes["status"], timezone.now())
    for name, value in changes.items():
        setattr(initiative, name, value)
    # The write and its audit row succeed or fail together.
    with transaction.atomic():
        initiative.save()
        audit.record(  # SOC2:LOG-01
            "initiative.updated",
            request=request,
            target=initiative,
            target_repr=f"Initiative {initiative.pk}",
            metadata={"scope": edited_as, "fields": sorted(changes)},
        )
    return initiative
