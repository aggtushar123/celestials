"""Scope handling shared by the Brain's routes and the lists that take
`?scope=` (/requests/, /anomalies/): a scope the reader may not use is
refused the same way everywhere, before anything is read."""

from rest_framework import status
from rest_framework.response import Response

from .scope import ScopeNotAllowed, ScopeUnknown, resolve


class ScopeRefusals:
    """400 `SCOPE_UNKNOWN` for a key that isn't one, 403
    `SCOPE_NOT_ALLOWED` for a scope the reader may not use."""

    def handle_exception(self, exc):
        if isinstance(exc, ScopeUnknown):
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST
            )
        if isinstance(exc, ScopeNotAllowed):
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_403_FORBIDDEN
            )
        return super().handle_exception(exc)


def optional_scope(request):
    """The reader's `?scope=`, resolved; None when the request names none
    (an empty value included), so the route behaves as it did before."""
    key = request.query_params.get("scope")
    # SOC2:AUTH-02 a named scope is resolved, and refused, before anything is read
    return resolve(request.user, key) if key else None
