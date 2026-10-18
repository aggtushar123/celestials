"""The live pick lists (agent bundles D3 contract §5.2, D3-8). Jira is a fake."""

from django.test import override_settings

from services.agents.tests.outside_fixtures import OutsideFixture

# Contract R2D2-21: at most one more than round 1's 8 (the reader's link read).
OPTIONS_QUERIES = 9
OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/{}/"


ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}


@override_settings(**ON)
class StepOptionsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
            ("slack.reply", self.slack_payload(self.conversation, self.support)),
        )
        self.create, self.assign, self.reply = self.bundle.steps.order_by("position")

    def get(self, step, name, user=None, **query):
        return self.client_for(user or self.csm).get(
            OPTIONS.format(self.bundle.pk, step.pk, name), query
        )

    def test_jiras_lists(self):
        self.assertEqual(
            self.get(self.create, "jira_projects").json(),
            {
                "options": [
                    {"id": "SUP", "name": "Support", "detail": "SUP"},
                    {"id": "ENG", "name": "Engineering", "detail": "ENG"},
                ],
                "more": False,
            },
        )
        self.assertEqual(
            self.get(self.create, "jira_issue_types").json(),
            {"project": ["Choose a project first."]},
        )
        types = self.get(self.create, "jira_issue_types", project="SUP").json()["options"]
        self.assertEqual([t["name"] for t in types], ["Task", "Bug"])
        self.assertEqual(
            [p["name"] for p in self.get(self.create, "jira_priorities").json()["options"]],
            ["High", "Medium", "Low"],
        )
        people = self.get(self.create, "jira_assignees", query="pri").json()["options"]
        self.assertEqual(
            people, [{"id": "acc-priya", "name": "Priya Shah", "detail": "priya@acme.io"}]
        )

    def test_an_assign_step_lists_by_its_producers_project(self):
        people = self.get(self.assign, "jira_assignees", query="erin").json()["options"]
        self.assertEqual([p["id"] for p in people], ["acc-erin"])

    def test_slack_channels_are_the_ones_revenact_reads(self):
        escalations = self.slack_connector(channel="C0ESCALATE", name="escalations")
        self.slack_connector(department="engineering", channel="C0ENG", name="eng")
        rows = self.get(self.reply, "slack_channels").json()["options"]
        self.assertEqual(
            [(r["id"], r["name"], r["detail"]) for r in rows],
            [
                (str(self.support.pk), "#support", "This thread"),
                (f"{escalations.pk}:C0ESCALATE", "#escalations", "A new message"),
            ],
        )

    def test_refusals(self):
        self.assertEqual(
            self.get(self.create, "slack_channels").json(),
            {"list": ["This step has no such list."]},
        )
        self.assertEqual(
            self.get(self.create, "jira_projects", query="x" * 101).json(),
            {"query": ["Keep the search under 100 characters."]},
        )
        self.assertEqual(self.get(self.create, "jira_projects", user=self.other).status_code, 404)
        self.jira.fail_lists("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502)
        unreachable = self.get(self.create, "jira_projects")
        self.assertEqual(
            (unreachable.status_code, unreachable.json()),
            (502, {"code": "TOOL_UNREACHABLE", "detail": "Couldn't reach Jira. Try again."}),
        )
        self.board.status = "error"
        self.board.save(update_fields=["status"])
        blocked = self.get(self.create, "jira_projects")
        self.assertEqual(
            (blocked.status_code, blocked.json()),
            (409, {"code": "TOOL_BLOCKED", "detail": "Reconnect Jira to do this."}),
        )

    def test_a_read_only_jira_still_lists(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        self.assertEqual(self.get(self.create, "jira_projects").status_code, 200)

    def test_only_a_waiting_or_failed_step_lists(self):
        self.create.status = "applied"
        self.create.save(update_fields=["status"])
        answer = self.get(self.create, "jira_projects")
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "STEP_NOT_WAITING"))

    def test_a_missing_project_is_told_before_a_long_search(self):
        answer = self.get(self.create, "jira_issue_types", query="x" * 101)
        self.assertEqual(answer.json(), {"project": ["Choose a project first."]})

    def test_a_blocked_tool_is_told_after_the_input_checks(self):
        self.board.status = "error"
        self.board.save(update_fields=["status"])
        answer = self.get(self.create, "jira_issue_types")
        self.assertEqual((answer.status_code, list(answer.json())), (400, ["project"]))

    def test_a_step_of_another_bundle_is_not_found(self):
        other = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        step = other.steps.first()
        answer = self.client_for(self.csm).get(
            OPTIONS.format(self.bundle.pk, step.pk, "jira_projects")
        )
        self.assertEqual((answer.status_code, answer.json()["code"]), (404, "NO_SUCH_BUNDLE"))

    def test_lists_read_as_a_linked_reader(self):
        self.link_for(self.csm)
        self.get(self.create, "jira_projects")
        self.assertTrue(self.jira.seats[-1].person)

    def test_a_lost_link_blocks_the_lists(self):
        self.link_for(self.csm, status="lost")
        answer = self.get(self.create, "jira_projects")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (
                409,
                {
                    "code": "TOOL_BLOCKED",
                    "detail": (
                        "Your Jira link stopped working. "
                        "Link Jira again, or remove the link to act as Jira Bot."
                    ),
                },
            ),
        )

    def test_atlassian_unreachable_is_a_502(self):
        from services.connectors.tests.atlassian_fake import use_atlassian

        atlassian = use_atlassian(self)
        atlassian.drop_refresh()
        self.link_for(self.csm, expires_in=0)
        answer = self.get(self.create, "jira_projects")
        self.assertEqual(
            (answer.status_code, answer.json()["detail"]),
            (502, "Couldn't reach Atlassian. Try again."),
        )

    def test_the_route_costs_a_fixed_number_of_queries(self):
        self.link_for(self.csm)
        self.get(self.create, "jira_projects")
        with self.assertNumQueries(OPTIONS_QUERIES):
            self.get(self.create, "jira_projects")

    def test_the_route_passes_a_jira_refusal_on_with_its_code(self):
        # Pins the route's pass-through shape only: any ListFailed is passed on as is.
        self.jira.fail_lists("TOOL_NOT_FOUND", "Jira can't find the project SUP.", 409)
        answer = self.get(self.create, "jira_issue_types", project="SUP")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (409, {"code": "TOOL_NOT_FOUND", "detail": "Jira can't find the project SUP."}),
        )
