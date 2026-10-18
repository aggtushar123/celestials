"""The rule endpoints. Only the owner writes; every read is filtered by
what the reader may open. See docs/API_CONTRACTS.md, `rules`."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.models import User
from services.agents.made_by import RELATED

from .access import get_owned, get_readable, readable_rules
from .models import MAX_OWNED, Rule, RuleReview
from .payloads import (
    campaign_preview,
    list_rows,
    plan_preview,
    preview_payload,
    review_campaign_names,
    review_payload,
    rule_payload,
    run_detail,
    runs_page,
)
from .reviews import (
    ALREADY_DECIDED,
    Decided,
    expire_for_rule,
    get_owned_review,
    send_review,
    skip_review,
)
from .selection import select
from .serializers import RuleTestSerializer, RuleWriteSerializer

LIMIT_REACHED = f"You can own at most {MAX_OWNED} rules."
SHARING_FIELDS = frozenset({"sharing", "shared_with"})
#: The review list shows at most this many, newest first.
REVIEW_LIMIT = 100
#: A rule on another segment or trigger starts afresh: its stored scores and
#: cooldowns no longer mean anything.
RESET_FIELDS = frozenset({"segment", "trigger"})
#: A new line forgets last night's scores (keeping the cooldowns), so the
#: first night after never fires on old history. So does turning it on.
LINE_FIELDS = frozenset({"score", "direction", "threshold"})


def _limit_reached(user):
    """Whether `user` already owns the most rules allowed. Call inside the
    transaction that creates the new one: the owner's row is locked first,
    so two creates at once queue instead of both passing the count."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))
    return Rule.objects.filter(owner=user).count() >= MAX_OWNED


def _changed(rule, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(rule.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(rule, name) != value:
            changed.append(name)
    return sorted(changed)


def _record(request, action, rule, **metadata):
    audit.record(action, request=request, target=rule, metadata=metadata)  # SOC2:LOG-01


def _record_shared(request, rule):
    _record(
        request,
        "rule.shared",
        rule,
        sharing=rule.sharing,
        shared_with=sorted(rule.shared_with.values_list("pk", flat=True)),
    )


class RuleListCreateView(APIView):
    """GET /api/v1/rules/?scope=mine|shared|all, the rules the caller may
    read, by name. POST creates one owned by the caller (429 past 50)."""

    # SOC2:AUTH-02 authentication here; `readable_rules` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rules = readable_rules(request.user)
        scope = request.query_params.get("scope")
        if scope == "mine":
            rules = rules.filter(owner=request.user)
        elif scope == "shared":
            rules = rules.exclude(owner=request.user)
        rules = rules.select_related("owner", "segment", RELATED).order_by("name", "pk")
        return Response(list_rows(rules, request.user))

    def post(self, request):
        serializer = RuleWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _limit_reached(request.user):
                return Response({"detail": LIMIT_REACHED}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            rule = serializer.save(owner=request.user, organisation_id=request.user.organisation_id)
            _record(
                request,
                "rule.created",
                rule,
                trigger=rule.trigger,
                actions=[action["action"] for action in rule.actions],
            )
            if rule.is_active:
                _record(request, "rule.activated", rule)
            if rule.sharing != Rule.Sharing.PRIVATE:
                _record_shared(request, rule)
        return Response(rule_payload(rule, request.user), status=status.HTTP_201_CREATED)


class RuleDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/rules/<id>/. Readers read; only the owner
    writes (403 for another reader, 404 for anyone who may not read it)."""

    # SOC2:AUTH-02 authentication here; `get_readable`/`get_owned` check the rule
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(rule_payload(get_readable(request.user, pk), request.user))

    def patch(self, request, pk):
        rule = get_owned(request.user, pk)
        with transaction.atomic():
            # Under the row lock the nightly step takes, so an edit never races
            # tonight's run of this rule.
            rule = (
                Rule.objects.select_for_update(of=("self",))
                .select_related("owner", "segment")
                .get(pk=rule.pk)
            )
            serializer = RuleWriteSerializer(
                rule, data=request.data, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            was_active = rule.is_active
            changed = set(_changed(rule, serializer.validated_data))
            rule = serializer.save()
            turned_on = rule.is_active and not was_active
            if turned_on and rule.paused_reason:
                rule.paused_reason = ""
                rule.save(update_fields=["paused_reason"])
            if RESET_FIELDS & changed:
                rule.states.all().delete()
                # the waiting surveys were fired on the old segment or trigger
                expire_for_rule(rule, now=timezone.now(), request=request)
            elif LINE_FIELDS & changed or turned_on:
                rule.states.update(last_value=None)
            edited = sorted(changed - {"is_active"})
            if edited:
                _record(request, "rule.updated", rule, fields=edited)
            if "is_active" in changed:
                if rule.is_active:
                    _record(request, "rule.activated", rule)
                else:
                    _record(request, "rule.paused", rule, reason="owner")
            if SHARING_FIELDS & changed:
                _record_shared(request, rule)
        return Response(rule_payload(rule, request.user))

    def delete(self, request, pk):
        rule = get_owned(request.user, pk)
        with transaction.atomic():
            # The nightly step's row lock first: a delete during tonight's run
            # of this rule waits for it.
            rule = Rule.objects.select_for_update(of=("self",)).get(pk=rule.pk)
            _record(request, "rule.deleted", rule, trigger=rule.trigger)
            rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RuleTestView(APIView):
    """POST /api/v1/rules/test/: an unsaved rule, checked as a save would
    check it, and who it would act on tonight from the caller's own book.
    `rule` (optional) lends a saved rule's stored scores and cooldowns.
    Nothing is written."""

    # SOC2:AUTH-02 authentication here; `owned_segment`, `get_owned` and `select` check the rest
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RuleTestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        lent = data.pop("rule", None)
        data.pop("shared_with", None)
        rule = Rule(organisation_id=request.user.organisation_id, owner=request.user, **data)
        selection = select(
            rule,
            request.user,
            today=timezone.localdate(),
            preview=True,
            state_rule_id=None if lent is None else lent.pk,
        )
        body = preview_payload(selection)
        plans = plan_preview(rule, selection)
        if plans is not None:
            body["plans"] = plans
        campaigns = campaign_preview(
            rule, selection, today=timezone.localdate(), now=timezone.now()
        )
        if campaigns is not None:
            body["campaigns"] = campaigns
        return Response(body)


class RuleRunsView(APIView):
    """GET /api/v1/rules/<id>/runs/?cursor=, the rule's nights, newest first."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the rule, `runs_page` each count
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        rule = get_readable(request.user, pk)
        return Response(runs_page(rule, request.user, request.query_params))


class RuleRunDetailView(APIView):
    """GET /api/v1/rules/<id>/runs/<run_id>/, one night's records the caller
    may open, plus `hidden_count`."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the rule, `run_detail` each record
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, run_id):
        rule = get_readable(request.user, pk)
        run = get_object_or_404(rule.runs, pk=run_id)
        return Response(run_detail(run, request.user))


class ReviewListView(APIView):
    """GET /api/v1/rules/reviews/?status=waiting|approved|skipped|expired,
    the caller's own reviews (unknown reads as waiting), newest first."""

    # SOC2:AUTH-02 authentication here; the filter below is the owner check
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wanted = request.query_params.get("status")
        if wanted not in RuleReview.Status.values:
            wanted = RuleReview.Status.WAITING
        # SOC2:AUTH-02 a review is read only by its rule's owner
        reviews = (
            RuleReview.objects.filter(
                rule__owner=request.user,
                rule__organisation_id=request.user.organisation_id,
                status=wanted,
            )
            .select_related("rule__segment", "rule__organisation", "run")
            .order_by("-created_at", "-pk")[:REVIEW_LIMIT]
        )
        reviews = list(reviews)
        names = review_campaign_names(reviews)
        return Response([review_payload(review, names) for review in reviews])


#: A review deleted (with its rule) after the view found it: the same 404
#: `get_owned_review` gives.
GONE_404 = {"detail": "Not found."}


class ReviewApproveView(APIView):
    """POST /api/v1/rules/reviews/<id>/approve/: claims the review's survey
    or campaign as the rule's owner and returns `{survey_send_id}` or
    `{campaign_send_id}` at once, the send `sending` with everyone queued for
    the every-minute `deliver_pending` runner, or the refusal (400,
    stored on the review, which stays waiting). 409 once decided; 404 if
    the rule or review is deleted meanwhile."""

    # SOC2:AUTH-02 authentication here; `get_owned_review` is the owner check
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        review = get_owned_review(request.user, pk)
        try:
            answer = send_review(
                review.pk,
                actor=request.user,
                today=timezone.localdate(),
                now=timezone.now(),
                request=request,
            )
        except Decided:
            return Response({"detail": ALREADY_DECIDED}, status=status.HTTP_409_CONFLICT)
        except RuleReview.DoesNotExist:
            return Response(GONE_404, status=status.HTTP_404_NOT_FOUND)
        return Response(answer.body, status=answer.status)


class ReviewSkipView(APIView):
    """POST /api/v1/rules/reviews/<id>/skip/: nothing is sent. Returns the
    review; 409 once decided; 404 if it is deleted meanwhile."""

    # SOC2:AUTH-02 authentication here; `get_owned_review` is the owner check
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        review = get_owned_review(request.user, pk)
        try:
            review = skip_review(review.pk, request.user, now=timezone.now(), request=request)
        except Decided:
            return Response({"detail": ALREADY_DECIDED}, status=status.HTTP_409_CONFLICT)
        except RuleReview.DoesNotExist:
            return Response(GONE_404, status=status.HTTP_404_NOT_FOUND)
        return Response(review_payload(review))
