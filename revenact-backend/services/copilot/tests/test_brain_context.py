"""The Brain Ask context: a scope the asker may use and one of four tabs."""

from services.brain.tests.fixtures import BrainFixture
from services.copilot.brain_context import (
    NOT_YOUR_VIEW,
    TAB_TITLES,
    BrainContextSerializer,
    resolved_scope,
    well_formed,
)


class BrainContextTests(BrainFixture):
    def check(self, user, data):
        return BrainContextSerializer(data=data, context={"user": user})

    def test_every_tab_validates_in_every_scope_the_reader_may_use(self):
        cases = (
            (self.csm, ("me",)),
            (self.mona, ("me", "team")),
            (self.admin, ("me", "company")),
            (self.lee, ("me", "company")),
        )
        for user, scopes in cases:
            for scope in scopes:
                for tab in TAB_TITLES:
                    with self.subTest(user=user.name, scope=scope, tab=tab):
                        checked = self.check(user, {"surface": "brain", "scope": scope, "tab": tab})
                        self.assertTrue(checked.is_valid(), checked.errors)
                        self.assertEqual(
                            checked.validated_data,
                            {"surface": "brain", "scope": scope, "tab": tab},
                        )

    def test_anything_else_the_client_sends_is_ignored(self):
        checked = self.check(
            self.csm,
            {
                "surface": "brain",
                "scope": "me",
                "tab": "doing",
                "label": "Spoofed",
                "focus": {"kind": "plan", "id": 1},
                "filters": {"owner": "1"},
            },
        )
        self.assertTrue(checked.is_valid(), checked.errors)
        self.assertEqual(
            checked.validated_data, {"surface": "brain", "scope": "me", "tab": "doing"}
        )

    def test_a_scope_the_reader_may_not_use_or_that_is_unknown_is_one_400(self):
        cases = (
            (self.csm, "team"),
            (self.csm, "company"),
            (self.mona, "company"),
            (self.other, "team"),
            (self.csm, "everyone"),
            (self.csm, ""),
            (self.csm, 7),
        )
        for user, scope in cases:
            with self.subTest(user=user.name, scope=scope):
                checked = self.check(user, {"surface": "brain", "scope": scope, "tab": "changed"})
                self.assertFalse(checked.is_valid())
                self.assertEqual(checked.errors, {"scope": [NOT_YOUR_VIEW]})

    def test_an_unknown_tab_is_a_400(self):
        for tab in ("graph", "anomalies", ""):
            with self.subTest(tab=tab):
                checked = self.check(self.csm, {"surface": "brain", "scope": "me", "tab": tab})
                self.assertFalse(checked.is_valid())
                self.assertEqual(set(checked.errors), {"tab"})

    def test_resolved_scope_returns_the_readers_own_scope(self):
        scope = resolved_scope(self.mona, "team")
        self.assertEqual((scope.key, scope.stored_key), ("team", f"team:{self.mona.pk}"))

    def test_well_formed_is_only_what_the_serializer_writes(self):
        self.assertTrue(well_formed({"surface": "brain", "scope": "team", "tab": "waiting"}))
        for context in (
            None,
            "brain",
            {"surface": "brain"},
            {"surface": "brain", "scope": "everyone", "tab": "waiting"},
            {"surface": "brain", "scope": "me", "tab": "graph"},
            {"surface": "brain", "scope": ["me"], "tab": "waiting"},
            {"surface": "brain", "scope": "me", "tab": {"x": 1}},
            {"surface": "brain", "scope": "me", "tab": "waiting", "filters": {}},
            {"surface": "brain", "scope": "me", "tab": "waiting", "focus": {"kind": "x"}},
            {"surface": "brain", "scope": "me", "tab": "waiting", "label": "Spoofed"},
            {"surface": "dashboard", "scope": "me", "tab": "waiting"},
        ):
            with self.subTest(context=context):
                self.assertFalse(well_formed(context))
