"""Templates: built-ins for everyone, read-only; personal ones shared like
segments and rules; only the owner writes; at most 50 each; every refusal
at its field in the UI's words; every write audited by id."""

from copy import deepcopy
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from services.plans import validation as say
from services.plans.access import BUILTIN_READ_ONLY, NOT_TEMPLATE_OWNER
from services.plans.models import PlanTemplate
from services.plans.tests.fixtures import STEPS, PlanFixture

URL = "/api/v1/plans/templates/"
TEMPLATE_KEYS = {
    "id", "name", "kind", "description", "is_builtin", "is_owner", "owner", "sharing",
    "shared_with", "milestones", "milestone_count", "task_count", "length_days", "updated_at",
    "made_by",
}  # fmt: skip
TASK = {"title": "t", "priority": "low", "offset_days": 0}


class TemplateValidationTests(PlanFixture):
    def refused(self, steps):
        with self.assertRaises(ValidationError) as caught:
            say.clean_template_milestones(steps)
        return caught.exception.detail

    def test_a_good_template_is_normalised(self):
        steps = [
            {
                "name": "  Kick-off ",
                "offset_days": 0,
                "extra": 1,
                "tasks": [{"title": " Call ", "priority": "high", "offset_days": 2, "x": 0}],
            }
        ]
        self.assertEqual(
            say.clean_template_milestones(steps),
            [
                {
                    "name": "Kick-off",
                    "offset_days": 0,
                    "tasks": [
                        {
                            "title": "Call",
                            "priority": "high",
                            "offset_days": 2,
                            "assignee_role": "record_owner",
                        }
                    ],
                }
            ],
        )

    def test_one_to_twelve_milestones(self):
        for steps in ([], [STEPS[0]] * 13, "x", None):
            self.assertEqual(self.refused(steps), {"milestones": [say.MILESTONE_COUNT]})

    def test_at_most_fifty_tasks_in_all(self):
        steps = [{"name": f"M{i}", "offset_days": 0, "tasks": [TASK] * 10} for i in range(6)]
        self.assertEqual(self.refused(steps), {"milestones": [say.TOO_MANY_TASKS]})

    def test_errors_point_at_the_milestone_and_its_task(self):
        steps = [
            STEPS[0],
            {"name": "", "offset_days": 0, "tasks": []},
            {"name": "Late", "offset_days": 366, "tasks": []},
            {"name": "T", "offset_days": 1, "tasks": [TASK, {**TASK, "priority": "urgent"}]},
            {"name": "R", "offset_days": 1, "tasks": [{**TASK, "assignee_role": "boss"}]},
            "not a milestone",
        ]
        self.assertEqual(
            self.refused(steps),
            {
                "milestones": [
                    {},
                    {"name": [say.CHOOSE_NAME]},
                    {"offset_days": [say.OFFSET_RANGE]},
                    {"tasks": [{}, {"priority": [say.CHOOSE_PRIORITY]}]},
                    {"tasks": [{"assignee_role": [say.CHOOSE_ROLE]}]},
                    {"name": [say.CHOOSE_NAME]},
                ]
            },
        )

    def test_long_text_is_refused_in_words(self):
        long_name = [{"name": "x" * 121, "offset_days": 0, "tasks": []}]
        self.assertEqual(self.refused(long_name), {"milestones": [{"name": [say.LONG_NAME]}]})
        long_title = [{"name": "M", "offset_days": 0, "tasks": [{**TASK, "title": "x" * 256}]}]
        self.assertEqual(
            self.refused(long_title), {"milestones": [{"tasks": [{"title": [say.LONG_TITLE]}]}]}
        )

    def test_a_milestone_may_have_no_tasks(self):
        steps = [{"name": "Wait", "offset_days": 5}]
        self.assertEqual(
            say.clean_template_milestones(steps), [{"name": "Wait", "offset_days": 5, "tasks": []}]
        )

    def test_every_built_in_passes(self):
        for template in self.builtin.values():
            self.assertEqual(
                say.clean_template_milestones(template.milestones), template.milestones
            )


class TemplateEndpoint(PlanFixture):
    def body(self, **fields):
        return {
            "name": "Renewal prep",
            "kind": "other",
            "description": "",
            "milestones": deepcopy(STEPS),
            **fields,
        }


class TemplateReadTests(TemplateEndpoint):
    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().post(URL, self.body(), format="json").status_code, 401)

    def test_built_ins_mine_and_shared_with_me(self):
        self.make_template(owner=self.other, name="Dana's", sharing="workspace")
        self.make_template(owner=self.other, name="Dana's own")
        named = self.make_template(owner=self.admin, name="For Carl", sharing="people")
        named.shared_with.set([self.csm])
        data = self.api(self.csm).get(URL).data
        self.assertEqual(set(data), {"builtin", "mine", "shared"})
        self.assertEqual(
            [t["name"] for t in data["builtin"]], ["Onboarding", "Success plan", "Save plan", "QBR"]
        )
        self.assertEqual([t["id"] for t in data["mine"]], [self.mine.pk])
        self.assertEqual([t["name"] for t in data["shared"]], ["Dana's", "For Carl"])

    def test_a_template_reads_with_its_counts(self):
        data = self.api(self.csm).get(f"{URL}{self.mine.pk}/").data
        self.assertEqual(set(data), TEMPLATE_KEYS)
        self.assertEqual(
            (
                data["milestone_count"],
                data["task_count"],
                data["length_days"],
                data["is_owner"],
                data["owner"],
                data["shared_with"],
            ),
            (2, 2, 14, True, {"id": self.csm.pk, "name": "Carl CSM"}, []),
        )

    def test_a_built_in_has_no_owner(self):
        data = self.api(self.csm).get(f"{URL}{self.builtin['onboarding'].pk}/").data
        self.assertEqual(
            (data["is_builtin"], data["is_owner"], data["owner"], data["sharing"]),
            (True, False, None, "workspace"),
        )
        self.assertEqual(
            (data["milestone_count"], data["task_count"], data["length_days"]), (4, 7, 60)
        )

    def test_another_workspace_sees_only_the_built_ins(self):
        data = self.api(self.stranger).get(URL).data
        self.assertEqual((len(data["builtin"]), data["mine"], data["shared"]), (4, [], []))
        self.assertEqual(self.api(self.stranger).get(f"{URL}{self.mine.pk}/").status_code, 404)

    def test_a_private_template_is_404_to_anyone_else(self):
        self.assertEqual(self.api(self.other).get(f"{URL}{self.mine.pk}/").status_code, 404)
        self.assertEqual(self.api(self.other).get(f"{URL}999999/").status_code, 404)

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(URL)
            return len(ctx.captured_queries)

        first = self.make_template(owner=self.other, name="A", sharing="people")
        first.shared_with.set([self.csm])
        one = count()
        for name in ("B", "C"):
            more = self.make_template(owner=self.other, name=name, sharing="people")
            more.shared_with.set([self.csm, self.admin])
        self.assertEqual(count(), one)


class TemplateWriteTests(TemplateEndpoint):
    def post(self, user=None, **fields):
        return self.api(user or self.csm).post(URL, self.body(**fields), format="json")

    def test_a_template_is_created_for_its_owner(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(set(data), TEMPLATE_KEYS)
        self.assertEqual(
            (data["owner"], data["is_owner"], data["sharing"], data["is_builtin"]),
            ({"id": self.csm.pk, "name": "Carl CSM"}, True, "private", False),
        )
        self.assertEqual(
            self.events("plan_template.created"),
            [(str(data["id"]), {"kind": "other", "milestones": 2, "tasks": 2})],
        )
        self.assertEqual(self.events("plan_template.shared"), [])

    def test_400_at_the_field_named(self):
        cases = [
            ({"name": ""}, {"name": [say.CHOOSE_NAME]}),
            ({"name": "x" * 121}, {"name": [say.LONG_NAME]}),
            ({"kind": "big"}, {"kind": [say.CHOOSE_KIND]}),
            ({"description": "x" * 501}, {"description": [say.LONG_DESCRIPTION]}),
            ({"milestones": []}, {"milestones": [say.MILESTONE_COUNT]}),
            ({"sharing": "people"}, {"shared_with": [say.NO_TEAMMATES]}),
        ]
        for fields, errors in cases:
            response = self.post(**fields)
            self.assertEqual((response.status_code, response.data), (400, errors), fields)

    def test_at_most_fifty_teammates(self):
        """Sharing with more than `MAX_SHARED` teammates is refused in the
        UI's words. `MAX_SHARED` is patched down so the test does not need
        fifty real teammates (house rule: patch the limit, never 50 calls)."""
        teammates = [self.other.pk, self.admin.pk, self.mona.pk]
        with patch("services.plans.serializers.MAX_SHARED", 2):
            response = self.post(sharing="people", shared_with=teammates)
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"shared_with": [say.TOO_MANY_SHARED]}),
        )

    def test_the_51st_template_is_refused(self):
        PlanTemplate.objects.bulk_create(
            [
                PlanTemplate(
                    organisation=self.org,
                    owner=self.csm,
                    name=f"T{i}",
                    kind="other",
                    milestones=STEPS,
                )
                for i in range(49)
            ]
        )
        response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.TEMPLATE_LIMIT]}),
        )
        self.assertEqual(self.post(user=self.other).status_code, 201)

    def test_sharing_by_name_is_audited(self):
        data = self.post(sharing="people", shared_with=[self.other.pk]).data
        self.assertEqual(data["shared_with"], [{"id": self.other.pk, "name": "Dana CSM"}])
        self.assertEqual(
            self.events("plan_template.shared"),
            [(str(data["id"]), {"sharing": "people", "shared_with": [self.other.pk]})],
        )
        self.assertIn(data["id"], [t["id"] for t in self.api(self.other).get(URL).data["shared"]])

    def test_only_the_owner_edits_or_deletes(self):
        shared = self.make_template(name="Shared", sharing="workspace")
        url = f"{URL}{shared.pk}/"
        response = self.api(self.other).patch(url, {"name": "Mine now"}, format="json")
        self.assertEqual(
            (response.status_code, response.data), (403, {"detail": NOT_TEMPLATE_OWNER})
        )
        self.assertEqual(self.api(self.other).delete(url).status_code, 403)

    def test_built_ins_are_read_only(self):
        url = f"{URL}{self.builtin['qbr'].pk}/"
        response = self.api(self.admin).patch(url, {"name": "Ours"}, format="json")
        self.assertEqual(
            (response.status_code, response.data), (403, {"detail": BUILTIN_READ_ONLY})
        )
        self.assertEqual(self.api(self.admin).delete(url).status_code, 403)

    def test_an_edit_records_the_fields_changed_never_their_values(self):
        url = f"{URL}{self.mine.pk}/"
        response = self.api(self.csm).patch(
            url, {"name": "New", "description": "Why", "kind": "other"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.events("plan_template.updated"),
            [(str(self.mine.pk), {"fields": ["description", "name"]})],
        )

    def test_an_edit_checks_the_milestones(self):
        response = self.api(self.csm).patch(
            f"{URL}{self.mine.pk}/",
            {"milestones": [{"name": "M", "offset_days": -1}]},
            format="json",
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"milestones": [{"offset_days": [say.OFFSET_RANGE]}]}),
        )

    def test_delete_is_audited_and_keeps_its_plans(self):
        plan = self.build_plan(template=self.mine)
        response = self.api(self.csm).delete(f"{URL}{self.mine.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            self.events("plan_template.deleted"), [(str(self.mine.pk), {"kind": "other"})]
        )
        plan.refresh_from_db()
        self.assertIsNone(plan.template)
