"""Sharing a conversation shares the conversation, not anyone's data rights
(SOC2:AUTH-02). Every reader — the owner and accepted session participants
as much as a mentioned one — is checked per reply: a reply someone else
asked that draws on a customer, record, ticket or pipeline item the reader
may not open is `REDACTED_REPLY`, and its question loses its Ask context. A
reader's own replies are always theirs. The model history of their next send
and the facilitator's transcript are that same filtered view."""

from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import User
from services.copilot.models import (
    Conversation,
    CopilotSession,
    Message,
    SessionInvite,
    SessionParticipant,
)
from services.copilot.views import REDACTED_REPLY, sees_whole_conversation, visible_messages
from services.customers.models import Customer, Note, Ticket
from services.customers.tests.test_views import create_account
from services.knowledge.tests.test_hierarchy import ChartFixture

ANSWER = "Secret Corp renews at USD 900,000 and is at risk."
NOTHING = {"account_ids": [], "departments": []}
SURFACES = ("dashboard", "organizations", "contacts", "accounts", "pipelines")


class SharedConversationFixture(ChartFixture):
    """Carl (cs) owns Pizza Hut and Secret Corp; Raj (sales) owns Raj Co and
    may open neither of Carl's; Alice is an admin in Leadership who opens
    everything."""

    def setUp(self):
        super().setUp()
        self.secret = Customer.objects.create(
            organisation=self.org, name="Secret Corp", owner=self.carl
        )
        self.rajs = Customer.objects.create(organisation=self.org, name="Raj Co", owner=self.raj)
        self.secret_account = create_account(self.secret, name="Secret EMEA", owner=self.carl)
        self.rajs_account = create_account(self.rajs, name="Raj Co UK", owner=self.raj)

    def conversation_of(self, owner, *participants):
        self.conversation = Conversation.objects.create(
            organisation=self.org, user=owner, title="Shared"
        )
        for user in participants:
            self.join(user, invited_by=owner)
        return self.conversation

    def join(self, user, invited_by=None):
        session, _ = CopilotSession.objects.get_or_create(
            conversation=self.conversation, defaults={"status": CopilotSession.Status.LIVE}
        )
        SessionInvite.objects.create(
            session=session,
            invited_user=user,
            invited_by=invited_by or self.conversation.user,
            status=SessionInvite.Status.ACCEPTED,
        )
        SessionParticipant.objects.create(session=session, user=user)
        self.assertTrue(sees_whole_conversation(self.conversation, user))
        return session

    def ask(self, author, surface, customers, content=ANSWER):
        """An Ask turn and its reply, with the snapshots SendMessageView fixes."""
        asked = Message.objects.create(
            conversation=self.conversation,
            role="user",
            content="Which renewals are at risk?",
            author=author,
            context={"surface": surface, "view": "list", "filters": {}, "focus": None},
        )
        reply = Message.objects.create(
            conversation=self.conversation,
            role="assistant",
            content=content,
            sources=[],
            grounded_customer_ids=[c.pk for c in customers],
            carries_anomaly_text=False,
            grounded_pipeline=NOTHING,
            grounded_tickets=NOTHING,
            grounded_records=[],
            reply_to=asked,
        )
        return asked, reply

    def plain(self, author, sources, content=ANSWER):
        """A Communications/Copilot turn and its reply citing `sources`."""
        asked = Message.objects.create(
            conversation=self.conversation, role="user", content="What's new?", author=author
        )
        reply = Message.objects.create(
            conversation=self.conversation,
            role="assistant",
            content=content,
            sources=sources,
            reply_to=asked,
        )
        return asked, reply

    def ticket_on(self, account):
        ticket = Ticket.objects.create(
            account=account,
            ticket_number=f"T-{Ticket.objects.count() + 1}",
            title="SSO broken",
            opened_at=timezone.localdate(),
        )
        return {
            "type": "ticket",
            "id": ticket.pk,
            "company_type": "account",
            "company_id": account.pk,
        }

    def note_on(self, account):
        note = Note.objects.create(
            account=account, title="t", body="b", logged_at=timezone.localdate()
        )
        return {"type": "note", "id": note.pk, "company_type": "account", "company_id": account.pk}

    def shown(self, user):
        reader = User.objects.get(pk=user.pk)
        conversation = Conversation.objects.get(pk=self.conversation.pk)
        return visible_messages(conversation, reader)

    def replies(self, user):
        return [m.content for m in self.shown(user) if m.role == "assistant"]


class OwnerReadsSomeoneElsesReplyTests(SharedConversationFixture):
    def test_a_participants_ask_reply_on_a_customer_the_owner_cannot_open_is_withheld(self):
        for surface in SURFACES:
            with self.subTest(surface=surface):
                Message.objects.all().delete()
                Conversation.objects.all().delete()
                self.conversation_of(self.raj, self.carl)
                asked, _reply = self.ask(self.carl, surface, [self.secret])

                self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])
                question = next(m for m in self.shown(self.raj) if m.id == asked.id)
                self.assertEqual(question.content, "Which renewals are at risk?")
                self.assertIsNone(question.context)
                # The asker still reads it, context and all.
                self.assertEqual(self.replies(self.carl), [ANSWER])
                mine = next(m for m in self.shown(self.carl) if m.id == asked.id)
                self.assertEqual(mine.context["surface"], surface)

    def test_a_participants_reply_citing_a_ticket_the_owner_cannot_open_is_withheld(self):
        self.conversation_of(self.raj, self.carl)
        self.plain(self.carl, [self.ticket_on(self.secret_account)])

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])
        self.assertEqual(self.replies(self.carl), [ANSWER])

    def test_an_owner_who_can_open_everything_cited_reads_it(self):
        self.conversation_of(self.alice, self.carl)
        self.ask(self.carl, "organizations", [self.secret])
        self.plain(self.carl, [self.ticket_on(self.secret_account)], content="Ticket answer.")

        self.assertEqual(self.replies(self.alice), [ANSWER, "Ticket answer."])

    def test_a_deleted_askers_reply_is_withheld_from_the_owner_too(self):
        self.conversation_of(self.raj, self.carl)
        self.ask(self.carl, "dashboard", [self.rajs])
        Message.objects.filter(role="user").update(author=None)

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])


class ParticipantReadsSomeoneElsesReplyTests(SharedConversationFixture):
    def test_the_owners_reply_citing_what_the_participant_cannot_open_is_withheld(self):
        self.conversation_of(self.carl, self.raj)
        self.ask(self.carl, "accounts", [self.secret])
        self.plain(self.carl, [self.note_on(self.secret_account)], content="Note answer.")

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY, REDACTED_REPLY])

    def test_another_participants_reply_is_checked_too(self):
        self.conversation_of(self.carl, self.raj, self.dana)
        self.ask(self.dana, "pipelines", [self.secret])

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])

    def test_a_reply_citing_only_what_the_participant_may_open_is_whole(self):
        self.conversation_of(self.carl, self.raj)
        self.ask(self.carl, "contacts", [self.rajs], content="Raj Co is fine.")
        self.plain(self.carl, [self.note_on(self.rajs_account)], content="Note answer.")

        self.assertEqual(self.replies(self.raj), ["Raj Co is fine.", "Note answer."])


class OwnRepliesAlwaysShowTests(SharedConversationFixture):
    def test_the_owners_own_replies_show_after_they_lose_access(self):
        self.conversation_of(self.raj, self.carl)
        self.ask(self.raj, "dashboard", [self.rajs], content="Ask answer.")
        self.plain(self.raj, [self.note_on(self.rajs_account)], content="Plain answer.")
        Customer.objects.filter(pk=self.rajs.pk).update(owner=self.carl)
        self.rajs_account.owner = self.carl
        self.rajs_account.save(update_fields=["owner"])

        self.assertEqual(self.replies(self.raj), ["Ask answer.", "Plain answer."])

    def test_a_participants_own_replies_show_after_they_lose_access(self):
        self.conversation_of(self.raj, self.carl)
        self.ask(self.carl, "organizations", [self.secret], content="Ask answer.")
        self.plain(self.carl, [self.ticket_on(self.secret_account)], content="Plain answer.")
        Customer.objects.filter(pk=self.secret.pk).update(owner=self.raj)
        self.secret_account.owner = self.raj
        self.secret_account.save(update_fields=["owner"])

        self.assertEqual(self.replies(self.carl), ["Ask answer.", "Plain answer."])


class FilteredHistoryTests(SharedConversationFixture):
    @patch("services.copilot.views.get_completion", return_value="Noted.")
    def test_the_owners_next_send_feeds_the_model_the_redaction(self, completion):
        from rest_framework.test import APIClient

        self.conversation_of(self.raj, self.carl)
        self.ask(self.carl, "dashboard", [self.secret])

        api = APIClient()
        api.force_authenticate(User.objects.get(pk=self.raj.pk))
        response = api.post(
            "/api/v1/copilot/messages/",
            {"content": "And what next?", "conversation_id": self.conversation.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        fed = [m["content"] for m in completion.call_args.kwargs["messages"]]
        self.assertIn(REDACTED_REPLY, fed)
        self.assertNotIn(ANSWER, fed)
        self.assertNotIn(ANSWER, str(response.data))

    def test_the_facilitator_transcript_is_the_requesters_view(self):
        from services.metrics import facilitator

        self.conversation_of(self.raj, self.carl)
        self.ask(self.carl, "dashboard", [self.secret])
        session = CopilotSession.objects.get(conversation=self.conversation)

        prompt = facilitator.build_prompt(
            facilitator.build_evidence(session, requested_by=User.objects.get(pk=self.raj.pk))
        )

        self.assertIn(REDACTED_REPLY, prompt)
        self.assertNotIn(ANSWER, prompt)


class OwnerReadCostTests(SharedConversationFixture):
    def read_cost(self):
        reader = User.objects.get(pk=self.raj.pk)
        conversation = Conversation.objects.get(pk=self.conversation.pk)
        with CaptureQueriesContext(connection) as ctx:
            visible_messages(conversation, reader)
        return len(ctx.captured_queries)

    def add(self, count):
        for _ in range(count):
            self.ask(self.carl, "dashboard", [self.secret])
            self.plain(self.carl, [self.ticket_on(self.secret_account)])
            self.plain(self.carl, [self.note_on(self.rajs_account)])

    def test_the_owners_read_is_flat_in_the_number_of_other_askers_replies(self):
        self.conversation_of(self.raj, self.carl)
        self.add(1)
        small = self.read_cost()
        Ticket.objects.all().delete()
        Message.objects.all().delete()
        self.add(6)
        large = self.read_cost()

        self.assertEqual(small, large)
        # The messages (the owner's whole-reader check costs none), the
        # reader's rights (membership, role, organisation), their reports,
        # then every reply's checks at once: the grounded customers, the cited
        # accounts, and existing + readable notes. The tickets are never
        # looked up: their account already fails. It was 1 before replies
        # were checked for the owner.
        self.assertEqual(large, 9)


class OriginHeaderTests(SharedConversationFixture):
    """A conversation's stored origin (surface, filters, labels) is its first
    Ask turn's, so its asker's. The detail header shows it to anyone else only
    when that turn's reply is shown to them (`_origin_if_shown`), so a
    withheld reply's context never leaks through it; the list shows it to its
    asker only, which keeps the list flat (SOC2:AUTH-02)."""

    def setUp(self):
        super().setUp()
        # View-all, but not Leadership: every account, only Sales' tickets.
        self.vera = User.objects.create_user(
            email="vera@acme.io",
            password="x",
            name="Vera Viewall",
            organisation=self.org,
            role=User.Role.ADMIN,
            function="sales",
        )

    def get(self, user, path):
        from rest_framework.test import APIClient

        api = APIClient()
        api.force_authenticate(User.objects.get(pk=user.pk))
        response = api.get(f"/api/v1/copilot/{path}")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def started_by(self, asker, owner, *participants, customers=None, surface="dashboard"):
        """A conversation whose first turn is `asker`'s Ask turn, its origin."""
        self.conversation_of(owner, *participants)
        asked, reply = self.ask(asker, surface, [self.secret] if customers is None else customers)
        if surface == "brain":
            Message.objects.filter(pk=asked.pk).update(
                context={"surface": "brain", "scope": "me", "tab": "changed"}
            )
            asked.refresh_from_db()
        Conversation.objects.filter(pk=self.conversation.pk).update(
            origin=asked.context, title="Which renewals are at risk?"
        )
        return asked, reply

    def detail(self, user):
        return self.get(user, f"conversations/{self.conversation.pk}/")

    def listed(self, user):
        return next(c for c in self.get(user, "conversations/") if c["id"] == self.conversation.pk)

    def test_the_owner_is_not_shown_a_participants_origin(self):
        asked, _ = self.started_by(self.carl, self.raj, self.carl)

        for row in (self.detail(self.raj), self.listed(self.raj)):
            self.assertIsNone(row["origin"])
            self.assertEqual(row["title"], "Which renewals are at risk?")
        self.assertEqual(self.detail(self.carl)["origin"], asked.context)
        self.assertEqual(self.listed(self.carl)["origin"], asked.context)

    def test_a_participant_is_not_shown_the_owners_origin(self):
        asked, _ = self.started_by(self.carl, self.carl, self.raj)

        self.assertIsNone(self.detail(self.raj)["origin"])
        self.assertIsNone(self.listed(self.raj)["origin"])
        self.assertEqual(self.detail(self.carl)["origin"], asked.context)

    def test_a_reader_shown_the_first_reply_gets_the_origin_in_the_header_only(self):
        # Alice sees everything and reads every department: the reply is hers
        # to read, so the header keeps the origin; the list is the asker's.
        asked, _ = self.started_by(self.carl, self.raj, self.carl, self.alice)

        self.assertEqual(self.detail(self.alice)["origin"], asked.context)
        self.assertIsNone(self.listed(self.alice)["origin"])

    def test_a_shown_reply_keeps_its_questions_context(self):
        # Raj may open Raj Co: Carl's reply is shown to him, and so is the
        # context it was asked on, in the turn and in the header.
        asked, _ = self.started_by(self.carl, self.raj, self.carl, customers=[self.rajs])

        detail = self.detail(self.raj)
        question = next(m for m in detail["messages"] if m["id"] == asked.id)
        self.assertEqual(question["context"], asked.context)
        self.assertEqual(detail["origin"], asked.context)
        self.assertIsNone(self.listed(self.raj)["origin"])

    def test_a_view_all_reader_who_may_not_read_its_ticket_departments_gets_no_origin(self):
        asked, reply = self.started_by(self.carl, self.raj, self.carl, self.vera)
        Message.objects.filter(pk=reply.pk).update(
            grounded_tickets={"account_ids": [], "departments": ["engineering"]}
        )

        detail = self.detail(self.vera)
        self.assertIn(REDACTED_REPLY, [m["content"] for m in detail["messages"]])
        self.assertIsNone(detail["origin"])
        self.assertIsNone(self.listed(self.vera)["origin"])
        self.assertEqual(self.detail(self.carl)["origin"], asked.context)

    def test_a_view_all_reader_gets_no_origin_for_a_deleted_askers_turn(self):
        self.started_by(self.carl, self.raj, self.carl, self.vera)
        Message.objects.filter(role="user").update(author=None)

        self.assertIsNone(self.detail(self.vera)["origin"])
        self.assertIsNone(self.listed(self.vera)["origin"])

    def cost(self, user):
        with CaptureQueriesContext(connection) as ctx:
            rows = self.get(user, "conversations/")
        return len(ctx.captured_queries), rows

    def test_the_list_costs_the_same_however_many_rows(self):
        self.started_by(self.carl, self.raj, self.carl)
        self.started_by(self.carl, self.carl, self.raj)
        small, rows = self.cost(self.raj)
        self.assertEqual(len(rows), 2)
        for _ in range(4):
            self.started_by(self.carl, self.raj, self.carl)
            self.started_by(self.carl, self.carl, self.raj)
        large, rows = self.cost(self.raj)

        self.assertEqual(len(rows), 10)
        self.assertEqual([r["origin"] for r in rows], [None] * 10)
        self.assertEqual(small, large)
        # The user; the grants (3) and the reports for conversations_visible_to;
        # the page, its origin askers annotated on it; the page's grants again
        # (3) for who reads each row whole. Before the origin rule, 9 at 2
        # rows and 21 at 10: each participant row checked its own grant.
        self.assertEqual(large, LIST_QUERIES)

    def test_a_view_all_readers_list_of_brain_rows_started_by_others_is_flat(self):
        self.started_by(self.carl, self.alice, self.carl, surface="brain")
        small, rows = self.cost(self.alice)
        for _ in range(5):
            self.started_by(self.carl, self.alice, self.carl, surface="brain")
        large, rows = self.cost(self.alice)

        self.assertEqual(len(rows), 6)
        self.assertEqual([r["origin"] for r in rows], [None] * 6)
        self.assertEqual(small, large)
        # As above, but Alice holds no grant, so each grants read stops after
        # its first query (two fewer). No `visible_messages` per Brain row.
        self.assertEqual(large, LIST_QUERIES - 2)


#: The conversation list's cost for a reader of whole rows, at any size.
LIST_QUERIES = 9


class LegacyAndPendingTurnsTests(SharedConversationFixture):
    def test_a_legacy_reply_after_the_readers_question_is_still_checked(self):
        # No `reply_to` (written before migration 0011): the reply only sorts
        # after Raj's question; it may answer Carl's, so it is not Raj's own.
        self.conversation_of(self.raj, self.carl)
        Message.objects.create(
            conversation=self.conversation, role="user", content="Mine?", author=self.raj
        )
        Message.objects.create(
            conversation=self.conversation,
            role="assistant",
            content=ANSWER,
            sources=[self.ticket_on(self.secret_account)],
        )

        self.assertEqual(self.replies(self.raj), [REDACTED_REPLY])

    def test_a_pending_question_loses_its_context_for_a_whole_reader(self):
        self.conversation_of(self.raj, self.carl)
        asked = Message.objects.create(
            conversation=self.conversation,
            role="user",
            content="Which renewals are at risk?",
            author=self.carl,
            context={"surface": "dashboard", "view": "list", "filters": {}, "focus": None},
        )

        question = next(m for m in self.shown(self.raj) if m.id == asked.id)
        self.assertIsNone(question.context)
