"""What a template's owner and a plan's editors write. The owner and the
workspace come from the request, never the body. Every refusal's words are
`validation.py`'s."""

from django.utils import timezone
from rest_framework import serializers

from services.accounts.models import User
from services.customers.models import Task
from services.customers.scoping import visible_accounts, visible_customers

from .access import readable_templates, record_of
from .models import (
    MAX_DESCRIPTION,
    MAX_NAME,
    MAX_SHARED,
    MAX_TASK_TITLE,
    Kind,
    PlanTemplate,
    Sharing,
)
from .validation import (
    CANT_OPEN_ACCOUNT,
    CANT_OPEN_ORGANISATION,
    CHOOSE_ASSIGNEE,
    CHOOSE_DATE,
    CHOOSE_KIND,
    CHOOSE_MILESTONE,
    CHOOSE_NAME,
    CHOOSE_OWNER,
    CHOOSE_PRIORITY,
    CHOOSE_RECORD,
    CHOOSE_SHARING,
    CHOOSE_STATUS,
    CHOOSE_TASK_STATUS,
    CHOOSE_TEMPLATE,
    DATE_RANGE,
    LONG_DESCRIPTION,
    LONG_NAME,
    LONG_TITLE,
    MILESTONE_COUNT,
    NO_TEAMMATES,
    NO_TITLE,
    TOO_MANY_SHARED,
    YES_OR_NO,
    assignable,
    clean_plan_milestones,
    clean_template_milestones,
    in_range,
)

NAME_ERRORS = {
    "required": CHOOSE_NAME,
    "blank": CHOOSE_NAME,
    "null": CHOOSE_NAME,
    "invalid": CHOOSE_NAME,
    "max_length": LONG_NAME,
}
DATE_ERRORS = {"required": CHOOSE_DATE, "null": CHOOSE_DATE, "invalid": CHOOSE_DATE}


class TemplateWriteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=MAX_NAME, error_messages=NAME_ERRORS)
    kind = serializers.ChoiceField(
        choices=Kind.choices,
        error_messages={
            "required": CHOOSE_KIND,
            "null": CHOOSE_KIND,
            "invalid_choice": CHOOSE_KIND,
        },
    )
    description = serializers.CharField(
        max_length=MAX_DESCRIPTION,
        required=False,
        allow_blank=True,
        error_messages={"max_length": LONG_DESCRIPTION, "invalid": LONG_DESCRIPTION},
    )
    milestones = serializers.JSONField(error_messages={"required": MILESTONE_COUNT})
    sharing = serializers.ChoiceField(
        choices=Sharing.choices,
        required=False,
        error_messages={"null": CHOOSE_SHARING, "invalid_choice": CHOOSE_SHARING},
    )
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = PlanTemplate
        fields = ["name", "kind", "description", "milestones", "sharing", "shared_with"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate(self, attrs):
        if "milestones" in attrs:
            attrs["milestones"] = clean_template_milestones(attrs["milestones"])
        self._check_sharing(attrs)
        return attrs

    def _check_sharing(self, attrs):
        instance = self.instance
        default_sharing = instance.sharing if instance is not None else Sharing.PRIVATE
        if attrs.get("sharing", default_sharing) == Sharing.PEOPLE:
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
        """Writes only the fields the request names (and `updated_at`)."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class PlanStartSerializer(serializers.Serializer):
    """`POST plans/`: `{template, customer | account, name?, owner?,
    start_date?, milestones?}`. `owner` defaults to the caller, `start_date`
    to today, and without `milestones` the template is copied as it is."""

    template = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_TEMPLATE,
            "null": CHOOSE_TEMPLATE,
            "invalid": CHOOSE_TEMPLATE,
        }
    )
    customer = serializers.IntegerField(
        required=False, allow_null=True, error_messages={"invalid": CANT_OPEN_ORGANISATION}
    )
    account = serializers.IntegerField(
        required=False, allow_null=True, error_messages={"invalid": CANT_OPEN_ACCOUNT}
    )
    name = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_NAME, error_messages=NAME_ERRORS
    )
    owner = serializers.IntegerField(
        required=False, allow_null=True, error_messages={"invalid": CHOOSE_OWNER}
    )
    start_date = serializers.DateField(required=False, error_messages=DATE_ERRORS)
    milestones = serializers.JSONField(required=False, error_messages={"null": MILESTONE_COUNT})

    def validate_template(self, value):
        user = self.context["request"].user
        # SOC2:AUTH-02 a plan starts only from a template its starter may read
        template = readable_templates(user).filter(pk=value).first()
        if template is None:
            raise serializers.ValidationError(CHOOSE_TEMPLATE)
        return template

    def validate(self, attrs):
        user = self.context["request"].user
        customer_id, account_id = attrs.get("customer"), attrs.get("account")
        if (customer_id is None) == (account_id is None):
            raise serializers.ValidationError({"non_field_errors": [CHOOSE_RECORD]})
        # SOC2:AUTH-02 a plan starts only on a record its starter may open;
        # a hidden one is refused in the same words as a missing one
        if customer_id is not None:
            record = visible_customers(user).filter(pk=customer_id).first()
            if record is None:
                raise serializers.ValidationError({"customer": [CANT_OPEN_ORGANISATION]})
        else:
            record = visible_accounts(user).filter(pk=account_id).first()
            if record is None:
                raise serializers.ValidationError({"account": [CANT_OPEN_ACCOUNT]})
        attrs["record"] = record
        owner = attrs.get("owner")
        attrs["owner"] = assignable(
            user.organisation_id, user.pk if owner is None else owner, record, "owner"
        )
        attrs["start_date"] = attrs.get("start_date") or timezone.localdate()
        if "milestones" in attrs:
            attrs["milestones"] = clean_plan_milestones(
                attrs["milestones"],
                start_date=attrs["start_date"],
                organisation_id=user.organisation_id,
                record=record,
            )
        return attrs


#: The statuses a person may set by hand (spec §1.2, §4).
BY_HAND = ["on_track", "at_risk", "cancelled", "done"]


class PlanPatchSerializer(serializers.Serializer):
    """`PATCH plans/:id/`: any of `name`, `owner`, `status`. The new owner
    must be an active teammate who can open the record."""

    name = serializers.CharField(max_length=MAX_NAME, required=False, error_messages=NAME_ERRORS)
    owner = serializers.IntegerField(
        required=False, error_messages={"invalid": CHOOSE_OWNER, "null": CHOOSE_OWNER}
    )
    status = serializers.ChoiceField(
        choices=BY_HAND,
        required=False,
        error_messages={"invalid_choice": CHOOSE_STATUS, "null": CHOOSE_STATUS},
    )

    def validate(self, attrs):
        plan = self.context["plan"]
        if "owner" in attrs:
            attrs["owner"] = assignable(
                plan.organisation_id, attrs["owner"], record_of(plan), "owner"
            )
        return attrs


class _PlanDates:
    """`due_date` from the plan's start to a year after it."""

    def validate_due_date(self, value):
        if not in_range(value, self.context["plan"].start_date):
            raise serializers.ValidationError(DATE_RANGE)
        return value


class MilestoneWriteSerializer(_PlanDates, serializers.Serializer):
    """POST `{name, due_date}`; PATCH any of `{name, due_date, done}`."""

    name = serializers.CharField(max_length=MAX_NAME, error_messages=NAME_ERRORS)
    due_date = serializers.DateField(error_messages=DATE_ERRORS)
    done = serializers.BooleanField(
        required=False, error_messages={"invalid": YES_OR_NO, "null": YES_OR_NO}
    )


class PlanTaskSerializer(_PlanDates, serializers.Serializer):
    """POST `{milestone, title, priority, due_date, assignee}`; PATCH any of
    those and `status`. `milestone` must be the plan's own, `assignee` an
    active teammate who can open the record."""

    milestone = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_MILESTONE,
            "null": CHOOSE_MILESTONE,
            "invalid": CHOOSE_MILESTONE,
        }
    )
    title = serializers.CharField(
        max_length=MAX_TASK_TITLE,
        error_messages={
            "required": NO_TITLE,
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    priority = serializers.ChoiceField(
        choices=Task.Priority.choices,
        error_messages={
            "required": CHOOSE_PRIORITY,
            "null": CHOOSE_PRIORITY,
            "invalid_choice": CHOOSE_PRIORITY,
        },
    )
    due_date = serializers.DateField(error_messages=DATE_ERRORS)
    assignee = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_ASSIGNEE,
            "null": CHOOSE_ASSIGNEE,
            "invalid": CHOOSE_ASSIGNEE,
        }
    )
    status = serializers.ChoiceField(
        # Blocked needs a reason: it is set from the task panel (PATCH /tasks/<id>/).
        choices=[c for c in Task.Status.choices if c[0] != Task.Status.BLOCKED],
        required=False,
        error_messages={"null": CHOOSE_TASK_STATUS, "invalid_choice": CHOOSE_TASK_STATUS},
    )

    def validate_milestone(self, value):
        milestone = self.context["plan"].milestones.filter(pk=value).first()
        if milestone is None:
            raise serializers.ValidationError(CHOOSE_MILESTONE)
        return milestone

    def validate(self, attrs):
        plan = self.context["plan"]
        if "assignee" in attrs:
            attrs["assignee"] = assignable(
                plan.organisation_id, attrs["assignee"], record_of(plan), "assignee"
            )
        return attrs
