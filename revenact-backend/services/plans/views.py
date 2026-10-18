"""The plan endpoints (spec §4). Reads are filtered by what the reader may
open; plans are written by their editors (the owner and anyone above
them), templates by their owners. See docs/API_CONTRACTS.md, `plans`."""

from django.db import transaction
from django.db.models import Case, IntegerField, Max, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.models import User
from services.agents.made_by import RELATED
from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.customers.scoping import visible_accounts, visible_customers
from services.customers.task_changes import add_task, record_changes, snapshot
from services.work.clock import today_for

from .access import (
    NOT_CHECKER,
    NOT_EDITOR,
    can_check,
    can_edit,
    get_owned_template,
    get_visible_plan,
    readable_templates,
    record_of,
    require_editor,
    visible_plans,
)
from .copying import template_steps
from .drafting import NOT_DRAFT, START_DRAFT, NotDraft, start_from_draft
from .listing import counts, filtered, page, statuses
from .models import (
    MAX_MILESTONES,
    MAX_OWNED_TEMPLATES,
    MAX_TASKS,
    OPEN,
    Milestone,
    Plan,
    PlanTemplate,
    Sharing,
)
from .notices import tell_assignees
from .payloads import plan_payload, plan_rows, template_payload
from .serializers import (
    MilestoneWriteSerializer,
    PlanPatchSerializer,
    PlanStartSerializer,
    PlanTaskSerializer,
    TemplateWriteSerializer,
)
from .starting import PlanOpen, TemplateGone, record_meta, start_plan
from .status import (
    COMPLETED,
    advance,
    after_work,
    finish_if_done,
    lock_plan,
    milestones_done,
    refresh_target,
    set_status,
)
from .validation import (
    CHOOSE_MILESTONE,
    CHOOSE_TEMPLATE,
    DONE_NEEDS_MILESTONES,
    HAS_DONE_WORK,
    LAST_MILESTONE,
    MILESTONE_HAS_DONE_WORK,
    PLAN_FINISHED,
    PLAN_OPEN,
    REORDER,
    SEND_AN_OBJECT,
    TEMPLATE_LIMIT,
    TOO_MANY_MILESTONES,
    TOO_MANY_TASKS,
    integer,
    task_count,
)

SHARING_FIELDS = frozenset({"sharing", "shared_with"})
#: The fields of a plan's task a PATCH may change; all but `status` are editors' only.
TASK_FIELDS = frozenset({"title", "priority", "due_date", "assignee", "milestone", "status"})


def _body(request):
    """The request's body: one object (a JSON array or anything else is a
    400 in the UI's words, never a 500)."""
    if not isinstance(request.data, dict):
        raise ValidationError({"non_field_errors": [SEND_AN_OBJECT]})
    return request.data


def _audit(request, action, target, **metadata):
    audit.record(action, request=request, target=target, metadata=metadata)  # SOC2:LOG-01


def _plan_response(request, plan, status_code=status.HTTP_200_OK):
    """The plan as the caller reads it now."""
    plan = get_visible_plan(request.user, plan.pk)
    return Response(plan_payload(plan, request.user), status=status_code)


def _editable(user, pk):
    """Before any lock: 404 for a plan the caller cannot read, 403 for a
    reader who does not edit it."""
    plan = get_visible_plan(user, pk)
    require_editor(user, plan)
    return plan


def _require_open(plan, *, drafts=False):
    """Open, or with `drafts` a Draft too: a Draft's name, owner and
    milestones change before it starts; its tasks come back only then."""
    if plan.status == Plan.Status.DRAFT:
        if not drafts:
            raise ValidationError({"non_field_errors": [START_DRAFT]})
        return
    if plan.status not in OPEN:
        raise ValidationError({"non_field_errors": [PLAN_FINISHED]})


def _lock_for_edit(user, pk, *, drafts=False):
    """The plan under its row lock, for an editor (checked again under the
    lock: its owner may just have changed), while it is open (or a Draft,
    with `drafts`)."""
    plan = lock_plan(pk)
    require_editor(user, plan)
    _require_open(plan, drafts=drafts)
    return plan


def _refuse_draft_status(plan, data):
    """A plan never moves into or out of Draft by hand (`status`)."""
    if "status" in data and (
        plan.status == Plan.Status.DRAFT or data["status"] == Plan.Status.DRAFT
    ):
        raise ValidationError({"status": [START_DRAFT]})


def _milestone_changed(request, plan, milestone_id, change, **extra):
    _audit(request, "plan.milestone_changed", plan, milestone=milestone_id, change=change, **extra)


def _task_changed(request, plan, task_id, change, **extra):
    _audit(request, "plan.task_changed", plan, task=task_id, change=change, **extra)


def _compact(plan):
    """Positions 0..n-1 in the current order, after a removal."""
    milestones = list(plan.milestones.order_by("position", "pk"))
    for position, milestone in enumerate(milestones):
        milestone.position = position
    Milestone.objects.bulk_update(milestones, ["position"])


def _changed(instance, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(instance.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(instance, name) != value:
            changed.append(name)
    return sorted(changed)


def _template_limit_reached(user):
    """Whether `user` already owns the most templates allowed. Call inside
    the transaction that creates the new one: the owner's row is locked
    first, so two creates at once queue instead of both passing the count."""
    list(
        User.objects.select_for_update(no_key=True).filter(pk=user.pk).values_list("pk", flat=True)
    )
    owned = PlanTemplate.objects.filter(owner=user, is_builtin=False).count()
    return owned >= MAX_OWNED_TEMPLATES


def _templates(user):
    rows = readable_templates(user).select_related("owner", RELATED).prefetch_related("shared_with")
    return rows.order_by("name", "pk")


def _template_response(request, pk, status_code=status.HTTP_200_OK):
    template = _templates(request.user).get(pk=pk)
    return Response(template_payload(template, request.user), status=status_code)


def _audit_shared(request, template):
    _audit(
        request,
        "plan_template.shared",
        template,
        sharing=template.sharing,
        shared_with=sorted(template.shared_with.values_list("pk", flat=True)),
    )


class TemplateListCreateView(APIView):
    """GET /api/v1/plans/templates/: `{builtin, mine, shared}`, every template
    the caller may read (built-ins in the spec's order, the rest by name).
    POST makes one owned by the caller (at most 50)."""

    # SOC2:AUTH-02 authentication here; `readable_templates` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        groups = {"builtin": [], "mine": [], "shared": []}
        for template in _templates(request.user):
            if template.is_builtin:
                groups["builtin"].append(template)
            elif template.owner_id == request.user.pk:
                groups["mine"].append(template)
            else:
                groups["shared"].append(template)
        groups["builtin"].sort(key=lambda template: template.pk)
        return Response(
            {
                name: [template_payload(template, request.user) for template in rows]
                for name, rows in groups.items()
            }
        )

    def post(self, request):
        serializer = TemplateWriteSerializer(data=_body(request), context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _template_limit_reached(request.user):
                raise ValidationError({"non_field_errors": [TEMPLATE_LIMIT]})
            template = serializer.save(
                owner=request.user, organisation_id=request.user.organisation_id
            )
            _audit(
                request,
                "plan_template.created",
                template,
                kind=template.kind,
                milestones=len(template.milestones),
                tasks=task_count(template.milestones),
            )
            if template.sharing != Sharing.PRIVATE:
                _audit_shared(request, template)
        return _template_response(request, template.pk, status.HTTP_201_CREATED)


class TemplateDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/plans/templates/<id>/. Readers read; only the
    owner writes: 403 for a built-in or someone else's, 404 for anyone who
    may not read it. Deleting keeps the plans started from it."""

    # SOC2:AUTH-02 authentication here; `_templates`/`get_owned_template` check the template
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        template = get_object_or_404(_templates(request.user), pk=pk)
        return Response(template_payload(template, request.user))

    def patch(self, request, pk):
        template = get_owned_template(request.user, pk)
        body = _body(request)
        with transaction.atomic():
            locked = PlanTemplate.objects.select_for_update(no_key=True, of=("self",))
            template = get_object_or_404(locked, pk=template.pk)
            serializer = TemplateWriteSerializer(
                template, data=body, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            changed = set(_changed(template, serializer.validated_data))
            template = serializer.save()
            edited = sorted(changed - SHARING_FIELDS)
            if edited:
                _audit(request, "plan_template.updated", template, fields=edited)
            if changed & SHARING_FIELDS:
                _audit_shared(request, template)
        return _template_response(request, template.pk)

    def delete(self, request, pk):
        template = get_owned_template(request.user, pk)
        with transaction.atomic():
            locked = PlanTemplate.objects.select_for_update(of=("self",))
            template = get_object_or_404(locked, pk=template.pk)
            _audit(request, "plan_template.deleted", template, kind=template.kind)
            template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SaveAsTemplateView(APIView):
    """POST /api/v1/plans/<id>/save-as-template/ `{name, sharing?,
    shared_with?}`: the plan's milestones and the tasks the caller can see,
    as a new personal template of the plan's kind; 201 with the template.
    For the plan's editors; the 50-template limit applies."""

    # SOC2:AUTH-02 authentication here; `_editable` checks the plan, `template_steps` each task
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        data = _body(request)
        body = {key: data[key] for key in ("name", "sharing", "shared_with") if key in data}
        body.update(kind=plan.kind, description="", milestones=template_steps(plan, request.user))
        serializer = TemplateWriteSerializer(data=body, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _template_limit_reached(request.user):
                raise ValidationError({"non_field_errors": [TEMPLATE_LIMIT]})
            template = serializer.save(
                owner=request.user, organisation_id=request.user.organisation_id
            )
            _audit(
                request,
                "plan_template.created",
                template,
                kind=template.kind,
                milestones=len(template.milestones),
                tasks=task_count(template.milestones),
                plan=plan.pk,
            )
            if template.sharing != Sharing.PRIVATE:
                _audit_shared(request, template)
        return _template_response(request, template.pk, status.HTTP_201_CREATED)


class PlanListCreateView(APIView):
    """GET /api/v1/plans/: the list and the board. Plans on records the
    caller may open, filtered, newest first, 50 a page, with `counts` per
    status over the same filters ignoring `status`. POST starts a plan: 201
    with the plan, 409 `PLAN_OPEN` when the record already has an open one
    from the template."""

    # SOC2:AUTH-02 authentication here; `visible_plans` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        plans = filtered(visible_plans(request.user), request.user, params)
        wanted = plans.filter(status__in=statuses(params)).select_related(
            "customer", "account", "owner"
        )
        rows, cursor = page(wanted, params.get("cursor"))
        return Response(
            {"results": plan_rows(rows, request.user), "next": cursor, "counts": counts(plans)}
        )

    def post(self, request):
        serializer = PlanStartSerializer(data=_body(request), context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            plan = start_plan(
                data["template"].pk,
                data["record"],
                owner=data["owner"],
                start_date=data["start_date"],
                actor=request.user,
                name=data.get("name", ""),
                milestones=data.get("milestones"),
                request=request,
            )
        except PlanOpen as exc:
            return Response(
                {"code": "PLAN_OPEN", "plan_id": exc.plan_id, "detail": PLAN_OPEN},
                status=status.HTTP_409_CONFLICT,
            )
        except TemplateGone:
            raise ValidationError({"template": [CHOOSE_TEMPLATE]}) from None
        plan = get_visible_plan(request.user, plan.pk)
        return Response(plan_payload(plan, request.user), status=status.HTTP_201_CREATED)


class PlanDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/plans/<id>/. 404 for a plan on a record the
    caller cannot open. PATCH (`name`, `owner`, `status`) and DELETE (only
    while no task is completed, else 409 `PLAN_HAS_DONE_WORK`) are for the
    plan's owner and anyone above them: 403 for another reader."""

    # SOC2:AUTH-02 authentication here; `get_visible_plan` checks the plan
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(plan_payload(get_visible_plan(request.user, pk), request.user))

    def patch(self, request, pk):
        plan = _editable(request.user, pk)
        body = _body(request)
        _refuse_draft_status(plan, body)
        serializer = PlanPatchSerializer(data=body, context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk, drafts=True)
            # It may have become a Draft since the check above.
            _refuse_draft_status(plan, data)
            if data.get("status") == Plan.Status.DONE:
                done, total = milestones_done(plan)
                if done < total:
                    raise ValidationError({"status": [DONE_NEEDS_MILESTONES]})
            changed = []
            if "name" in data and data["name"] != plan.name:
                plan.name = data["name"]
                changed.append("name")
            if "owner" in data and data["owner"].pk != plan.owner_id:
                plan.owner = data["owner"]
                changed.append("owner")
            if changed:
                plan.save(update_fields=[*changed, "updated_at"])
                _audit(request, "plan.updated", plan, fields=sorted(changed))
            if "status" in data:
                set_status(
                    plan,
                    data["status"],
                    by=Plan.SetBy.PERSON,
                    now=now,
                    today=today,
                    request=request,
                )
        return _plan_response(request, plan)

    def delete(self, request, pk):
        plan = _editable(request.user, pk)
        with transaction.atomic():
            # A delete takes the full row lock: the plan's key goes.
            locked = Plan.objects.select_for_update(of=("self",)).select_related(
                "customer", "account"
            )
            plan = get_object_or_404(locked, pk=plan.pk)
            require_editor(request.user, plan)
            if plan.tasks.filter(status=Task.Status.COMPLETED).exists():
                return Response(
                    {"code": "PLAN_HAS_DONE_WORK", "detail": HAS_DONE_WORK},
                    status=status.HTTP_409_CONFLICT,
                )
            record = plan.customer if plan.customer_id is not None else plan.account
            _audit(request, "plan.deleted", plan, template=plan.template_id, **record_meta(record))
            plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlanStartView(APIView):
    """POST /api/v1/plans/<id>/start/: a Draft starts again, its kept tasks
    made anew and its dates moved to start today. 404 for a plan on a record
    the caller cannot open, 403 for a reader who does not edit it, 409
    `NOT_DRAFT` for any other plan, 409 `PLAN_OPEN` when the record already
    has an open plan from the template."""

    # SOC2:AUTH-02 authenticated here; `_editable` and `start_from_draft` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        try:
            plan = start_from_draft(
                plan.pk,
                actor=request.user,
                today=today_for(plan.organisation),
                request=request,
            )
        except NotDraft:
            return Response(
                {"code": "NOT_DRAFT", "detail": NOT_DRAFT}, status=status.HTTP_409_CONFLICT
            )
        except PlanOpen as exc:
            return Response(
                {"code": "PLAN_OPEN", "plan_id": exc.plan_id, "detail": PLAN_OPEN},
                status=status.HTTP_409_CONFLICT,
            )
        return _plan_response(request, plan)


class RecordPlansView(APIView):
    """GET /api/v1/customers/<id>/plans/ and /api/v1/accounts/<id>/plans/:
    the record's plans, open first, then newest. 404 for a record the caller
    cannot open, whether or not it exists."""

    # SOC2:AUTH-02 authentication here; the record must be one the caller may open
    permission_classes = [IsAuthenticated]
    kind = "customer"

    def get(self, request, record_id):
        if self.kind == "customer":
            record = get_object_or_404(visible_customers(request.user), pk=record_id)
            plans = Plan.objects.filter(customer=record)
        else:
            record = get_object_or_404(visible_accounts(request.user), pk=record_id)
            plans = Plan.objects.filter(account=record)
        open_first = Case(
            When(status__in=OPEN, then=Value(0)), default=Value(1), output_field=IntegerField()
        )
        plans = plans.select_related("customer", "account", "owner").order_by(
            open_first, "-created_at", "-pk"
        )
        return Response({"results": plan_rows(plans, request.user)})


class MilestoneCreateView(APIView):
    """POST /api/v1/plans/<id>/milestones/ `{name, due_date}`: a milestone at
    the end; 201 with the plan. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        serializer = MilestoneWriteSerializer(data=_body(request), context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk, drafts=True)
            if plan.milestones.count() >= MAX_MILESTONES:
                raise ValidationError({"non_field_errors": [TOO_MANY_MILESTONES]})
            last = plan.milestones.aggregate(last=Max("position"))["last"]
            milestone = Milestone.objects.create(
                plan=plan,
                name=data["name"],
                due_date=data["due_date"],
                position=0 if last is None else last + 1,
            )
            refresh_target(plan)
            _milestone_changed(request, plan, milestone.pk, "added")
        return _plan_response(request, plan, status.HTTP_201_CREATED)


class MilestoneDetailView(APIView):
    """PATCH /api/v1/plans/<id>/milestones/<mid>/ any of `{name, due_date,
    done}`; DELETE removes it with its tasks (never the last one, nor one
    holding a completed task, hidden ones included: mark it done). Both
    answer the plan. Editors only, while the plan is open.

    A rename/re-date and marking done/undone in the same PATCH are one
    audit event: `{"change": "edited", "fields": [...], "done": true}`;
    either alone keeps the plain `{"change": "edited"/"done"/"undone"}`
    shape."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, mid):
        plan = _editable(request.user, pk)
        serializer = MilestoneWriteSerializer(
            data=_body(request), partial=True, context={"plan": plan}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk, drafts=True)
            if plan.status == Plan.Status.DRAFT and "done" in data:
                raise ValidationError({"done": [START_DRAFT]})
            milestone = get_object_or_404(plan.milestones, pk=mid)
            fields = sorted(
                name
                for name in ("name", "due_date")
                if name in data and getattr(milestone, name) != data[name]
            )
            for name in fields:
                setattr(milestone, name, data[name])
            done_changed = None
            if data.get("done") is True and milestone.done_at is None:
                milestone.done_at, milestone.done_by = now, request.user
                done_changed = True
            elif data.get("done") is False and milestone.done_at is not None:
                milestone.done_at, milestone.done_by = None, None
                done_changed = False
            save_fields = list(fields)
            if done_changed is not None:
                save_fields += ["done_at", "done_by"]
            if save_fields:
                milestone.save(update_fields=save_fields)
                if fields and done_changed is not None:
                    _milestone_changed(
                        request, plan, milestone.pk, "edited", fields=fields, done=done_changed
                    )
                elif fields:
                    _milestone_changed(request, plan, milestone.pk, "edited", fields=fields)
                else:
                    _milestone_changed(
                        request, plan, milestone.pk, "done" if done_changed else "undone"
                    )
            if "due_date" in fields:
                refresh_target(plan)
            if done_changed:
                advance(plan, now=now, today=today, request=request)
                finish_if_done(plan, now=now, today=today, request=request)
        return _plan_response(request, plan)

    def delete(self, request, pk, mid):
        plan = _editable(request.user, pk)
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk, drafts=True)
            milestone = get_object_or_404(plan.milestones, pk=mid)
            if plan.milestones.count() == 1:
                raise ValidationError({"non_field_errors": [LAST_MILESTONE]})
            # hidden tasks included: work done is never deleted by a milestone
            tasks = milestone.tasks.all()
            if tasks.filter(status=COMPLETED).exists():
                raise ValidationError({"non_field_errors": [MILESTONE_HAS_DONE_WORK]})
            # A Draft's tasks are its kept ones: they go with their milestone.
            kept = [item for item in plan.draft_tasks if item.get("milestone") != milestone.pk]
            dropped = len(plan.draft_tasks) - len(kept)
            _milestone_changed(
                request, plan, milestone.pk, "removed", tasks=tasks.count() + dropped
            )
            milestone.delete()
            if dropped:
                plan.draft_tasks = kept
                plan.save(update_fields=["draft_tasks", "updated_at"])
            _compact(plan)
            refresh_target(plan)
            finish_if_done(plan, now=now, today=today, request=request)
        return _plan_response(request, plan)


class MilestoneReorderView(APIView):
    """POST /api/v1/plans/<id>/milestones/reorder/ `{order: [every milestone
    id, once]}`; answers the plan. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        order = _body(request).get("order")
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk, drafts=True)
            milestones = {milestone.pk: milestone for milestone in plan.milestones.all()}
            if (
                not isinstance(order, list)
                or not all(integer(pk) for pk in order)
                or len(order) != len(milestones)
                or set(order) != set(milestones)
            ):
                raise ValidationError({"order": [REORDER]})
            for position, milestone_id in enumerate(order):
                milestones[milestone_id].position = position
            Milestone.objects.bulk_update(list(milestones.values()), ["position"])
            _milestone_changed(request, plan, None, "reordered", order=order)
        return _plan_response(request, plan)


class PlanTaskCreateView(APIView):
    """POST /api/v1/plans/<id>/tasks/ `{milestone, title, priority, due_date,
    assignee}`: 201 with the plan. Created by the caller; its assignee is
    told unless that is the caller. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        serializer = PlanTaskSerializer(data=_body(request), context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            if plan.tasks.count() >= MAX_TASKS:
                raise ValidationError({"non_field_errors": [TOO_MANY_TASKS]})
            milestone = plan.milestones.filter(pk=data["milestone"].pk).first()
            if milestone is None:
                raise ValidationError({"milestone": [CHOOSE_MILESTONE]})
            task = add_task(
                parent=record_of(plan),
                plan=plan,
                milestone=milestone,
                title=data["title"],
                priority=data["priority"],
                due_date=data["due_date"],
                assignee=data["assignee"],
                created_by=request.user,
                actor=request.user,
                source=Task.Source.PLAN,
                # A plan tells its assignees itself, one notice per action.
                notify_assignee=False,
                event_data={"plan": plan.pk},
            )
            after_work(
                plan, [milestone.pk], progressed=False, now=now, today=today, request=request
            )
            _task_changed(request, plan, task.pk, "added")
            tell_assignees(plan, [task], actor=request.user)
        return _plan_response(request, plan, status.HTTP_201_CREATED)


class PlanTaskDetailView(APIView):
    """PATCH /api/v1/plans/<id>/tasks/<tid>/ any of `{title, priority,
    due_date, assignee, milestone, status}`; DELETE removes it. Both answer
    the plan. A task the caller cannot see is 404. `status` alone may come
    from the task's assignee, its creator or a plan editor, on any plan;
    everything else is for editors, while the plan is open.

    A move or a removal that leaves a milestone's remaining tasks all
    completed progresses the plan the same way a task turning `completed`
    does (spec §1.2): the milestone is done because of this change, even
    though no task's own status became `completed` here."""

    # SOC2:AUTH-02 authentication here; the plan, the task and the writer are checked below
    permission_classes = [IsAuthenticated]

    def _task(self, user, plan, tid):
        # SOC2:AUTH-02 a plan's task is reached only by someone who may read it
        return get_object_or_404(visible_tasks(user, plan.tasks.all()), pk=tid)

    def patch(self, request, pk, tid):
        plan = get_visible_plan(request.user, pk)
        task = self._task(request.user, plan, tid)
        body = _body(request)
        asked = set(body) & TASK_FIELDS
        editor = can_edit(request.user, plan)
        # SOC2:AUTH-02 editors change a task; its assignee and creator may only tick it
        if asked - {"status"} and not editor:
            raise PermissionDenied(NOT_EDITOR)
        if "status" in asked and not can_check(request.user, plan, task):
            raise PermissionDenied(NOT_CHECKER)
        serializer = PlanTaskSerializer(data=body, partial=True, context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = lock_plan(plan.pk)
            if asked - {"status"}:
                require_editor(request.user, plan)
                _require_open(plan)
            # read again under the lock: it may have moved or gone since
            task = get_object_or_404(plan.tasks, pk=task.pk)
            before = snapshot(task)
            old_status, old_milestone = task.status, task.milestone_id
            changed = [
                name
                for name in ("title", "priority", "due_date", "status")
                if name in data and getattr(task, name) != data[name]
            ]
            for name in changed:
                setattr(task, name, data[name])
            if "assignee" in data and data["assignee"].pk != task.assignee_id:
                task.assignee = data["assignee"]
                task.assignee_name = data["assignee"].name[:150]
                changed.append("assignee")
            if "milestone" in data:
                milestone = plan.milestones.filter(pk=data["milestone"].pk).first()
                if milestone is None:
                    raise ValidationError({"milestone": [CHOOSE_MILESTONE]})
                if milestone.pk != task.milestone_id:
                    task.milestone = milestone
                    changed.append("milestone")
            if changed:
                extra = ["assignee_name"] if "assignee" in changed else []
                task.save(update_fields=[*changed, *extra])
                record_changes(task, before, actor=request.user)
                after_work(
                    plan,
                    [old_milestone, task.milestone_id],
                    progressed=task.status == COMPLETED and old_status != COMPLETED,
                    now=now,
                    today=today,
                    request=request,
                )
                _task_changed(request, plan, task.pk, "edited", fields=sorted(changed))
                if "assignee" in changed:
                    tell_assignees(plan, [task], actor=request.user)
        return _plan_response(request, plan)

    def delete(self, request, pk, tid):
        plan = _editable(request.user, pk)
        task = self._task(request.user, plan, tid)
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            # read again under the lock: it may have moved or gone since
            task = get_object_or_404(plan.tasks, pk=task.pk)
            _task_changed(request, plan, task.pk, "removed")
            task.delete()
            after_work(
                plan, [task.milestone_id], progressed=False, now=now, today=today, request=request
            )
        return _plan_response(request, plan)
