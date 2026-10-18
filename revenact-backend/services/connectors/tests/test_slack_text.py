"""Slack's message markup read as the person saw it (Send to Revenact,
2026-10-16 live test: the Work item showed ":wave: Hi <@U0C9D7CCLQJ>")."""

from django.test import SimpleTestCase

from services.connectors.slack_text import MAX_LOOKUPS, mentioned, named, readable, unnamed

NAMES = {"U0CARL": "Carl Lee", "U0ANN": "Ann Lee"}


def name_of(user_id):
    return NAMES.get(user_id, "")


class ReadableTests(SimpleTestCase):
    def test_people_are_named(self):
        self.assertEqual(
            readable("Hi <@U0CARL>, ask <@U0ANN>", name_of), "Hi @Carl Lee, ask @Ann Lee"
        )

    def test_a_person_slack_did_not_name_keeps_the_label_or_reads_someone(self):
        self.assertEqual(readable("<@U0NOPE|bob> and <@U0NOPE>", name_of), "@bob and @someone")

    def test_channels_groups_and_broadcasts(self):
        self.assertEqual(
            readable("<#C0SUP|support> <#C0X> <!here> <!channel> <!subteam^S01|@eng>", name_of),
            "#support #channel @here @channel @eng",
        )

    def test_dates_read_their_fallback(self):
        self.assertEqual(readable("due <!date^1792147103^{date}|16 Oct>", name_of), "due 16 Oct")

    def test_links_keep_their_address(self):
        self.assertEqual(
            readable(
                "see <https://x.com/a|the doc>, <https://x.com/b> or <mailto:a@b.com|a@b.com>",
                name_of,
            ),
            "see the doc (https://x.com/a), https://x.com/b or a@b.com",
        )

    def test_slack_escapes_are_undone_last(self):
        self.assertEqual(readable("a &lt;b&gt; &amp; c &amp;lt;", name_of), "a <b> & c &lt;")

    def test_common_emoji_become_emoji_and_unknown_ones_stay(self):
        self.assertEqual(
            readable(":wave: hi :+1: :thumbsup::skin-tone-3: :fire: :not_an_emoji:", name_of),
            "👋 hi 👍 👍 🔥 :not_an_emoji:",
        )

    def test_times_and_plain_colons_are_left_alone(self):
        self.assertEqual(readable("at 10:30: done", name_of), "at 10:30: done")

    def test_mentioned_lists_each_person_once_up_to_the_cap(self):
        many = " ".join(f"<@U{n:04d}>" for n in range(MAX_LOOKUPS + 5))
        self.assertEqual(mentioned("<@U0CARL> <@U0CARL|carl> <@U0ANN>"), ["U0CARL", "U0ANN"])
        self.assertEqual(len(mentioned(many)), MAX_LOOKUPS)


PEOPLE = {"U0FAIZ": {"name": "Faiz Jamal", "member": 11}, "U0NONAME": {"name": ""}}


class NamedTests(SimpleTestCase):
    """CC-14: a stored thread's mentions read by the people it names."""

    def test_known_people_are_named_and_unknown_ones_stay_raw(self):
        self.assertEqual(
            named("<@U0FAIZ> take this? cc <@U0NONAME> <@U0WHO|who>", PEOPLE),
            "@Faiz Jamal take this? cc <@U0NONAME> <@U0WHO|who>",
        )
        self.assertEqual(named("", PEOPLE), "")
        self.assertEqual(named("<@U0FAIZ>", None), "<@U0FAIZ>")

    def test_unnamed_reads_the_names_back_as_mentions(self):
        self.assertEqual(
            unnamed("@faiz jamal can you take this?", PEOPLE), "<@U0FAIZ> can you take this?"
        )
        self.assertEqual(unnamed("@Faiz is on it", PEOPLE), "@Faiz is on it")
