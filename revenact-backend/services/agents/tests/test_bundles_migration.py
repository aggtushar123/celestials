"""agents.0003_bundles_of_one (contract §1.4): every action becomes a bundle
of one with the mapped status, dates and outputs."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

BEFORE = [
    ("accounts", "0015_organisation_gmail_two_way"),  # unapplies the later accounts columns
    ("agents", "0002_agent_bundle"),
    ("metrics", "0014_agent_action_steps"),
]
AFTER = [("agents", "0003_bundles_of_one")]


class BundlesOfOneMigrationTests(TransactionTestCase):
    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_each_action_gets_its_own_bundle(self):
        apps = self.migrate(BEFORE)
        Organisation = apps.get_model("accounts", "Organisation")
        User = apps.get_model("accounts", "User")
        Customer = apps.get_model("customers", "Customer")
        Action = apps.get_model("metrics", "AgentAction")
        org = Organisation.objects.create(name="Acme Inc", currency="USD")
        carl = User.objects.create(email="carl@acme.io", name="Carl CSM", organisation=org)
        pizza = Customer.objects.create(organisation=org, name="Pizza Hut", owner=carl)
        now = timezone.now()
        common = {
            "organisation": org,
            "agent": "cs",
            "batch": "b",
            "rationale": "Why.",
            "payload": {},
        }
        rows = {
            status: Action.objects.create(
                **common,
                kind="task.create",
                customer=pizza,
                target=f"t:{status}",
                title=f"Do {status}",
                status=status,
                decided_by=carl if status != "proposed" else None,
                decided_at=now if status != "proposed" else None,
                decision_note="Not now." if status == "rejected" else "",
                expired_reason="replaced" if status == "expired" else "",
                result={"task_id": 9} if status == "applied" else {},
            )
            for status in ("proposed", "applied", "rejected", "expired", "undone")
        }
        workspace = Action.objects.create(
            **common, kind="segment.create", target="s", title="Build", status="proposed"
        )
        apps = self.migrate(AFTER)
        Action = apps.get_model("metrics", "AgentAction")
        expected = {
            "proposed": "waiting",
            "applied": "done",
            "rejected": "rejected",
            "expired": "superseded",
            "undone": "done",
        }
        for status, action in rows.items():
            step = Action.objects.select_related("bundle").get(pk=action.pk)
            with self.subTest(status=status):
                self.assertEqual(step.bundle.status, expected[status])
                self.assertEqual((step.position, step.selected), (1, True))
                self.assertEqual(step.bundle.title, f"Do {status}")
                self.assertEqual(step.bundle.created_at, action.created_at)
                self.assertEqual(
                    (step.bundle.routed_to, step.bundle.routed_user_id), ("owner", carl.pk)
                )
        applied = Action.objects.select_related("bundle").get(pk=rows["applied"].pk)
        self.assertEqual(applied.outputs, {"task_id": 9, "task_url": "/work/mine?task=9"})
        self.assertEqual(applied.bundle.run_by_id, carl.pk)
        rejected = Action.objects.select_related("bundle").get(pk=rows["rejected"].pk)
        self.assertEqual(rejected.bundle.reject_note, "Not now.")
        lone = Action.objects.select_related("bundle").get(pk=workspace.pk)
        self.assertEqual((lone.bundle.routed_to, lone.bundle.routed_user_id), ("admins", None))
