"""Save as template: a plan's editors turn its milestones and the tasks they
can see into a personal template, offsets from the start date, assignees as
roles; the 50-template limit and sharing apply as for any template."""

from services.plans import validation as say
from services.plans.access import NOT_EDITOR
from services.plans.models import PlanTemplate
from services.plans.tests.fixtures import PlanFixture

URL = "/api/v1/plans/"


class SaveAsTemplateTests(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.plan = cls.build_plan(
            owner=cls.mona,
            kind="save",
            steps=[
                (
                    "Diagnose",
                    3,
                    [
                        ("Call the champion", cls.csm, "completed"),
                        ("Write it up", cls.mona, "pending"),
                    ],
                ),
                ("Confirm", 500, [("Secret", cls.admin, "pending", cls.admin)]),
            ],
        )

    def save(self, user=None, **body):
        return self.api(user or self.mona).post(
            f"{URL}{self.plan.pk}/save-as-template/", body, format="json"
        )

    def test_the_plan_becomes_a_template(self):
        response = self.save(name="Our save")
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(
            (data["name"], data["kind"], data["description"], data["sharing"], data["is_owner"]),
            ("Our save", "save", "", "private", True),
        )
        self.assertEqual(
            data["milestones"],
            [
                {
                    "name": "Diagnose",
                    "offset_days": 3,
                    "tasks": [
                        {
                            "title": "Call the champion",
                            "priority": "medium",
                            "offset_days": 3,
                            "assignee_role": "record_owner",
                        },
                        {
                            "title": "Write it up",
                            "priority": "medium",
                            "offset_days": 3,
                            "assignee_role": "plan_owner",
                        },
                    ],
                },
                {"name": "Confirm", "offset_days": 365, "tasks": []},
            ],
        )
        template = PlanTemplate.objects.get(pk=data["id"])
        self.assertEqual((template.owner, template.organisation), (self.mona, self.org))
        self.assertEqual(
            self.events("plan_template.created"),
            [
                (
                    str(template.pk),
                    {"kind": "save", "milestones": 2, "tasks": 2, "plan": self.plan.pk},
                )
            ],
        )

    def test_shared_like_any_template(self):
        data = self.save(name="Team save", sharing="workspace").data
        self.assertEqual(data["sharing"], "workspace")
        self.assertEqual(
            self.events("plan_template.shared"),
            [(str(data["id"]), {"sharing": "workspace", "shared_with": []})],
        )

    def test_editors_only(self):
        response = self.save(user=self.admin, name="x")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))
        self.assertEqual(self.save(user=self.other, name="x").status_code, 404)
        self.assertEqual(self.save(user=self.csm, name="x").status_code, 403)

    def test_a_name_is_needed(self):
        response = self.save()
        self.assertEqual((response.status_code, response.data), (400, {"name": [say.CHOOSE_NAME]}))

    def test_the_owners_limit_applies(self):
        PlanTemplate.objects.bulk_create(
            [
                PlanTemplate(
                    organisation=self.org,
                    owner=self.mona,
                    name=f"T{i}",
                    kind="other",
                    milestones=[],
                )
                for i in range(50)
            ]
        )
        response = self.save(name="One too many")
        self.assertEqual(
            (response.status_code, response.data), (400, {"non_field_errors": [say.TEMPLATE_LIMIT]})
        )
