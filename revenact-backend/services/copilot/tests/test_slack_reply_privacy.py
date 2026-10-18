"""A shared Copilot reply that quotes a Slack thread is read under the thread's
own department rule (Slack escalations D1, SOC2:AUTH-02): a reader who may
open the company but not the thread's department gets the redaction;
the thread's own department and Leadership read it whole."""

from services.copilot.grounded_records import record_ref
from services.copilot.tests.test_shared_reply_privacy import ANSWER, SharedConversationFixture
from services.copilot.views import REDACTED_REPLY
from services.customers.tests.slack_fixtures import conversation


class SlackThreadReplyTests(SharedConversationFixture):
    def slack_on(self, account, department):
        row = conversation(account, department=department)
        return record_ref("slack", row.pk, customer_id=None, account_id=account.pk)

    def test_a_reply_quoting_another_departments_thread_is_withheld(self):
        self.conversation_of(self.alice, self.raj)
        self.plain(self.alice, [self.slack_on(self.rajs_account, "cs")])

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])

    def test_a_reply_quoting_it_in_an_ask_snapshot_is_withheld_too(self):
        self.conversation_of(self.alice, self.raj)
        _asked, reply = self.ask(self.alice, "organizations", [self.rajs])
        reply.grounded_records = [self.slack_on(self.rajs_account, "cs")]
        reply.save(update_fields=["grounded_records"])

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])

    def test_the_threads_own_department_reads_it(self):
        self.conversation_of(self.alice, self.raj)
        self.plain(self.alice, [self.slack_on(self.rajs_account, "sales")])

        self.assertEqual(self.replies(self.raj), [ANSWER])

    def test_leadership_reads_any_departments_thread(self):
        self.conversation_of(self.raj, self.alice)
        self.plain(self.raj, [self.slack_on(self.rajs_account, "cs")])

        self.assertEqual(self.replies(self.alice), [ANSWER])
