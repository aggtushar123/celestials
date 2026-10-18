"""Who reads a Brain answer in a shared conversation (spec decision 2): its
asker, and a reader of the same organisation who sees everything and reads
every ticket department. Anyone else is shown the question with the answer
withheld, even when they can open every customer named, because a Brain
answer is an aggregate over the asker's scope: its open-ticket counts follow
the asker's ticket rules, and the account names and legacy-brief customers
it can quote are not in `customer_ids`."""

from services.accounts.models import User
from services.copilot.ask import SURFACES, AskContextSerializer
from services.copilot.context import Grounding
from services.copilot.models import Conversation, Message
from services.copilot.views import (
    REDACTED_REPLY,
    _reply_readable_by,
    ask_snapshot,
    pipeline_snapshot,
    records_snapshot,
    tickets_snapshot,
    visible_messages,
)
from services.customers.scoping import sees_everything, visible_customers
from services.segments.tests.fixtures import person

from .brain_fixture import BrainAskFixture


class BrainSharingTests(BrainAskFixture):
    def setUp(self):
        self.task(self.csm, customer=self.pizza)
        # A view_all admin outside Leadership: the ticket department rule
        # binds them, so a Brain answer is withheld from them. In Carl's
        # function, so a shared conversation shows them his turns.
        self.vic = person("vic@acme.io", "Vic Viewall", self.org, role=User.Role.ADMIN)
        self.conversation = Conversation.objects.create(
            organisation=self.org, user=self.csm, title="Ask on the Brain"
        )

    def validated(self, author, scope="me", tab="waiting"):
        checked = AskContextSerializer(data=self.ask_context(scope, tab), context={"user": author})
        self.assertTrue(checked.is_valid(), checked.errors)
        return checked.validated_data

    def store(self, author, ask, grounding, fed=(), question="What should I decide first?"):
        """The two turns SendMessageView writes, with the snapshots it fixes."""
        fed = list(fed)
        asked = Message.objects.create(
            conversation=self.conversation,
            role="user",
            content=question,
            author=author,
            context=ask,
        )
        grounded, carries = ask_snapshot(author, ask, grounding, fed)
        reply = Message.objects.create(
            conversation=self.conversation,
            role="assistant",
            content="Decide the overdue call first.",
            sources=grounding.sources,
            grounded_customer_ids=grounded,
            carries_anomaly_text=carries,
            grounded_pipeline=pipeline_snapshot(ask, grounding, fed),
            grounded_tickets=tickets_snapshot(ask, grounding, fed),
            grounded_records=records_snapshot(ask, grounding, fed),
            reply_to=asked,
        )
        return asked, reply

    def ask_brain(self, author=None, scope="me", tab="waiting"):
        author = author or self.csm
        ask = self.validated(author, scope, tab)
        return self.store(author, ask, SURFACES["brain"].ground(author, ask, "What first?"))

    def readable(self, pair, user):
        asked, reply = pair
        return _reply_readable_by(reply, User.objects.get(pk=user.pk), asked)

    def test_the_asker_reads_it(self):
        self.assertTrue(self.readable(self.ask_brain(), self.csm))

    def test_a_view_all_reader_who_reads_every_department_reads_it(self):
        self.assertTrue(sees_everything(self.admin))
        self.assertEqual(self.admin.function, User.Function.LEADERSHIP)

        self.assertTrue(self.readable(self.ask_brain(), self.admin))

    def test_a_view_all_reader_who_cannot_read_every_department_gets_the_redaction(self):
        pair = self.ask_brain()
        self.assertTrue(sees_everything(self.vic))
        # The reply's own ticket snapshot is empty: it is the Brain rule,
        # not the snapshot, that withholds it.
        self.assertEqual(pair[1].grounded_tickets, {"account_ids": [], "departments": []})

        self.assertFalse(self.readable(pair, self.vic))
        shown = visible_messages(self.conversation, User.objects.get(pk=self.vic.pk))
        self.assertEqual([m.content for m in shown if m.role == "assistant"], [REDACTED_REPLY])

    def test_a_teammate_who_can_open_every_customer_named_is_withheld(self):
        pair = self.ask_brain()

        named = set(pair[1].grounded_customer_ids)
        self.assertEqual(named, {self.pizza.pk})
        openable = set(
            visible_customers(self.mona).filter(pk__in=named).values_list("pk", flat=True)
        )
        self.assertEqual(openable, named)
        self.assertFalse(self.readable(pair, self.mona))

    def test_a_company_reader_without_view_all_is_withheld(self):
        self.assertFalse(self.readable(self.ask_brain(), self.lee))
        self.assertFalse(self.readable(self.ask_brain(self.lee, "company", "changed"), self.mona))

    def test_another_organisations_reader_is_refused(self):
        gina = person(
            "gina@globex.io",
            "Gina Globex",
            self.other_org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )
        self.assertTrue(sees_everything(gina))

        self.assertFalse(self.readable(self.ask_brain(), gina))

    def test_a_malformed_brain_context_fails_closed(self):
        asked, reply = self.ask_brain()
        for context in (
            {"surface": "brain"},
            {"surface": "brain", "scope": "everyone", "tab": "waiting"},
            {"surface": "brain", "scope": "me", "tab": "graph"},
            {"surface": "brain", "scope": ["me"], "tab": "waiting"},
            {"surface": "brain", "scope": "me", "tab": "waiting", "filters": {"owner": "1"}},
            "brain",
        ):
            with self.subTest(context=context):
                Message.objects.filter(pk=asked.pk).update(context=context)
                asked.refresh_from_db()
                self.assertFalse(self.readable((asked, reply), self.admin))

    def test_every_other_rule_still_applies_to_a_reader_the_brain_rule_lets_through(self):
        asked, reply = self.ask_brain()
        for field, value in (
            ("grounded_customer_ids", None),
            ("grounded_records", {"unknown": True}),
        ):
            with self.subTest(field=field):
                stored = getattr(reply, field)
                Message.objects.filter(pk=reply.pk).update(**{field: value})
                reply.refresh_from_db()
                self.assertFalse(self.readable((asked, reply), self.admin))
                Message.objects.filter(pk=reply.pk).update(**{field: stored})
                reply.refresh_from_db()

    def test_the_anomaly_flag_records_whether_the_asker_saw_everything(self):
        self.assertIs(self.ask_brain(self.csm)[1].carries_anomaly_text, False)
        self.assertIs(
            self.ask_brain(self.admin, "company", "customers")[1].carries_anomaly_text, True
        )

    def test_a_reply_fed_a_brain_answer_is_withheld_from_every_checked_reader(self):
        fed = self.ask_brain()
        dashboard = {
            "surface": "dashboard",
            "area": "health",
            "view": "triage",
            "filters": {"owner": "", "lifecycle": "", "customer": ""},
            "focus": None,
        }
        self.assertEqual(ask_snapshot(self.csm, None, Grounding("x"), list(fed)), (None, True))
        self.assertEqual(
            ask_snapshot(self.csm, dashboard, Grounding("x", customer_ids=[]), list(fed)),
            (None, True),
        )

        follow_up = self.store(self.csm, None, Grounding("x"), fed, "Summarise the above.")

        self.assertIsNone(follow_up[1].grounded_customer_ids)
        for reader in (self.admin, self.vic, self.mona):
            with self.subTest(reader=reader.name):
                self.assertFalse(self.readable(follow_up, reader))

    def test_a_brain_send_fed_a_brain_answer_folds_it_in(self):
        fed = self.ask_brain()
        ask = self.validated(self.csm, "me", "customers")
        grounding = SURFACES["brain"].ground(self.csm, ask, "And customers?")

        grounded, _carries = ask_snapshot(self.csm, ask, grounding, list(fed))

        self.assertEqual(grounded, [self.pizza.pk])
        pair = self.store(self.csm, ask, grounding, fed, "And customers?")
        self.assertTrue(self.readable(pair, self.admin))
        self.assertFalse(self.readable(pair, self.vic))
        self.assertFalse(self.readable(pair, self.mona))
