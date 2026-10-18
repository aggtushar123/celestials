"""What a campaign's owner writes. The owner and workspace come from the
request, never the body. A segment must be one of the caller's own
(`access.owned_segment`); anything else is the same field refusal."""

from rest_framework import serializers

from services.accounts.models import User
from services.surveys.serializers import clean_roles, roles_field

from . import validation as say
from .access import owned_segment
from .models import MAX_BODY, MAX_NAME, MAX_SHARED, MAX_SUBJECT, Campaign, default_roles

#: The two values a PATCH's `status` may take (contract note 11).
STATUSES = ("archived", "active")


def check_merge_fields(value):
    if say.merge_field_errors(value):
        raise serializers.ValidationError(say.MERGE_FIELDS_ONLY)
    return value


def subject_field():
    return serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_SUBJECT,
        error_messages={"max_length": say.LONG_SUBJECT},
    )


def body_field():
    return serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        max_length=MAX_BODY,
        error_messages={"max_length": say.LONG_BODY},
    )


class CampaignWriteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(
        max_length=MAX_NAME,
        error_messages={
            "required": say.NO_NAME,
            "blank": say.NO_NAME,
            "null": say.NO_NAME,
            "max_length": say.LONG_NAME,
        },
    )
    subject = subject_field()
    body = body_field()
    segment = serializers.IntegerField(required=False, allow_null=True)
    roles = roles_field(required=False)
    status = serializers.CharField(required=False, allow_blank=True)
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = Campaign
        fields = ["name", "subject", "body", "segment", "roles", "status", "sharing", "shared_with"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate_subject(self, value):
        return check_merge_fields(value)

    def validate_body(self, value):
        return check_merge_fields(value)

    def validate_segment(self, value):
        if value is None:
            return None
        segment = owned_segment(self.context["request"].user, value)
        if segment is None:
            raise serializers.ValidationError(say.OWN_SEGMENT)
        return segment

    def validate_status(self, value):
        if value not in STATUSES:
            raise serializers.ValidationError(say.CHOOSE_STATUS)
        return value

    def _current(self, attrs, name, default):
        if name in attrs:
            return attrs[name]
        return getattr(self.instance, name) if self.instance is not None else default

    def validate(self, attrs):
        instance = self.instance
        if instance is None or "segment" in attrs or "roles" in attrs:
            segment = self._current(attrs, "segment", None)
            roles = attrs.get("roles") if "roles" in attrs else None
            if roles is None:
                # unsent: keep what is stored, or tick the defaults again after a contact segment
                roles = (instance.roles if instance is not None else None) or default_roles()
            attrs["roles"] = clean_roles(segment, roles)
        self._status(attrs)
        self._sharing(attrs)
        return attrs

    def _status(self, attrs):
        """`archived` archives; `active` un-archives, to `active` when it has
        sends and `draft` otherwise. Ignored on create."""
        wanted = attrs.pop("status", None)
        instance = self.instance
        if wanted is None or instance is None:
            return
        if wanted == "archived" and instance.status != Campaign.Status.ARCHIVED:
            attrs["status"] = Campaign.Status.ARCHIVED
        elif wanted == "active" and instance.status == Campaign.Status.ARCHIVED:
            has_sends = instance.sends.exists()
            attrs["status"] = Campaign.Status.ACTIVE if has_sends else Campaign.Status.DRAFT

    def _sharing(self, attrs):
        instance = self.instance
        default = instance.sharing if instance is not None else Campaign.Sharing.PRIVATE
        if attrs.get("sharing", default) == Campaign.Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [say.NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError({"shared_with": [say.TOO_MANY_SHARED]})
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`)."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class PreviewSerializer(serializers.Serializer):
    """`POST campaigns/:id/preview/`: optional unsaved subject and body (what
    the editor shows), checked as a save checks them, and optionally who."""

    contact = serializers.IntegerField(required=False, allow_null=True)
    subject = subject_field()
    body = body_field()

    def validate_subject(self, value):
        return check_merge_fields(value)

    def validate_body(self, value):
        return check_merge_fields(value)
