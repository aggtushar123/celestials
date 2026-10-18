"""Department heads (Slack escalations D2, contract §1.1, SE2-2 to SE2-6).

A department is a function (`User.Function`, spec §14 Q1). Each function
may have one head per workspace: the person who takes a customer's
escalation in that function when nobody on the customer's account team
works in it (`ownership.handler_for`). Reading is for every member;
changing needs `manage_org_settings` (the view) and writes
`function_head.changed`."""

from django.db import transaction

from core import audit
from services.accounts.models import User

from .models import FunctionHead


def on_duty(user, function=None):
    """An active person and, when `function` is given, still working in
    it. Someone who left, or moved to another function, takes nothing
    (SE2-4)."""
    return user is not None and user.is_active and (function is None or user.function == function)


def head_for(organisation_id, function):
    """The function's head in the workspace when on duty, else None. One query."""
    if organisation_id is None:
        return None
    row = (
        FunctionHead.objects.filter(organisation_id=organisation_id, function=function)
        .select_related("user")
        .first()
    )
    return row.user if row is not None and on_duty(row.user, function) else None


def rows(organisation_id):
    """GET /function-heads/: one row per function, in `User.Function`
    order; a head off duty reads as nobody (SE2-4). One query."""
    named = {
        head.function: head.user
        for head in FunctionHead.objects.filter(organisation_id=organisation_id).select_related(
            "user"
        )
        if on_duty(head.user, head.function)
    }
    return [
        {
            "function": function,
            "function_display": label,
            "user": (
                {"id": named[function].id, "name": named[function].name}
                if function in named
                else None
            ),
        }
        for function, label in User.Function.choices
    ]


def change(organisation, function, user, *, request):
    """Make `user` (or nobody, with None) the function's head. Raises the
    model's ValidationError when `user` may not head it; then nothing
    changed. Audits only a real change (SE2-6)."""
    with transaction.atomic():
        current = (
            FunctionHead.objects.select_for_update()
            .filter(organisation=organisation, function=function)
            .first()
        )
        was = current.user_id if current is not None else None
        if user is None:
            if current is not None:
                current.delete()
        elif current is not None:
            current.user = user
            current.save()
        else:
            FunctionHead(organisation=organisation, function=function, user=user).save()
        now = user.id if user is not None else None
        if was != now:
            # SOC2:LOG-01 who changed which head, from whom to whom (ids only).
            audit.record(
                "function_head.changed",
                request=request,
                organisation=organisation,
                target=organisation,
                metadata={"function": function, "from": was, "to": now},
            )
