"""Where on the Brain a question was asked, as the client sends it.

The client sends `{surface: "brain", scope, tab}`: the scope switch's key and
the tab it is on, never a figure or a name (spec: react-ts-app
docs/superpowers/specs/2026-10-06-brain-ask-design.md §1.1). The scope goes
through the Brain's own resolver (`services.brain.scope.resolve`), as every
Brain route does, so a scope the asker may not use is refused before anything
is read, with one message whether it is unknown or not theirs. There is no
focus in this delivery; anything else the client sends is ignored.
"""

from rest_framework import serializers

from services.brain.scope import LABELS, ScopeNotAllowed, ScopeUnknown, resolve

SURFACE = "brain"
#: The four Brain tabs that can be asked from, in the page's order, with the
#: titles the digest uses.
TAB_TITLES = {
    "changed": "What changed",
    "waiting": "Waiting on you",
    "doing": "What's being done",
    "customers": "Customers",
}
NOT_YOUR_VIEW = "You can't ask about that view."


def resolved_scope(user, key):
    """The asker's own Scope for `key`, or the one 400 for a scope that is
    unknown or not theirs."""
    try:
        return resolve(user, key)
    except (ScopeUnknown, ScopeNotAllowed):
        # SOC2:AUTH-02 a scope the asker may not use is refused before
        # anything is read, the same whether it exists or not
        raise serializers.ValidationError({"scope": [NOT_YOUR_VIEW]}) from None


def well_formed(context):
    """A stored Brain context exactly as `BrainContextSerializer` writes it.
    Anything else was not written by it, and a shared read of its reply
    fails closed (`views._brain_reply_readable_by`)."""
    if not isinstance(context, dict) or set(context) != {"surface", "scope", "tab"}:
        return False
    scope, tab = context["scope"], context["tab"]
    return (
        context["surface"] == SURFACE
        and isinstance(scope, str)
        and scope in LABELS
        and isinstance(tab, str)
        and tab in TAB_TITLES
    )


class BrainContextSerializer(serializers.Serializer):
    """Validates a Brain send's `context`. Needs `context={"user": user}`."""

    surface = serializers.ChoiceField(choices=[SURFACE])
    scope = serializers.CharField(allow_blank=True)
    tab = serializers.ChoiceField(choices=list(TAB_TITLES))

    def validate(self, data):
        resolved_scope(self.context["user"], data["scope"])
        return {"surface": SURFACE, "scope": data["scope"], "tab": data["tab"]}
