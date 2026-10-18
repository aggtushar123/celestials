"""Slack escalations D4 contract §5 (spec §7, §5.2): a Slack thread is a
colleague's, asks for the department and the thread's decision, lets the
reply carry the Jira key and link where the channel is not shared; other
channels are unchanged."""

from django.test import SimpleTestCase

from services.agents import prompt

ALLOWED = ["note.create", "slack.reply", "jira.create", "jira.assign", "task.create"]


class EscalationPromptTests(SimpleTestCase):
    def test_a_slack_thread_is_a_colleague_s_and_asks_for_the_department(self):
        system = prompt.thread_system("cs", ALLOWED, "friendly", "customer:1", slack=True)
        self.assertIn(
            "A colleague raised this in your company's Slack, about the record customer:1", system
        )
        self.assertIn('"function": the department that must act on it', system)
        self.assertIn("the platform adds the assignment, the to-do and the reply", system)
        self.assertIn("A slack.reply answers the colleague in their thread", system)
        self.assertIn("except that a slack.reply may carry {{step N.ticket_key}}", system)

    def test_a_slack_thread_asks_for_the_decision_and_says_what_is_not_one(self):
        system = prompt.thread_system("cs", ALLOWED, "friendly", "customer:1", slack=True)
        self.assertIn('"decision": the newest message in the thread that gives the work', system)
        self.assertIn('A bare mention is not a decision: "<@U0FAIZ>", "cc <@U0FAIZ>"', system)
        self.assertIn("When the thread gives the work more than once, the newest wins.", system)
        self.assertIn('"actions": [], "function": null and "decision": null', system)

    def test_a_shared_channel_says_so_and_keeps_the_old_rule(self):
        system = prompt.thread_system(
            "cs", ALLOWED, "friendly", "customer:1", slack=True, shared=True
        )
        self.assertIn("This Slack channel is shared with people outside your company", system)
        self.assertNotIn("except that a slack.reply may carry", system)
        self.assertIn("never {{step N.key}} in a reply.", system)

    def test_without_jira_it_asks_only_for_the_department(self):
        system = prompt.thread_system(
            "cs", ["note.create", "slack.reply"], "friendly", "customer:1", slack=True
        )
        self.assertIn(
            'If so, name the department in "function"; the platform adds the reply in the thread.',
            system,
        )
        self.assertNotIn("except that a slack.reply may carry", system)

    def test_other_channels_are_unchanged(self):
        system = prompt.thread_system("cs", ALLOWED, "friendly", "customer:1")
        self.assertIn("A customer conversation arrived on the record customer:1", system)
        self.assertNotIn('"function"', system)
        self.assertNotIn('"decision"', system)

    def test_the_answer_s_decision_is_shape_checked(self):
        good = (
            '{"title": "x", "reason": "y", "actions": [], "decision": '
            '{"message": 2, "quote": "Faiz, can you take this?", "assignee": "Faiz"}}'
        )
        self.assertEqual(
            prompt.parse_thread(good).decision,
            {"message": 2, "quote": "Faiz, can you take this?", "assignee": "Faiz"},
        )
        for bad in (
            '"decision": null',
            '"decision": {"message": "2", "quote": "x", "assignee": "Faiz"}',
            '"decision": {"message": 2, "quote": "", "assignee": "Faiz"}',
            '"decision": {"message": 2, "quote": "x"}',
            '"decision": {"message": true, "quote": "x", "assignee": "Faiz"}',
            '"decision": "Faiz"',
        ):
            with self.subTest(bad=bad):
                raw = '{"title": "x", "reason": "y", "actions": [], ' + bad + "}"
                self.assertIsNone(prompt.parse_thread(raw).decision)

    def test_the_answer_s_function(self):
        read = prompt.parse_thread(
            '{"title": "x", "reason": "y", "function": "Engineering", "actions": []}'
        )
        self.assertEqual(read.function, "engineering")
        self.assertIsNone(
            prompt.parse_thread(
                '{"title": "x", "reason": "y", "function": "finance", "actions": []}'
            ).function
        )
        self.assertIsNone(
            prompt.parse_thread('{"title": "x", "reason": "y", "actions": []}').function
        )
        self.assertIsNone(prompt.parse_thread('[{"kind": "note.create"}]').function)
