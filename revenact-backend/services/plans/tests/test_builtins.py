"""The four built-in templates, exactly as spec §1.6 lists them: no
workspace, no owner, read by every workspace, seeded once."""

from services.plans.builtins import seed_builtins
from services.plans.models import PlanTemplate
from services.plans.tests.fixtures import PlanFixture


def task(title, priority, offset, role="record_owner"):
    return {"title": title, "priority": priority, "offset_days": offset, "assignee_role": role}


class BuiltinTests(PlanFixture):
    def test_four_built_ins_without_a_workspace_or_an_owner(self):
        rows = PlanTemplate.objects.filter(is_builtin=True).order_by("pk")
        self.assertEqual(
            [
                (t.kind, t.name, t.organisation_id, t.owner_id, t.sharing, t.description)
                for t in rows
            ],
            [
                ("onboarding", "Onboarding", None, None, "workspace", ""),
                ("success", "Success plan", None, None, "workspace", ""),
                ("save", "Save plan", None, None, "workspace", ""),
                ("qbr", "QBR", None, None, "workspace", ""),
            ],
        )

    def test_onboarding_is_the_specs(self):
        self.assertEqual(
            self.builtin["onboarding"].milestones,
            [
                {
                    "name": "Kick-off",
                    "offset_days": 0,
                    "tasks": [
                        task("Hold the kick-off call", "high", 0),
                        task("Confirm goals and success criteria", "high", 3),
                    ],
                },
                {
                    "name": "Set up",
                    "offset_days": 14,
                    "tasks": [
                        task("Connect data sources", "high", 10),
                        task("Invite the customer's team", "medium", 14),
                    ],
                },
                {
                    "name": "First value",
                    "offset_days": 30,
                    "tasks": [task("Review first results with the champion", "high", 28)],
                },
                {
                    "name": "Hand-off",
                    "offset_days": 60,
                    "tasks": [
                        task("Run the onboarding review", "medium", 55),
                        task("Hand over to the account owner", "medium", 60, "plan_owner"),
                    ],
                },
            ],
        )

    def test_success_save_and_qbr_are_the_specs(self):
        def outline(kind):
            return [
                (
                    m["name"],
                    m["offset_days"],
                    [(t["title"], t["priority"], t["offset_days"]) for t in m["tasks"]],
                )
                for m in self.builtin[kind].milestones
            ]

        self.assertEqual(
            outline("success"),
            [
                ("Agree outcomes", 0, [("Write the success plan with the customer", "high", 7)]),
                ("Check-in", 30, [("Review progress against outcomes", "medium", 30)]),
                ("Expand adoption", 60, [("Find the next team or use case", "medium", 60)]),
                ("Review", 90, [("Run the quarterly success review", "high", 90)]),
            ],
        )
        self.assertEqual(
            outline("save"),
            [
                (
                    "Diagnose",
                    0,
                    [
                        ("Talk to the champion about the risk", "high", 2),
                        ("Write down the root cause", "high", 5),
                    ],
                ),
                (
                    "Act",
                    14,
                    [
                        ("Agree a recovery plan with the customer", "high", 10),
                        ("Bring in an executive sponsor", "medium", 14),
                    ],
                ),
                ("Confirm", 30, [("Check health and usage have recovered", "high", 30)]),
            ],
        )
        self.assertEqual(
            outline("qbr"),
            [
                (
                    "Prepare",
                    0,
                    [
                        ("Pull the quarter's usage and outcomes", "medium", 0),
                        ("Draft the deck", "medium", 5),
                    ],
                ),
                ("Meet", 10, [("Hold the business review", "high", 10)]),
                (
                    "Follow up",
                    14,
                    [
                        ("Send notes and next steps", "high", 12),
                        ("Log decisions on the account", "medium", 14),
                    ],
                ),
            ],
        )

    def test_only_two_tasks_go_to_the_plan_owner(self):
        owned = sorted(
            t["title"]
            for template in self.builtin.values()
            for m in template.milestones
            for t in m["tasks"]
            if t["assignee_role"] == "plan_owner"
        )
        self.assertEqual(owned, ["Bring in an executive sponsor", "Hand over to the account owner"])

    def test_seeding_again_adds_nothing(self):
        self.assertEqual(seed_builtins(PlanTemplate), 0)
        self.assertEqual(PlanTemplate.objects.filter(is_builtin=True).count(), 4)

    def test_seeding_puts_back_a_missing_one(self):
        PlanTemplate.objects.filter(kind="qbr", is_builtin=True).delete()
        self.assertEqual(seed_builtins(PlanTemplate), 1)
        self.assertEqual(PlanTemplate.objects.get(kind="qbr", is_builtin=True).name, "QBR")
