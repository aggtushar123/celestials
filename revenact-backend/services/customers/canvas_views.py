"""The map endpoints (spec §1.5, §4). Whoever may open a map's record reads
and edits it; its creator and anyone above them delete it. Every write is
audited with ids and counts only. See docs/API_CONTRACTS.md, `Canvas`."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from .canvas import (
    CANVAS_CHANGED,
    CHOOSE_RECORD,
    CHOOSE_START,
    NOT_DELETER,
    VERSION_NEEDED,
    clean_edges,
    clean_name,
    clean_nodes,
    people_nodes,
    stored_edges,
    stored_nodes,
)
from .canvas_payloads import (
    DETAIL_RELATED,
    can_delete,
    canvas_payload,
    gallery_page,
    record_rows,
    visible_canvases,
)
from .models import Canvas
from .scoping import get_url_account, get_visible_customer, visible_accounts, visible_customers

STARTS = ("people", "blank")


def _body(request):
    return request.data if hasattr(request.data, "get") else {}


def _pk(value):
    """A positive id, or None (`True` is not an id)."""
    if isinstance(value, bool):
        return None
    try:
        pk = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return pk if pk > 0 else None


def record_audit(request, verb, canvas, **metadata):
    """`canvas.<verb>`, naming the map by id only, in the write's transaction."""
    audit.record(  # SOC2:LOG-01
        f"canvas.{verb}",
        request=request,
        target=canvas,
        target_repr=f"Canvas {canvas.pk}",
        metadata=metadata,
    )


class CanvasListView(APIView):
    """GET /api/v1/canvases/?q=&cursor=: maps on records the caller may open,
    newest edit first, 50 a page. POST makes one on an organisation or an
    account the caller may open, from its people (default) or blank."""

    # SOC2:AUTH-02 authentication here; `visible_canvases` scopes the gallery and
    # a map is made only on a record the caller may open
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(gallery_page(request.user, request.query_params))

    def post(self, request):
        body = _body(request)
        name = clean_name(body.get("name"))
        start = body.get("start", "people")
        if start not in STARTS:
            raise ValidationError({"start": [CHOOSE_START]})
        customer_id, account_id = _pk(body.get("customer")), _pk(body.get("account"))
        if (customer_id is None) == (account_id is None):
            raise ValidationError({"non_field_errors": [CHOOSE_RECORD]})
        # SOC2:AUTH-02 a record the caller may not open reads as missing (404)
        if customer_id is not None:
            on = {"customer": get_object_or_404(visible_customers(request.user), pk=customer_id)}
        else:
            on = {"account": get_object_or_404(visible_accounts(request.user), pk=account_id)}
        nodes = (
            people_nodes(request.user, customer_id=customer_id, account_id=account_id)
            if start == "people"
            else []
        )
        with transaction.atomic():
            canvas = Canvas.objects.create(
                name=name,
                nodes=nodes,
                edges=[],
                created_by=request.user,
                updated_by=request.user,
                **on,
            )
            record_audit(request, "created", canvas, start=start, nodes=len(nodes))
        return Response(canvas_payload(canvas, request.user), status=status.HTTP_201_CREATED)


class CustomerCanvasListView(APIView):
    """GET /api/v1/customers/<customer_id>/canvases/: the organisation's maps
    and those on its accounts the caller may open, newest edit first, at
    most 100."""

    # SOC2:AUTH-02 authentication here; the organisation must be one the caller may open (404)
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        customer = get_visible_customer(request, customer_id)
        return Response(record_rows(request.user, customer=customer))


class AccountCanvasListView(APIView):
    """GET /api/v1/customers/<customer_id>/accounts/<account_id>/canvases/ and
    /api/v1/accounts/<account_id>/canvases/: the account's maps, newest edit
    first, at most 100."""

    # SOC2:AUTH-02 authentication here; `get_url_account` 404s an account the caller may not open
    permission_classes = [IsAuthenticated]

    def get(self, request, **kwargs):
        return Response(record_rows(request.user, account=get_url_account(request, kwargs)))


def _version(body):
    version = body.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ValidationError({"version": [VERSION_NEEDED]})
    return version


class CanvasDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/canvases/<id>/. Whoever may open the map's
    record reads and saves it (404 for anyone else); a save carries the
    version it was loaded at (409 when someone saved since). Its creator and
    anyone above them delete it (403 for other readers)."""

    # SOC2:AUTH-02 authentication here; `visible_canvases` scopes every read and write
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        canvases = visible_canvases(request.user).select_related(*DETAIL_RELATED)
        return Response(canvas_payload(get_object_or_404(canvases, pk=pk), request.user))

    def patch(self, request, pk):
        body = _body(request)
        version = _version(body)
        with transaction.atomic():
            locked = (
                visible_canvases(request.user)
                .select_for_update(no_key=True, of=("self",))
                .select_related(*DETAIL_RELATED)
            )
            canvas = get_object_or_404(locked, pk=pk)
            if canvas.version != version:
                return Response(
                    {"code": "CANVAS_CHANGED", "detail": CANVAS_CHANGED},
                    status=status.HTTP_409_CONFLICT,
                )
            renamed = False
            if "name" in body:
                name = clean_name(body["name"])
                renamed = name != canvas.name
                canvas.name = name
            nodes = stored_nodes(canvas.nodes)
            if "nodes" in body:
                nodes = clean_nodes(
                    body["nodes"],
                    viewer=request.user,
                    customer_id=canvas.customer_id,
                    account_id=canvas.account_id,
                    kept_contact_ids={node["data"]["contact_id"] for node in nodes},
                )
            if "edges" in body:
                edges = clean_edges(body["edges"], nodes)
            else:
                edges = stored_edges(canvas.edges, nodes)
            canvas.nodes, canvas.edges = nodes, edges
            canvas.version += 1
            canvas.updated_by = request.user
            canvas.save(
                update_fields=["name", "nodes", "edges", "version", "updated_by", "updated_at"]
            )
            record_audit(
                request, "updated", canvas, nodes=len(nodes), edges=len(edges), renamed=renamed
            )
        return Response(canvas_payload(canvas, request.user))

    def delete(self, request, pk):
        with transaction.atomic():
            locked = visible_canvases(request.user).select_for_update(of=("self",))
            canvas = get_object_or_404(locked, pk=pk)
            # SOC2:AUTH-02 only the creator and their management chain delete a map
            if not can_delete(request.user, canvas):
                raise PermissionDenied(NOT_DELETER)
            record_audit(request, "deleted", canvas)
            canvas.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
