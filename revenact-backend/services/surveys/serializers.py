"""What a builder writes. The owner and workspace come from the request,
never the body; a segment is resolved through `owned_segment`, so a
segment the caller cannot read is a 404 and someone else's a 403."""

from rest_framework import serializers

from services.accounts.models import User
from services.customers.models import Contact

from .access import owned_segment
from .models import MAX_SHARED, SurveySend
from .questions import SCALES

NO_ROLES = "Choose at least one role."
NO_TEAMMATES = "Choose at least one teammate."
LOCKED = "A sent survey can only be renamed or re-shared."
#: What a send that has been claimed may still change.
AFTER_SEND = frozenset({"name", "sharing", "shared_with"})


def roles_field(**kwargs):
    return serializers.ListField(
        child=serializers.ChoiceField(choices=Contact.Role.choices),
        max_length=len(Contact.Role.choices),
        **kwargs,
    )


def clean_roles(segment, roles):
    """Each role once, in the order ticked. None for a contact segment (it
    sends to its own people); at least one for an organisation or account
    segment."""
    roles = list(dict.fromkeys(roles))
    if segment is None:
        return roles
    if segment.kind == "contact":
        return []
    if not roles:
        raise serializers.ValidationError({"roles": [NO_ROLES]})
    return roles


class SendWriteSerializer(serializers.ModelSerializer):
    segment = serializers.IntegerField(required=False, allow_null=True)
    roles = roles_field(required=False)
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = SurveySend
        fields = [
            "name",
            "survey_type",
            "subject",
            "intro",
            "segment",
            "roles",
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

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and instance.status != SurveySend.Status.DRAFT:
            locked = sorted(set(self.initial_data) & (set(self.fields) - AFTER_SEND))
            if locked:
                raise serializers.ValidationError({name: [LOCKED] for name in locked})
        elif instance is None or "segment" in attrs or "roles" in attrs:
            segment = attrs["segment"] if "segment" in attrs else getattr(instance, "segment", None)
            roles = attrs.get("roles", getattr(instance, "roles", []))
            attrs["roles"] = clean_roles(segment, roles)
        default_sharing = instance.sharing if instance is not None else SurveySend.Sharing.PRIVATE
        if attrs.get("sharing", default_sharing) == SurveySend.Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError(
                    {"shared_with": [f"Share with at most {MAX_SHARED} teammates."]}
                )
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []
        return attrs

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`), so an
        edit never writes back the send's status, times or counts."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class AudienceSerializer(serializers.Serializer):
    """The builder's audience count: a segment of the caller's own and the
    roles ticked. Nothing is saved."""

    segment = serializers.IntegerField()
    roles = roles_field(required=False, default=list)

    def validate_segment(self, value):
        return owned_segment(self.context["request"].user, value)

    def validate(self, attrs):
        attrs["roles"] = clean_roles(attrs["segment"], attrs["roles"])
        return attrs


class AnswerSerializer(serializers.Serializer):
    """One answer from the public form: a whole-number score in the type's
    range (context `survey_type`) and an optional plain-text comment."""

    score = serializers.IntegerField()
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)

    def validate_score(self, value):
        low, high = SCALES[self.context["survey_type"]]
        if not low <= value <= high:
            raise serializers.ValidationError(f"Choose a score from {low} to {high}.")
        return value
