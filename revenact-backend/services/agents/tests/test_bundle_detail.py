"""GET /agents/bundles/<id>/ (contract §4, §5.4, §8): the twice-filter, the
bundle and step shapes, disabled steps with their reasons, evidence for
view-all only, and a stuck run settled on read."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.agents.tests.fixtures import viewer
from services.metrics.models import AgentAction


class BundleDetailTests(BundleFixture):
    def get(self, user, bundle):
        return self.client_for(user).get(f"{BUNDLES}{bundle.pk}/")

    def test_the_owner_reads_the_whole_shape(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        body = self.get(self.csm, bundle).json()
        self.assertEqual(
            {
                k: body[k]
                for k in ("id", "agent", "agent_label", "status", "step_count", "routed_to")
            },
            {
                "id": bundle.pk,
                "agent": "cs",
                "agent_label": "CS agent",
                "status": "waiting",
                "step_count": 2,
                "routed_to": "owner",
            },
        )
        self.assertEqual(
            body["source"],
            {
                "kind": "nightly",
                "label": "Nightly review",
                "channel": None,
                "from": "",
                "messages": 0,
                "last_message_at": None,
                "ticket": None,
                "link": None,
            },
        )
        self.assertEqual(body["department"], None)
        self.assertEqual(
            body["record"],
            {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut", "can_open": True},
        )
        self.assertIs(body["participant_view"], False)
        self.assertEqual(body["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(
            (body["can_run"], body["can_reject"], body["has_newer_message"]), (True, True, False)
        )
        first, second = body["steps"]
        self.assertEqual(
            (first["position"], first["kind"], first["label"]),
            (1, "record.lifecycle", "Change lifecycle stage"),
        )
        self.assertEqual((first["fields"], first["editable"]), ({}, []))
        self.assertEqual(
            second["fields"],
            {"title": "Called the sponsor", "body": "They renew if support improves."},
        )
        self.assertEqual(second["editable"], ["title", "body"])
        for step in body["steps"]:
            self.assertEqual(
                (
                    step["status"],
                    step["can_run"],
                    step["disabled_reason"],
                    step["irreversible"],
                    step["outside"],
                ),
                ("proposed", True, None, False, False),
            )
            self.assertEqual(
                (step["outputs"], step["error"], step["expired_reason"], step["undo"]),
                ({}, "", "", None),
            )
            self.assertEqual(step["evidence"], [])
        admin = self.get(self.admin, bundle).json()
        self.assertEqual(admin["steps"][0]["evidence"][0]["label"], "Renews in 30 days")

    def test_nobody_outside_reads_it(self):
        bundle = self.bundle_of(self.soup, note())
        for reader in (self.csm, self.other, self.lee, self.stranger):
            with self.subTest(reader=reader.name):
                response = self.get(reader, bundle)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(
                    response.json(), {"code": "NO_SUCH_BUNDLE", "detail": "No such bundle."}
                )

    def test_a_workspace_level_bundle_is_view_all_only(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        built = builder_action(self.org, "segment.create", definition())
        self.assertEqual(self.get(self.admin, built.bundle).status_code, 200)
        self.assertEqual(self.get(self.lee, built.bundle).status_code, 404)
        body = self.get(self.admin, built.bundle).json()
        self.assertEqual((body["record"], body["for"], body["routed_to"]), (None, None, "admins"))

    def test_a_step_the_reader_may_not_run_is_disabled_with_the_reason(self):
        vic = viewer(self.org)
        bundle = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}), note())
        body = self.get(vic, bundle).json()
        owner_step, note_step = body["steps"]
        self.assertEqual(
            (owner_step["can_run"], owner_step["disabled_reason"]),
            (False, "You can't run this step."),
        )
        self.assertTrue(note_step["can_run"])
        self.assertEqual((body["can_run"], body["can_reject"]), (True, False))

    def test_a_bundle_with_an_unreadable_draft_source_is_missing(self):
        from services.agents.tests.drafts_fixtures import ticket

        source = ticket(self.pizza, number="TKT-9", department="finance")
        bundle = self.bundle_of(
            self.pizza, ("draft.reply", {"ticket_id": source.pk, "body": "Hi"}), note()
        )
        self.assertEqual(self.get(self.csm, bundle).status_code, 404)

    def test_a_stuck_run_is_settled_on_read(self):
        bundle = self.bundle_of(self.pizza, note())
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="running", run_by=self.csm, run_started_at=timezone.now() - timedelta(minutes=20)
        )
        body = self.get(self.csm, bundle).json()
        self.assertEqual(body["status"], "partly_done")
        self.assertEqual(body["steps"][0]["error"], "This step didn't finish. Retry it.")
        self.assertEqual(body["run_by"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_an_applied_steps_undo_and_the_action_names_its_bundle(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        from services.agents import deciding

        deciding.approve(self.fresh(self.csm), step.pk)
        body = self.get(self.csm, bundle).json()
        self.assertTrue(body["steps"][0]["undo"]["allowed"])
        action = self.client_for(self.csm).get(f"/api/v1/agents/actions/{step.pk}/").json()
        self.assertEqual(action["bundle"], bundle.pk)
        AgentAction.objects.filter(pk=step.pk).update(irreversible=True)
        body = self.get(self.csm, bundle).json()
        self.assertEqual(
            body["steps"][0]["undo"], {"allowed": False, "until": None, "reason": "irreversible"}
        )
