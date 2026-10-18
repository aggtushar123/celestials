"""Agentic retrieval (services/copilot/agentic.py and get_completion's Gemini
tool loop): the model may search more of the asker's records while it
answers, never records the asker may not open, and every record a search
returns is stored on the reply as a source. The SDK is mocked at its
boundary: no live call."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from google.genai import types

from services.accounts.models import Organisation, User
from services.copilot import anthropic_client
from services.copilot.agentic import MAX_TOOL_ROUNDS, RecordSearch
from services.copilot.anthropic_client import get_completion
from services.copilot.models import Message, ModelCall
from services.customers.models import Activity, Customer


def _in_order(query, candidates, organisation=None):
    return [(i, 1.0 - i / 100) for i in range(len(candidates))]


class RecordSearchTests(TestCase):
    def setUp(self):
        patcher = patch("services.copilot.retrieval.rank_by_similarity", side_effect=_in_order)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch("services.copilot.agentic.rank_by_similarity", side_effect=_in_order)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.org = Organisation.objects.create(name="Alfee")
        self.owner = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", name="Faiz", organisation=self.org
        )
        self.outsider = User.objects.create_user(
            email="jesh@alfee.io", password="pw-123456789", name="Jesh", organisation=self.org
        )
        self.uber = Customer.objects.create(organisation=self.org, name="Uber", owner=self.owner)
        Activity.objects.create(
            customer=self.uber,
            type=Activity.ActivityType.ESCALATION_TRIGGERED,
            occurred_at="2026-10-02",
        )

    def test_a_named_company_the_asker_may_open_returns_records_and_sources(self):
        search = RecordSearch(self.org, self.owner)
        reply = search({"query": "escalations", "company": "Uber"})

        self.assertEqual(len(reply["results"]), 1)
        self.assertEqual(reply["results"][0]["company"], "Uber")
        self.assertIn("Escalation Triggered", reply["results"][0]["record"])
        self.assertEqual(len(search.sources), 1)

    def test_a_company_the_asker_may_not_open_returns_no_content_only_who_is_responsible(self):
        search = RecordSearch(self.org, self.outsider)
        reply = search({"query": "escalations", "company": "Uber"})

        self.assertEqual(reply["results"], [])
        self.assertIn("The asker may not read Uber's records", reply["note"])
        self.assertIn("Faiz", reply["note"])
        self.assertEqual(search.sources, [])

    def test_sources_start_from_the_grounding_and_never_repeat(self):
        search = RecordSearch(self.org, self.owner)
        search({"query": "escalations", "company": "Uber"})
        grounded = list(search.sources)

        again = RecordSearch(self.org, self.owner, sources=grounded)
        again({"query": "escalations", "company": "Uber"})
        again({"query": "anything else", "company": "Uber"})

        self.assertEqual(again.sources, grounded)

    def test_without_a_company_it_searches_the_companies_the_query_is_most_about(self):
        reply = RecordSearch(self.org, self.owner)({"query": "escalations"})
        self.assertEqual([r["company"] for r in reply["results"]], ["Uber"])

    def test_an_unknown_company_or_an_empty_query_is_said_plainly(self):
        search = RecordSearch(self.org, self.owner)
        with patch("services.copilot.agentic.find_relevant_company_semantic", return_value=None):
            unknown = search({"query": "escalations", "company": "Globex"})
        self.assertEqual(unknown["results"], [])
        self.assertIn("No company matches", unknown["note"])
        self.assertIn("Give a query", search({"query": "  "})["note"])

    def test_another_workspace_is_never_searched(self):
        other = Organisation.objects.create(name="Acme")
        Customer.objects.create(organisation=other, name="Uber", owner=None)
        reply = RecordSearch(other, self.owner)({"query": "escalations", "company": "Uber"})
        self.assertEqual(reply["results"], [])


def _response(*, text=None, calls=(), prompt=10, out=5):
    return SimpleNamespace(
        text=text,
        function_calls=[SimpleNamespace(name=name, args=args) for name, args in calls] or None,
        candidates=[
            SimpleNamespace(content=types.Content(role="model", parts=[types.Part(text="…")]))
        ],
        usage_metadata=SimpleNamespace(
            prompt_token_count=prompt, candidates_token_count=out, thoughts_token_count=1
        ),
    )


class FakeTool:
    name = "search_records"
    description = "Search."
    parameters = {"query": "What to look for."}
    required = ["query"]

    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def __call__(self, args):
        self.calls.append(args)
        if self.fail:
            raise RuntimeError("dana@acme.io leaked in an error")
        return {"results": [{"company": "Uber", "record": "SSO drops hourly."}]}


@override_settings(COPILOT_LLM_PROVIDER="gemini", GOOGLE_CLOUD_PROJECT="revenact-test")
class ToolLoopTests(TestCase):
    def setUp(self):
        anthropic_client._gemini_client.cache_clear()
        self.client = MagicMock()
        patcher = patch.object(anthropic_client, "_gemini_client", return_value=self.client)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _ask(self, tools):
        return get_completion(
            system="You are Copilot.",
            messages=[{"role": "user", "content": "What are Uber's users complaining about?"}],
            tools=tools,
        )

    def test_a_requested_search_runs_and_its_result_goes_back_to_the_model(self):
        self.client.models.generate_content.side_effect = [
            _response(calls=[("search_records", {"query": "complaints", "company": "Uber"})]),
            _response(text="Users report SSO drops."),
        ]
        tool = FakeTool()

        reply = self._ask([tool])

        self.assertEqual(reply, "Users report SSO drops.")
        self.assertEqual(tool.calls, [{"query": "complaints", "company": "Uber"}])
        second_contents = self.client.models.generate_content.call_args_list[1].kwargs["contents"]
        returned = second_contents[-1].parts[0].function_response
        self.assertEqual(returned.name, "search_records")
        self.assertEqual(returned.response["results"][0]["record"], "SSO drops hourly.")

    def test_one_audit_row_with_the_tokens_of_every_round(self):
        self.client.models.generate_content.side_effect = [
            _response(calls=[("search_records", {"query": "a"})], prompt=100, out=10),
            _response(text="Done.", prompt=200, out=20),
        ]
        self._ask([FakeTool()])

        call = ModelCall.objects.get()
        self.assertEqual((call.input_tokens, call.output_tokens), (300, 32))

    def test_the_model_must_answer_after_the_last_tool_round(self):
        searching = _response(calls=[("search_records", {"query": "again"})])
        self.client.models.generate_content.side_effect = [searching] * MAX_TOOL_ROUNDS + [
            _response(text="Answer from what I found.")
        ]
        tool = FakeTool()

        reply = self._ask([tool])

        self.assertEqual(reply, "Answer from what I found.")
        self.assertEqual(len(tool.calls), MAX_TOOL_ROUNDS)
        final = self.client.models.generate_content.call_args_list[-1].kwargs["config"]
        self.assertEqual(final.tool_config.function_calling_config.mode, "NONE")

    def test_the_last_round_is_told_to_answer_in_its_instructions_not_the_conversation(self):
        # Live 2026-10-16: a text part beside the tool results made Gemini
        # write instruction-like text instead of an answer.
        searching = _response(calls=[("search_records", {"query": "again"})])
        self.client.models.generate_content.side_effect = [searching] * MAX_TOOL_ROUNDS + [
            _response(text="Answer.")
        ]
        self.assertEqual(self._ask([FakeTool()]), "Answer.")
        last = self.client.models.generate_content.call_args_list[-1].kwargs
        self.assertIn(anthropic_client.ANSWER_NOW, last["config"].system_instruction)
        texts = [p.text for c in last["contents"] for p in c.parts if getattr(p, "text", None)]
        self.assertFalse(any(anthropic_client.ANSWER_NOW in t for t in texts))

    def test_no_text_on_the_last_round_gets_one_toolless_call_with_what_was_found(self):
        searching = _response(calls=[("search_records", {"query": "again"})])
        self.client.models.generate_content.side_effect = [searching] * (MAX_TOOL_ROUNDS + 1) + [
            _response(text="From the lookups: SSO drops hourly.")
        ]
        self.assertEqual(self._ask([FakeTool()]), "From the lookups: SSO drops hourly.")
        final = self.client.models.generate_content.call_args_list[-1].kwargs
        self.assertIsNone(final["config"].tools)
        flat = final["contents"][-1].parts[0].text
        self.assertIn("SSO drops hourly.", flat)
        self.assertIn("What are Uber's users complaining about?", flat)

    def test_a_reply_with_no_text_at_all_never_reaches_the_asker_empty(self):
        searching = _response(calls=[("search_records", {"query": "again"})])
        self.client.models.generate_content.side_effect = [searching] * (MAX_TOOL_ROUNDS + 1) + [
            _response(text="")
        ]
        self.assertEqual(self._ask([FakeTool()]), anthropic_client.NO_ANSWER)

    def test_the_audit_row_says_how_the_answer_came_about(self):
        self.client.models.generate_content.side_effect = [
            _response(calls=[("search_records", {"query": "a"})]),
            _response(text="Done."),
        ]
        self._ask([FakeTool()])
        call = ModelCall.objects.get()
        self.assertEqual(
            (call.tool_rounds, call.tools_used, call.fallback_used, call.no_answer),
            (1, ["search_records"], False, False),
        )

    def test_the_audit_row_records_a_fallback_and_a_reply_with_no_answer(self):
        searching = _response(calls=[("search_records", {"query": "again"})])
        self.client.models.generate_content.side_effect = [searching] * (MAX_TOOL_ROUNDS + 1) + [
            _response(text="")
        ]
        self._ask([FakeTool()])
        call = ModelCall.objects.get()
        self.assertEqual(
            (call.tool_rounds, call.fallback_used, call.no_answer), (MAX_TOOL_ROUNDS, True, True)
        )

    def test_a_failing_tool_is_reported_to_the_model_without_its_message(self):
        self.client.models.generate_content.side_effect = [
            _response(calls=[("search_records", {"query": "a"})]),
            _response(text="I could not search; here is what I know."),
        ]
        with self.assertLogs("services.copilot.anthropic_client", "WARNING") as logs:
            reply = self._ask([FakeTool(fail=True)])

        self.assertEqual(reply, "I could not search; here is what I know.")
        sent = self.client.models.generate_content.call_args_list[1].kwargs["contents"][-1]
        self.assertIn("error", sent.parts[0].function_response.response)
        self.assertNotIn("dana", "".join(logs.output))
        self.assertNotIn("dana", str(sent.parts[0].function_response.response))

    def test_without_tools_it_is_one_call_as_before(self):
        self.client.models.generate_content.return_value = _response(text="Plain.")
        self.assertEqual(self._ask(None), "Plain.")
        self.assertEqual(self.client.models.generate_content.call_count, 1)
        config = self.client.models.generate_content.call_args.kwargs["config"]
        self.assertFalse(config.tools)


@override_settings(COPILOT_LLM_PROVIDER="gemini", GOOGLE_CLOUD_PROJECT="revenact-test")
class SendWiringTests(TestCase):
    """The plain Copilot send gives the model RecordSearch and stores every
    record it returned as a source of the reply (SOC2:AUTH-02)."""

    def setUp(self):
        for target in ("services.copilot.retrieval", "services.copilot.agentic"):
            patcher = patch(f"{target}.rank_by_similarity", side_effect=_in_order)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.org = Organisation.objects.create(name="Alfee", ai_agent_enabled=True)
        self.user = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", name="Faiz", organisation=self.org
        )
        uber = Customer.objects.create(organisation=self.org, name="Uber", owner=self.user)
        Activity.objects.create(
            customer=uber, type=Activity.ActivityType.ESCALATION_TRIGGERED, occurred_at="2026-10-02"
        )
        self.client.force_login(self.user)

    def _send(self):
        from rest_framework.test import APIClient

        api = APIClient()
        api.force_authenticate(self.user)
        return api.post("/api/v1/copilot/messages/", {"content": "How are things?"}, format="json")

    def test_records_a_search_returned_are_stored_as_sources(self):
        def model(system, messages, tools=None, **kwargs):
            self.assertIn("search_records", system)
            search = next(tool for tool in tools if tool.name == "search_records")
            search({"query": "escalations", "company": "Uber"})
            return "Uber escalated this month."

        with patch("services.copilot.views.get_completion", side_effect=model):
            response = self._send()

        self.assertEqual(response.status_code, 200, response.content)
        reply = Message.objects.get(role=Message.Role.ASSISTANT)
        self.assertTrue(any(source.get("type") == "activity" for source in reply.sources))

    @override_settings(COPILOT_AGENTIC=False)
    def test_switched_off_the_send_is_single_shot(self):
        seen = {}

        def model(system, messages, tools=None, **kwargs):
            seen["tools"] = tools
            return "Fine."

        with patch("services.copilot.views.get_completion", side_effect=model):
            self._send()
        self.assertIsNone(seen["tools"])


class KnowledgeBrowserTests(TestCase):
    """browse_knowledge walks the asker's own OKF bundle (index → concept),
    without metric values, and records what every page shows as sources."""

    def setUp(self):
        from services.copilot.agentic import KnowledgeBrowser
        from services.knowledge.models import Contribution

        self.org = Organisation.objects.create(name="Alfee")
        self.owner = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", name="Faiz", organisation=self.org
        )
        self.outsider = User.objects.create_user(
            email="jesh@alfee.io", password="pw-123456789", name="Jesh", organisation=self.org
        )
        self.uber = Customer.objects.create(organisation=self.org, name="Uber", owner=self.owner)
        self.note = Contribution.objects.create(
            organisation=self.org,
            customer=self.uber,
            author=self.owner,
            function="cs",
            body="SSO drops hourly; fix ships in 2.4.",
        )
        self.search = RecordSearch(self.org, self.owner)
        self.browse = KnowledgeBrowser(self.org, self.owner, self.search)
        self.KnowledgeBrowser = KnowledgeBrowser

    def test_the_top_index_lists_the_bundle_and_counts_as_quoting_its_customers(self):
        page = self.browse({"path": ""})
        self.assertEqual(page["path"], "index.md")
        self.assertIn("okf_version", page["content"])
        self.assertIn("Uber", page["content"])
        self.assertIn(
            ("customer", self.uber.pk), {(s["type"], s["id"]) for s in self.search.sources}
        )

    def test_a_directory_returns_its_index(self):
        self.assertEqual(self.browse({"path": "metrics/"})["path"], "metrics/index.md")
        self.assertEqual(self.browse({"path": "customers"})["path"], "customers/index.md")

    def test_a_note_is_recorded_as_the_contribution_it_is(self):
        path = f"knowledge/uber-{self.uber.pk}/note-{self.note.pk}.md"
        page = self.browse({"path": path})
        self.assertIn("SSO drops hourly", page["content"])
        (source,) = self.search.sources
        self.assertEqual(
            (source["type"], source["id"], source["company_id"]),
            ("contribution", self.note.pk, self.uber.pk),
        )

    def test_metrics_carry_definitions_and_computations_but_no_values(self):
        page = self.browse({"path": "metrics/active_arr.md"})
        self.assertIn("# Definition", page["content"])
        self.assertNotIn("# Current value", page["content"])
        self.assertNotIn("value:", page["content"].split("---")[1])
        self.assertIn(
            "Attested Computation", self.browse({"path": "computations/active_arr.md"})["content"]
        )
        self.assertEqual(self.search.sources, [])

    def test_a_customer_the_asker_may_not_open_is_not_in_their_bundle(self):
        search = RecordSearch(self.org, self.outsider)
        browse = self.KnowledgeBrowser(self.org, self.outsider, search)
        self.assertNotIn("Uber", browse({"path": ""})["content"])
        self.assertIn("error", browse({"path": f"customers/uber-{self.uber.pk}.md"}))
        self.assertEqual(search.sources, [])

    def test_paths_stay_inside_the_bundle(self):
        self.assertIn("error", self.browse({"path": "../../config/settings.py"}))
        self.assertIn("error", self.browse({"path": "nowhere/thing.md"}))

    def test_the_bundle_is_built_once_per_send(self):
        with patch("services.knowledge.okf.Bundle.build", autospec=True) as build:
            build.side_effect = lambda bundle: bundle.files.update({"index.md": "# Top\n"})
            browse = self.KnowledgeBrowser(self.org, self.owner, RecordSearch(self.org, self.owner))
            browse({"path": ""})
            browse({"path": ""})
        self.assertEqual(build.call_count, 1)


@override_settings(COPILOT_LLM_PROVIDER="gemini", GOOGLE_CLOUD_PROJECT="revenact-test")
class SendOffersBothToolsTests(TestCase):
    def test_a_plain_send_offers_search_and_the_knowledge_bundle(self):
        from rest_framework.test import APIClient

        org = Organisation.objects.create(name="Alfee", ai_agent_enabled=True)
        user = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", name="Faiz", organisation=org
        )
        seen = {}

        def model(system, messages, tools=None, **kwargs):
            seen["tools"] = [tool.name for tool in tools]
            seen["system"] = system
            return "Fine."

        api = APIClient()
        api.force_authenticate(user)
        with patch("services.copilot.views.get_completion", side_effect=model):
            api.post("/api/v1/copilot/messages/", {"content": "How is ARR defined?"}, format="json")
        self.assertEqual(seen["tools"], ["search_records", "browse_knowledge"])
        self.assertIn("browse_knowledge", seen["system"])
