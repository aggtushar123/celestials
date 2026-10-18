"""A jira.create step with no project (the connection names none): the
runner's one project is used, several are asked about, none offers to
create one (`POST .../jira-project/`). Jira is a fake: nothing is created."""

from django.test import override_settings

from core.models import AuditEvent
from services.agents.actions.diagnose import new_key
from services.agents.outside import jira_projects, tools
from services.agents.tests.outside_fixtures import OutsideFixture

DETAIL = "/api/v1/agents/bundles/{}/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"
STEP_RUN = "/api/v1/agents/bundles/{}/steps/{}/run/"
PROJECT = "/api/v1/agents/bundles/{}/steps/{}/jira-project/"
ONE = [{"id": "KAN", "name": "Kanban board", "detail": "KAN"}]
SEVERAL = [
    {"id": "SUP", "name": "Support", "detail": "SUP"},
    {"id": "ENG", "name": "Engineering", "detail": "ENG"},
    {"id": "KAN", "name": "Kanban board", "detail": "KAN"},
]


# Linking off whatever the developer's .env says: the connection acts.
@override_settings(ATLASSIAN_OAUTH_CLIENT_ID="", ATLASSIAN_OAUTH_CLIENT_SECRET="")
class JiraProjectChoiceTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(project="")
        _, self.thread = self.slack_thread(self.pizza)
        self.bundle = self.outside_bundle(
            self.thread, ("jira.create", self.jira_payload(self.board, project=""))
        )
        self.made = self.bundle.steps.get()
        task = [{"id": "10001", "name": "Task", "detail": ""}]
        self.jira.types.update({"ENG": task, "KAN": task, "CE": task})

    def shown(self, user=None):
        body = self.client_for(user or self.csm).get(DETAIL.format(self.bundle.pk)).json()
        return body["steps"][0]

    def create(self, body, user=None):
        return self.client_for(user or self.csm).post(
            PROJECT.format(self.bundle.pk, self.made.pk), body, format="json"
        )

    # --- one project ------------------------------------------------------

    def test_the_one_project_is_shown_and_used_at_run(self):
        self.jira.project_rows = list(ONE)
        step = self.shown()
        preview = step["preview"]["jira"]
        self.assertEqual(
            (preview["project"], preview["needs_project"], step["question"]), ("KAN", False, None)
        )
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.made.refresh_from_db()
        self.assertEqual(self.made.status, "applied", self.made.error)
        self.assertEqual(self.made.payload["project"], "KAN")
        [key] = self.jira.created
        self.assertEqual(self.jira.issues[key]["fields"]["project"], {"key": "KAN"})

    def test_a_page_and_its_run_share_one_read(self):
        self.jira.project_rows = list(ONE)
        self.shown()
        self.shown()
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(self.jira.project_reads, 1)

    # --- several projects -------------------------------------------------

    def test_several_projects_ask_which(self):
        self.jira.project_rows = list(SEVERAL)
        step = self.shown()
        preview = step["preview"]["jira"]
        self.assertEqual(preview["project"], "")
        self.assertTrue(preview["needs_project"])
        self.assertEqual(
            preview["project_choices"],
            [
                {"key": "ENG", "name": "Engineering"},
                {"key": "KAN", "name": "Kanban board"},
                {"key": "SUP", "name": "Support"},
            ],
        )
        self.assertFalse(preview["can_create_project"])
        self.assertEqual(step["question"], "Which Jira project should this ticket go in?")
        # Run without choosing: the last-resort sentence, nothing made.
        self.run_all_steps(self.csm, self.bundle)
        self.made.refresh_from_db()
        self.assertEqual(
            (self.made.error, self.jira.created), ("Choose a Jira project, then Retry.", [])
        )
        self.retry(self.csm, self.made, {"project": "ENG"})
        self.made.refresh_from_db()
        self.assertEqual((self.made.status, self.made.payload["project"]), ("applied", "ENG"))

    def test_the_choices_stop_at_twenty(self):
        self.jira.project_rows = [
            {"id": f"P{n:02d}", "name": f"Project {n:02d}", "detail": ""} for n in range(30)
        ]
        self.assertEqual(len(self.shown()["preview"]["jira"]["project_choices"]), 20)

    def test_a_project_not_in_the_runners_list_is_refused(self):
        self.jira.project_rows = list(SEVERAL)
        answer = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.made.pk),
            {"fields": {"project": "OPS"}},
            format="json",
        )
        self.assertEqual(answer.status_code, 400)
        self.assertEqual(
            answer.json()["steps"][str(self.made.pk)], {"project": ["Choose a Jira project."]}
        )

    def test_a_guided_step_run_takes_the_project(self):
        self.jira.project_rows = list(SEVERAL)
        # A guided bundle (a diagnosis after it) whose first step is the Jira issue.
        self.bundle.delete()
        self.bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board, project="")),
            ("record.diagnose", {"key": new_key()}),
        )
        steps = list(self.bundle.steps.order_by("position"))
        self.made = steps[0]
        shown = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(shown["question"], "Which Jira project should this ticket go in?")
        refused = self.client_for(self.csm).post(
            STEP_RUN.format(self.bundle.pk, self.made.pk),
            {"fields": {"project": "OPS"}},
            format="json",
        )
        self.assertEqual(refused.status_code, 400, refused.content)
        ran = self.client_for(self.csm).post(
            STEP_RUN.format(self.bundle.pk, self.made.pk),
            {"fields": {"project": "KAN"}},
            format="json",
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.made.refresh_from_db()
        self.assertEqual((self.made.status, self.made.payload["project"]), ("applied", "KAN"))

    # --- no project -------------------------------------------------------

    def test_no_project_offers_to_create_one(self):
        self.jira.project_rows = []
        preview = self.shown()["preview"]["jira"]
        self.assertEqual(
            (
                preview["needs_project"],
                preview["project_choices"],
                preview["can_create_project"],
                preview["suggested_project"],
            ),
            (True, [], True, {"name": "Customer Escalations", "key": "CE"}),
        )

    def test_a_taken_key_is_made_unique(self):
        self.jira.project_rows = []
        self.jira.taken_keys = {"CE", "CE2"}
        preview = self.shown()["preview"]["jira"]
        self.assertEqual(
            preview["suggested_project"], {"name": "Customer Escalations", "key": "CE3"}
        )

    def test_an_account_that_cant_create_is_told_so(self):
        self.jira.project_rows = []
        self.jira.may_create_projects = False
        preview = self.shown()["preview"]["jira"]
        self.assertEqual(
            (preview["can_create_project"], preview["suggested_project"]), (False, None)
        )

    def test_creating_the_project_sets_it_and_answers_the_bundle(self):
        self.jira.project_rows = []
        answer = self.create({"name": "Customer Escalations", "key": "CE"})
        self.assertEqual(answer.status_code, 201, answer.content)
        self.assertEqual(self.jira.made_projects, [("CE", "Customer Escalations")])
        step = answer.json()["bundle"]["steps"][0]
        self.assertEqual(
            (step["preview"]["jira"]["project"], step["preview"]["jira"]["needs_project"]),
            ("CE", False),
        )
        self.made.refresh_from_db()
        self.assertEqual(self.made.payload["project"], "CE")
        event = AuditEvent.objects.get(action="jira.project_created")
        self.assertEqual(
            event.metadata,
            {
                "bundle": self.bundle.pk,
                "step": self.made.pk,
                "connector": self.board.pk,
                "key": "CE",
                "as": "connection",
            },
        )
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.made.refresh_from_db()
        self.assertEqual(self.made.status, "applied", self.made.error)

    def test_the_body_is_checked(self):
        for body, field in (
            ({"name": "", "key": "CE"}, "name"),
            ({"name": "x" * 81, "key": "CE"}, "name"),
            ({"name": "Escalations", "key": "ce"}, "key"),
            ({"name": "Escalations", "key": "C"}, "key"),
            ({"name": "Escalations", "key": "CUSTOMERESC1"}, "key"),
            ({"name": "Escalations", "key": "CE", "lead": "x"}, "lead"),
        ):
            with self.subTest(body=body):
                answer = self.create(body)
                self.assertEqual(answer.status_code, 400)
                self.assertIn(field, answer.json())
        self.assertEqual(self.jira.made_projects, [])

    def test_a_key_jira_already_has_is_a_field_error(self):
        self.jira.taken_keys = {"CE"}
        answer = self.create({"name": "Customer Escalations", "key": "CE"})
        self.assertEqual(
            (answer.status_code, answer.json()),
            (400, {"key": ["Jira already has a project with this key. Try another."]}),
        )

    def test_jiras_refusal_is_a_plain_403(self):
        self.jira.project_refusal = tools.CantCreateProject(jira_projects.CANT_CREATE)
        answer = self.create({"name": "Customer Escalations", "key": "CE"})
        self.assertEqual(answer.status_code, 403)
        self.assertEqual(
            answer.json(),
            {
                "code": "CANT_CREATE_PROJECT",
                "detail": "Your Jira account can't create projects. "
                "Ask a Jira admin, or choose an existing project.",
            },
        )
        self.assertFalse(AuditEvent.objects.filter(action="jira.project_created").exists())

    def test_only_someone_who_may_run_the_step(self):
        answer = self.create({"name": "Customer Escalations", "key": "CE"}, user=self.other)
        self.assertIn(answer.status_code, (403, 404))
        self.assertEqual(self.jira.made_projects, [])
        # Nor does Jira get read for them.
        self.jira.project_rows = []
        reads = self.jira.project_reads
        self.client_for(self.other).get(DETAIL.format(self.bundle.pk))
        self.assertEqual(self.jira.project_reads, reads)

    def test_a_read_only_connection_is_refused(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        answer = self.create({"name": "Customer Escalations", "key": "CE"})
        self.assertEqual(answer.status_code, 409)
        self.assertEqual(answer.json()["detail"], "Ask an admin to allow agents to act in Jira.")
        self.assertEqual(self.jira.made_projects, [])
        self.assertFalse(self.shown()["preview"]["jira"]["needs_project"])

    def test_another_kind_of_step_has_no_project_route(self):
        self.made.kind = "jira.assign"
        self.made.save(update_fields=["kind"])
        self.assertEqual(self.create({"name": "Escalations", "key": "CE"}).status_code, 404)
