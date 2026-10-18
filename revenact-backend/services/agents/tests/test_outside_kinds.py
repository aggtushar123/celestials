"""Outside kinds are always Ask (contract D21, §2): the grid reads Ask
whatever is stored, shows the kind locked, and refuses auto or never. No
D1 kind acts outside Revenact, so a test-only kind stands in."""

import dataclasses
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents.models import AgentPolicy
from services.agents.policy import level, policy_for
from services.agents.registry import REGISTRY
from services.agents.tests.fixtures import AgentsFixture

SETTINGS = "/api/v1/agents/settings/"
OUTSIDE = dataclasses.replace(
    REGISTRY["note.create"],
    key="test.outside",
    label="Act outside",
    outside=True,
    irreversible=True,
)


class OutsideKindTests(AgentsFixture):
    def setUp(self):
        patcher = patch.dict(REGISTRY, {"test.outside": OUTSIDE})
        patcher.start()
        self.addCleanup(patcher.stop)
        patch_credits = patch("services.agents.policy.plan_credits", return_value=3000)
        patch_credits.start()
        self.addCleanup(patch_credits.stop)

    def test_a_stored_auto_or_never_reads_as_ask(self):
        org = Organisation.objects.get(pk=self.org.pk)
        for stored in ("auto", "never", "ask"):
            AgentPolicy.objects.update_or_create(
                organisation=org, defaults={"levels": {"cs": {"test.outside": stored}}}
            )
            with self.subTest(stored=stored):
                self.assertEqual(level(policy_for(org), "cs", "test.outside"), "ask")

    def test_the_grid_shows_it_locked(self):
        body = self.client_for(self.admin).get(SETTINGS).json()
        row = next(k for k in body["kinds"] if k["kind"] == "test.outside")
        self.assertEqual((row["outside"], row["irreversible"], row["locked"]), (True, True, True))
        note = next(k for k in body["kinds"] if k["kind"] == "note.create")
        self.assertEqual(
            (note["outside"], note["irreversible"], note["locked"]), (False, False, False)
        )

    def test_auto_and_never_are_refused_and_ask_is_a_no_op(self):
        for value in ("auto", "never"):
            response = self.client_for(self.admin).patch(
                SETTINGS, {"levels": {"cs": {"test.outside": value}}}, format="json"
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(
                response.json(), {"levels": {"cs": {"test.outside": ["This action always asks."]}}}
            )
        response = self.client_for(self.admin).patch(
            SETTINGS, {"levels": {"cs": {"test.outside": "ask"}}}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_every_outside_kind_asks_and_cant_be_undone(self):
        for key, spec in REGISTRY.items():
            if spec.outside and key != "test.outside":
                with self.subTest(kind=key):
                    self.assertTrue(spec.irreversible)
                    self.assertEqual(spec.max_level, "ask")
                    self.assertTrue(spec.cant_undo)
        inside = sorted(k for k, s in REGISTRY.items() if s.irreversible and not s.outside)
        # Slack bundles: a scenario run and a sent record survey can't be undone either.
        self.assertEqual(inside, ["campaign.send", "scenario.run", "survey.record", "survey.send"])
