"""Slack escalations D4, SE4-22 to SE4-25 (spec §5.2, §5.3): the decision
the model found is kept only when the thread says it, a bare mention is no
decision, the named person is resolved by mention, then by name, and the
thread's participants are its members who wrote in it. No query: the
context's members stand in for the workspace."""

from types import SimpleNamespace

from django.test import SimpleTestCase

from services.agents import decision

TOP = {
    "ts": "1.000100",
    "user_id": "U0CARL",
    "name": "Carl Lee",
    "text": "Pizza Hut exports fail",
    "bot": False,
}
ASK = {
    "ts": "2.000100",
    "user_id": "U0JESH",
    "name": "Jesh Sanghvi",
    "text": "<@U0FAIZ> can you take this?",
    "bot": False,
}
BOT = {"ts": "3.000100", "user_id": "", "name": "revenact", "text": "Faiz has it.", "bot": True}
PEOPLE = {
    "U0CARL": {"name": "Carl Lee", "member": 2},
    "U0JESH": {"name": "Jesh Sanghvi", "member": 12},
    "U0FAIZ": {"name": "Faiz Jamal", "member": 11},
    "U0GUEST": {"name": "Gus Guest", "member": None},
}
MEMBERS = {
    2: {"id": 2, "name": "Carl Lee"},
    11: {"id": 11, "name": "Faiz Jamal"},
    12: {"id": 12, "name": "Jesh Sanghvi"},
    13: {"id": 13, "name": "Faiz Khan"},
    14: {"id": 14, "name": "Ola Eng"},
}


class Ctx:
    """The parts of evidence.Context the decision reads."""

    def __init__(self, messages, people=PEOPLE, members=MEMBERS, first=1):
        self.members = members
        self.thread_slack = {"messages": messages, "first": first, "people": people}

    def member(self, pk):
        row = self.members.get(pk)
        return SimpleNamespace(pk=pk, name=row["name"]) if row else None


def answer(message=2, quote="<@U0FAIZ> can you take this?", assignee="<@U0FAIZ>"):
    return SimpleNamespace(decision={"message": message, "quote": quote, "assignee": assignee})


class BareMentionTests(SimpleTestCase):
    def test_a_bare_mention_is_no_decision(self):
        for quote in (
            "<@U0FAIZ>",
            "cc <@U0FAIZ>",
            "<@U0FAIZ> fyi",
            "+1 <@U0FAIZ>",
            "heads up <@U0FAIZ>!",
            "@Faiz",
        ):
            with self.subTest(quote=quote):
                self.assertTrue(decision.bare(quote))

    def test_a_request_a_statement_or_a_proposal_is(self):
        for quote in (
            "<@U0FAIZ> can you take this?",
            "<@U0FAIZ> will handle it",
            "let's give this to Faiz",
            "Faiz is on it",
            "I'll take it",
        ):
            with self.subTest(quote=quote):
                self.assertFalse(decision.bare(quote))


class ReadTests(SimpleTestCase):
    def test_a_mention_resolves_through_the_thread_s_people(self):
        found = decision.read(answer(), Ctx([TOP, ASK]))
        self.assertEqual(
            (found.user.pk, found.by.pk, found.named, found.quote, found.ts),
            (11, 12, "Faiz Jamal", "@Faiz Jamal can you take this?", "2.000100"),
        )

    def test_a_quote_of_the_named_line_is_read_as_the_mention(self):
        """CC-14: the model reads "@Faiz Jamal"; its quote is checked against
        the stored text with the name read back as the mention."""
        found = decision.read(
            answer(quote="@Faiz Jamal can you take this?", assignee="@Faiz Jamal"),
            Ctx([TOP, ASK]),
        )
        self.assertEqual(
            (found.user.pk, found.by.pk, found.quote),
            (11, 12, "@Faiz Jamal can you take this?"),
        )
        cc = {**ASK, "text": "cc <@U0FAIZ>"}
        self.assertIsNone(decision.read(answer(quote="cc @Faiz Jamal"), Ctx([TOP, cc])))

    def test_the_quote_must_be_in_that_message(self):
        self.assertIsNone(decision.read(answer(quote="Faiz, please own it"), Ctx([TOP, ASK])))
        self.assertIsNone(decision.read(answer(message=1), Ctx([TOP, ASK])))

    def test_the_quote_is_read_ignoring_case_and_spacing(self):
        found = decision.read(answer(quote="<@U0FAIZ>   CAN you take this"), Ctx([TOP, ASK]))
        self.assertEqual(found.quote, "@Faiz Jamal CAN you take this")

    def test_no_such_message_or_a_bot_s_message_is_no_decision(self):
        self.assertIsNone(decision.read(answer(message=9), Ctx([TOP, ASK])))
        bot = {**BOT, "text": "<@U0FAIZ> can you take this?"}
        self.assertIsNone(decision.read(answer(message=3), Ctx([TOP, ASK, bot])))
        ours = {**ASK, "via_app": True}
        self.assertIsNone(decision.read(answer(), Ctx([TOP, ours])))

    def test_the_author_must_be_a_member(self):
        guest = {**ASK, "user_id": "U0GUEST", "name": "Gus Guest"}
        self.assertIsNone(decision.read(answer(), Ctx([TOP, guest])))

    def test_a_bare_mention_the_model_gave_is_dropped(self):
        cc = {**ASK, "text": "cc <@U0FAIZ>"}
        self.assertIsNone(decision.read(answer(quote="cc <@U0FAIZ>"), Ctx([TOP, cc])))

    def test_message_numbers_count_from_the_first_shown(self):
        found = decision.read(answer(message=42), Ctx([TOP, ASK], first=41))
        self.assertEqual(found.user.pk, 11)

    def test_a_long_quote_cut_to_200_characters_is_still_in_the_message(self):
        # prompt._decision cuts the quote to 200 characters: a prefix of the
        # words is still in the message, so the decision is kept.
        words = "<@U0FAIZ> can you take this? " + "The export breaks on every run. " * 10
        long = {**ASK, "text": words}
        quote = " ".join(words.split())[:200]
        self.assertGreater(len(words), 200)
        found = decision.read(answer(quote=quote), Ctx([TOP, long]))
        self.assertEqual(found.user.pk, 11)
        self.assertLessEqual(len(found.quote), decision.QUOTE_CHARS)
        self.assertTrue(found.quote.startswith("@Faiz Jamal can you take this?"))

    def test_a_dropped_decision_logs_a_code_never_its_text(self):
        with self.assertLogs("services.agents.decision", level="INFO") as logs:
            decision.read(answer(quote="Faiz, please own it"), Ctx([TOP, ASK]))
        self.assertEqual(len(logs.output), 1)
        self.assertIn("quote_not_in_message", logs.output[0])
        self.assertNotIn("Faiz", logs.output[0])

    def test_no_decision_in_the_answer(self):
        self.assertIsNone(decision.read(SimpleNamespace(decision=None), Ctx([TOP, ASK])))


class ResolveTests(SimpleTestCase):
    def test_a_plain_first_name_among_the_thread_s_people(self):
        # Two members are called Faiz; only one is in the thread.
        user, named = decision.resolve("Faiz", Ctx([TOP, ASK]), PEOPLE)
        self.assertEqual((user.pk, named), (11, "Faiz"))

    def test_a_full_name_in_the_workspace(self):
        user, _ = decision.resolve("Ola Eng", Ctx([TOP]), {})
        self.assertEqual(user.pk, 14)

    def test_a_first_name_two_members_share_is_nobody(self):
        self.assertEqual(decision.resolve("Faiz", Ctx([TOP]), {})[0], None)

    def test_a_mention_of_someone_with_no_member_is_nobody(self):
        user, named = decision.resolve("<@U0GUEST>", Ctx([TOP]), PEOPLE)
        self.assertEqual((user, named), (None, "Gus Guest"))

    def test_an_unknown_mention_keeps_what_was_written(self):
        self.assertEqual(decision.resolve("<@U0NEW>", Ctx([TOP]), PEOPLE), (None, "<@U0NEW>"))

    def test_a_name_matching_only_a_thread_guest_is_nobody(self):
        # SE4-24 (2): a thread person is resolved as in (1), so a Slack Connect
        # guest called Faiz is nobody, even with exactly one member Faiz.
        people = {"U0EXT": {"name": "Faiz Contractor", "member": None}}
        members = {11: MEMBERS[11], 14: MEMBERS[14]}
        ctx = Ctx([TOP], people=people, members=members)
        self.assertEqual(decision.resolve("Faiz", ctx, people), (None, "Faiz"))

    def test_two_thread_people_one_a_guest_is_nobody(self):
        people = {**PEOPLE, "U0EXT": {"name": "Faiz Contractor", "member": None}}
        self.assertEqual(decision.resolve("Faiz", Ctx([TOP]), people), (None, "Faiz"))

    def test_two_members_sharing_a_full_name_is_nobody(self):
        members = {**MEMBERS, 15: {"id": 15, "name": "Ola Eng"}}
        ctx = Ctx([TOP], members=members)
        self.assertEqual(decision.resolve("Ola Eng", ctx, {}), (None, "Ola Eng"))

    def test_a_leading_at_sign_is_ignored(self):
        self.assertEqual(decision.resolve("@Ola Eng", Ctx([TOP]), {})[0].pk, 14)


class ParticipantTests(SimpleTestCase):
    def test_members_who_wrote_in_the_thread_once_each(self):
        again = {**ASK, "ts": "4.000100", "text": "any news?"}
        ours = {**TOP, "ts": "5.000100", "via_app": True}
        guest = {**ASK, "ts": "6.000100", "user_id": "U0GUEST"}
        ctx = Ctx([TOP, ASK, BOT, again, ours, guest])
        self.assertEqual(decision.participants(ctx), [2, 12])

    def test_a_boolean_member_is_not_one(self):
        people = {**PEOPLE, "U0JESH": {"name": "Jesh Sanghvi", "member": True}}
        ctx = Ctx([TOP, ASK], people=people, members={1: {"id": 1, "name": "One"}, 2: MEMBERS[2]})
        self.assertEqual(decision.participants(ctx), [2])

    def test_a_member_who_left_is_not_one(self):
        ctx = Ctx([TOP, ASK], members={12: MEMBERS[12]})
        self.assertEqual(decision.participants(ctx), [12])
