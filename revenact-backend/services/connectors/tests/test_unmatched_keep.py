"""Round 2 D3 contract §2, R2D3-3, R2D3-5, R2D3-6: what an unmatched Slack
or Jira item keeps, and when it keeps nothing."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item, remote


class KeepTests(IntakeFixture):
    def setUp(self):
        self.jira = self.connector("jira", "cs")

    def test_an_item_is_kept_minimised(self):
        unmatched.keep(self.jira, remote(external_id="SUP-7", description="x" * 5000))
        row = UnmatchedItem.objects.get()
        self.assertEqual(
            (row.external_id, row.department, row.status, len(row.excerpt), row.requester_email),
            ("SUP-7", "cs", "waiting", unmatched.EXCERPT_CHARS, "ann@newco.io"),
        )

    def test_nothing_is_kept_for_other_providers(self):
        unmatched.keep(self.connector("zendesk", "cs"), remote())
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_nothing_is_kept_when_agents_do_not_read_the_source(self):
        self.org.ai_signal_sources = {"jira": False}
        self.org.save(update_fields=["ai_signal_sources"])
        self.jira.refresh_from_db()
        unmatched.keep(self.jira, remote())
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_nothing_is_kept_for_a_colleague_an_agents_issue_or_an_old_one(self):
        unmatched.keep(self.jira, remote(requester_email="dana@acme.io"))
        unmatched.keep(self.jira, remote(extra={"made_here": True}))
        old = (timezone.now() - timedelta(days=8)).isoformat()
        unmatched.keep(self.jira, remote(extra={"updated_at": old}))
        unmatched.keep(self.jira, remote(status="resolved"))
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_seen_again_it_is_updated_and_resolved_it_goes(self):
        unmatched.keep(self.jira, remote(external_id="SUP-8", title="Old"))
        unmatched.keep(self.jira, remote(external_id="SUP-8", title="New"))
        self.assertEqual(UnmatchedItem.objects.get().title, "New")
        unmatched.keep(self.jira, remote(external_id="SUP-8", status="closed"))
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_a_dismissed_item_is_never_listed_again(self):
        item(self.jira, external_id="SUP-9", status="dismissed", title="", excerpt="")
        unmatched.keep(self.jira, remote(external_id="SUP-9", title="Again"))
        row = UnmatchedItem.objects.get()
        self.assertEqual((row.status, row.title), ("dismissed", ""))

    def test_a_full_connector_keeps_no_more(self):
        for n in range(unmatched.MAX_WAITING_PER_CONNECTOR):
            item(self.jira, external_id=f"F-{n}")
        unmatched.keep(self.jira, remote(external_id="SUP-10"))
        self.assertFalse(UnmatchedItem.objects.filter(external_id="SUP-10").exists())

    def _meanwhile(self, act):
        """keep() read the row as waiting; `act` runs before it writes."""
        real = unmatched._keepable

        def keepable(*args):
            act()
            return real(*args)

        return patch("services.connectors.unmatched._keepable", side_effect=keepable)

    def test_a_dismiss_meanwhile_keeps_the_text_blank(self):
        unmatched.keep(self.jira, remote(external_id="SUP-11", title="Old"))
        blank = {"status": "dismissed", "title": "", "excerpt": "", "requester_email": ""}
        with self._meanwhile(lambda: UnmatchedItem.objects.update(**blank)):
            unmatched.keep(self.jira, remote(external_id="SUP-11", title="New"))
        row = UnmatchedItem.objects.get()
        self.assertEqual((row.status, row.title, row.requester_email), ("dismissed", "", ""))

    def test_a_match_meanwhile_is_not_an_error(self):
        unmatched.keep(self.jira, remote(external_id="SUP-12"))
        with self._meanwhile(lambda: UnmatchedItem.objects.all().delete()):
            unmatched.keep(self.jira, remote(external_id="SUP-12", title="New"))
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_a_dismissed_item_still_reported_is_not_purged(self):
        old = timezone.now() - timedelta(days=31)
        item(
            self.jira,
            external_id="SUP-13",
            status="dismissed",
            title="",
            excerpt="",
            requester_name="",
            requester_email="",
            last_seen_at=old,
        )
        unmatched.keep(self.jira, remote(external_id="SUP-13", title="Again"))
        unmatched.purge()
        row = UnmatchedItem.objects.get()
        self.assertEqual((row.status, row.title, row.requester_email), ("dismissed", "", ""))
        self.assertGreater(row.last_seen_at, old)

    def test_a_naive_or_invalid_updated_at_does_not_break_keep(self):
        naive = timezone.now().replace(tzinfo=None).isoformat()
        unmatched.keep(self.jira, remote(external_id="SUP-14", extra={"updated_at": naive}))
        unmatched.keep(
            self.jira, remote(external_id="SUP-15", extra={"updated_at": "2026-13-45T00:00:00"})
        )
        self.assertEqual(
            set(UnmatchedItem.objects.values_list("external_id", flat=True)),
            {"SUP-14", "SUP-15"},
        )


class SlackColleaguesTests(IntakeFixture):
    """SE1-9: a colleague's Slack message is the main case; Jira still drops it."""

    def setUp(self):
        self.slack = self.connector("slack", "cs")
        self.jira = self.connector("jira", "cs")

    def test_a_members_slack_message_is_kept_with_its_candidates(self):
        unmatched.keep(
            self.slack,
            remote(external_id="1792.1", number="#support", requester_email=self.csm.email),
            candidates=[{"type": "customer", "id": self.pizza.pk}],
        )
        row = UnmatchedItem.objects.get(connector=self.slack)
        self.assertEqual(row.candidates, [{"type": "customer", "id": self.pizza.pk}])
        self.assertEqual(row.number, "#support")

    def test_a_members_jira_issue_is_still_dropped(self):
        unmatched.keep(self.jira, remote(requester_email=self.csm.email))
        self.assertFalse(UnmatchedItem.objects.filter(connector=self.jira).exists())

    def test_a_later_pass_updates_the_candidates(self):
        unmatched.keep(self.slack, remote(external_id="1792.2"), candidates=[])
        unmatched.keep(
            self.slack,
            remote(external_id="1792.2"),
            candidates=[{"type": "customer", "id": self.pizza.pk}],
        )
        self.assertEqual(
            UnmatchedItem.objects.get(external_id="1792.2").candidates,
            [{"type": "customer", "id": self.pizza.pk}],
        )

    def test_at_most_five_candidates_are_kept(self):
        many = [{"type": "customer", "id": n} for n in range(1, 9)]
        unmatched.keep(self.slack, remote(external_id="1792.3"), candidates=many)
        self.assertEqual(UnmatchedItem.objects.get(external_id="1792.3").candidates, many[:5])
