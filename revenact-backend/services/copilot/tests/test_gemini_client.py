"""Unit tier: get_completion's Gemini branch (Vertex AI). The SDK is mocked
at its boundary (`google.genai.Client`) — no real, paid, live call is made
here — so these tests pin our own routing, translation and audit logic."""

from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from services.copilot import anthropic_client
from services.copilot.anthropic_client import (
    CopilotNotConfigured,
    CopilotRequestFailed,
    get_completion,
)
from services.copilot.models import ModelCall

TIERS = {
    "lite": {
        "model": "lite-model",
        "location": "asia-south1",
        "thinking_level": "MINIMAL",
        "thinking_headroom": 512,
    },
    "flash": {
        "model": "flash-model",
        "location": "asia-south1",
        "thinking_level": "MINIMAL",
        "thinking_headroom": 2048,
    },
    "pro": {
        "model": "pro-model",
        "location": "global",
        "thinking_level": "",
        "thinking_headroom": 8192,
    },
}
PURPOSE_TIERS = {"classification": "lite", "brief": "pro"}


def _fake_response(text="A real reply.", prompt=12, candidates=30, thoughts=100):
    usage = MagicMock(
        prompt_token_count=prompt, candidates_token_count=candidates, thoughts_token_count=thoughts
    )
    return MagicMock(text=text, usage_metadata=usage)


def _client(response=None, error=None):
    client = MagicMock()
    if error is not None:
        client.models.generate_content.side_effect = error
    else:
        client.models.generate_content.return_value = response or _fake_response()
    return client


@override_settings(
    COPILOT_LLM_PROVIDER="gemini",
    GOOGLE_CLOUD_PROJECT="revenact-test",
    GEMINI_TIERS=TIERS,
    GEMINI_PURPOSE_TIERS=PURPOSE_TIERS,
)
class GeminiProviderTests(TestCase):
    def setUp(self):
        anthropic_client._gemini_client.cache_clear()

    def _call(self, mock_client_cls, purpose="copilot", **kwargs):
        return get_completion(
            system="You are Copilot.",
            messages=[
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello."},
                {"role": "user", "content": "How is Zoom?"},
            ],
            purpose=purpose,
            **kwargs,
        )

    @patch("google.genai.Client")
    def test_translates_messages_and_system_prompt(self, mock_cls):
        client = mock_cls.return_value = _client()

        reply = self._call(mock_cls)

        self.assertEqual(reply, "A real reply.")
        kwargs = client.models.generate_content.call_args.kwargs
        roles = [content.role for content in kwargs["contents"]]
        self.assertEqual(roles, ["user", "model", "user"])
        self.assertEqual(kwargs["contents"][2].parts[0].text, "How is Zoom?")
        self.assertEqual(kwargs["config"].system_instruction, "You are Copilot.")

    @patch("google.genai.Client")
    def test_unknown_purpose_uses_the_flash_tier(self, mock_cls):
        client = mock_cls.return_value = _client()

        self._call(mock_cls, purpose="copilot", max_tokens=1000)

        mock_cls.assert_called_once_with(
            vertexai=True, project="revenact-test", location="asia-south1"
        )
        kwargs = client.models.generate_content.call_args.kwargs
        self.assertEqual(kwargs["model"], "flash-model")
        # Thinking tokens share the output budget, so the caller's answer
        # budget gets the tier's thinking headroom on top.
        self.assertEqual(kwargs["config"].max_output_tokens, 1000 + 2048)
        self.assertEqual(kwargs["config"].thinking_config.thinking_level, "MINIMAL")

    @patch("google.genai.Client")
    def test_background_purpose_uses_the_lite_tier(self, mock_cls):
        client = mock_cls.return_value = _client()

        self._call(mock_cls, purpose="classification")

        self.assertEqual(client.models.generate_content.call_args.kwargs["model"], "lite-model")

    @patch("google.genai.Client")
    def test_precomputed_purpose_uses_pro_on_the_global_endpoint(self, mock_cls):
        client = mock_cls.return_value = _client()

        self._call(mock_cls, purpose="brief")

        mock_cls.assert_called_once_with(vertexai=True, project="revenact-test", location="global")
        kwargs = client.models.generate_content.call_args.kwargs
        self.assertEqual(kwargs["model"], "pro-model")
        self.assertIsNone(kwargs["config"].thinking_config)

    @override_settings(GEMINI_TIERS={**TIERS, "lite": {**TIERS["lite"], "model": "other-lite"}})
    @patch("google.genai.Client")
    def test_tier_models_come_from_settings(self, mock_cls):
        client = mock_cls.return_value = _client()

        self._call(mock_cls, purpose="classification")

        self.assertEqual(client.models.generate_content.call_args.kwargs["model"], "other-lite")

    @patch("google.genai.Client")
    def test_one_client_per_location(self, mock_cls):
        mock_cls.return_value = _client()

        self._call(mock_cls, purpose="copilot")
        self._call(mock_cls, purpose="classification")
        self._call(mock_cls, purpose="brief")

        locations = [call.kwargs["location"] for call in mock_cls.call_args_list]
        self.assertEqual(locations, ["asia-south1", "global"])

    @patch("google.genai.Client")
    def test_a_response_schema_makes_gemini_answer_json_in_that_shape(self, mock_cls):
        client = mock_cls.return_value = _client()
        schema = {"type": "object", "properties": {"a": {"type": "integer"}}, "required": ["a"]}
        self._call(mock_cls, response_schema=schema)
        config = client.models.generate_content.call_args.kwargs["config"]
        self.assertEqual(config.response_mime_type, "application/json")
        self.assertEqual(config.response_json_schema, schema)

    @patch("google.genai.Client")
    def test_without_a_schema_the_answer_is_free_text(self, mock_cls):
        client = mock_cls.return_value = _client()
        self._call(mock_cls)
        config = client.models.generate_content.call_args.kwargs["config"]
        self.assertIsNone(config.response_mime_type)
        self.assertIsNone(config.response_json_schema)

    @patch("google.genai.Client")
    def test_usage_is_audited_with_thinking_counted_as_output(self, mock_cls):
        mock_cls.return_value = _client(_fake_response(prompt=12, candidates=30, thoughts=100))

        self._call(mock_cls, purpose="classification")

        call = ModelCall.objects.get()
        self.assertEqual(call.provider, "gemini")
        self.assertEqual(call.model, "lite-model")
        self.assertEqual(call.outcome, ModelCall.Outcome.OK)
        self.assertEqual(call.input_tokens, 12)
        self.assertEqual(call.output_tokens, 130)

    @patch("google.genai.Client")
    def test_an_empty_reply_is_an_empty_string(self, mock_cls):
        mock_cls.return_value = _client(_fake_response(text=None, thoughts=None))

        self.assertEqual(self._call(mock_cls), "")

    @patch("google.genai.Client")
    def test_an_sdk_failure_becomes_copilot_request_failed(self, mock_cls):
        mock_cls.return_value = _client(error=RuntimeError("quota exceeded"))

        with self.assertRaises(CopilotRequestFailed):
            self._call(mock_cls)

        call = ModelCall.objects.get()
        self.assertEqual(call.outcome, ModelCall.Outcome.FAILED)
        self.assertIn("quota exceeded", call.error)

    @override_settings(GOOGLE_CLOUD_PROJECT="")
    def test_no_project_raises_copilot_not_configured(self):
        with self.assertRaises(CopilotNotConfigured):
            get_completion(system="You are Copilot.", messages=[{"role": "user", "content": "Hi"}])
