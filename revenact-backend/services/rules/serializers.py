"""What a rule's owner writes. The owner and workspace come from the
request, never the body. A segment is resolved through `owned_segment`, so
one the caller cannot read is a 404 and someone else's a 403. Every save
checks the merged rule (what is stored plus what is sent) against its
segment's kind."""

from rest_framework import serializers

from services.accounts.models import User

from .access import get_owned, owned_segment
from .models import MAX_COOLDOWN, MAX_NAME, MAX_SHARED, MIN_COOLDOWN, Rule
from .validation import CHOOSE_SEGMENT, TRIGGER_FIELDS, clean_actions, clean_trigger

NO_TEAMMATES = "Choose at least one teammate."
TOO_MANY_SHARED = f"Share with at most {MAX_SHARED} teammates."


class RuleWriteSerializer(serializers.ModelSerializer):
    segment = serializers.IntegerField(required=False, allow_null=True)
    score = serializers.ChoiceField(choices=Rule.Score.choices, required=False, allow_blank=True)
    direction = serializers.ChoiceField(
        choices=Rule.Direction.choices, required=False, allow_blank=True
    )
    threshold = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    cadence = serializers.ChoiceField(
        choices=Rule.Cadence.choices, required=False, allow_blank=True
    )
    weekday = serializers.IntegerField(required=False, allow_null=True)
    actions = serializers.JSONField(required=False)
    cooldown_days = serializers.IntegerField(
        required=False, min_value=MIN_COOLDOWN, max_value=MAX_COOLDOWN
    )
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = Rule
        fields = [
            "name",
            "is_active",
            "segment",
            "trigger",
            "score",
            "direction",
            "threshold",
            "cadence",
            "weekday",
            "actions",
            "cooldown_days",
            "sharing",
            "shared_with",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate_segment(self, value):
        if value is None:
            return None
        return owned_segment(self.context["request"].user, value)

    def _current(self, attrs, name, default=None):
        """What `name` will be once saved: sent, else stored, else `default`."""
        if name in attrs:
            return attrs[name]
        return getattr(self.instance, name, default) if self.instance is not None else default

    def validate(self, attrs):
        user = self.context["request"].user
        creating = self.instance is None
        segment = self._current(attrs, "segment")
        # A rule needs a segment to be made, re-pointed, re-triggered or turned
        # on. One whose segment was deleted (still on until tonight pauses it)
        # may still be renamed, re-shared or switched off.
        turning_on = attrs.get("is_active") is True and not (
            self.instance is not None and self.instance.is_active
        )
        if segment is None and (
            creating or "segment" in attrs or set(attrs) & set(TRIGGER_FIELDS) or turning_on
        ):
            raise serializers.ValidationError({"segment": [CHOOSE_SEGMENT]})
        kind = None if segment is None else segment.kind
        if creating or set(attrs) & {*TRIGGER_FIELDS, "segment"}:
            values = {name: self._current(attrs, name) for name in TRIGGER_FIELDS}
            attrs.update(clean_trigger(values, kind))
        if creating or "actions" in attrs or "segment" in attrs:
            attrs["actions"] = clean_actions(self._current(attrs, "actions"), kind, user)
        elif turning_on:
            # Turning a rule on checks what it would do: a plan template since
            # deleted or unshared, or a teammate since gone, is refused now
            # rather than failing at night.
            clean_actions(self._current(attrs, "actions"), kind, user)
        self._check_sharing(attrs)
        return attrs

    def _check_sharing(self, attrs):
        instance = self.instance
        default_sharing = instance.sharing if instance is not None else Rule.Sharing.PRIVATE
        if attrs.get("sharing", default_sharing) == Rule.Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError({"shared_with": [TOO_MANY_SHARED]})
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`), so an
        edit never writes back `paused_reason` or anything else it did not
        send."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class RuleTestSerializer(RuleWriteSerializer):
    """An unsaved rule for the builder's test, checked as a save would check
    it. `name` is not needed. `rule`, the id of a rule the caller owns,
    lends its stored scores and cooldowns. Nothing is saved."""

    name = serializers.CharField(required=False, allow_blank=True, default="", max_length=MAX_NAME)
    rule = serializers.IntegerField(required=False, allow_null=True)

    class Meta(RuleWriteSerializer.Meta):
        fields = [*RuleWriteSerializer.Meta.fields, "rule"]

    def validate_rule(self, value):
        if value is None:
            return None
        return get_owned(self.context["request"].user, value)
