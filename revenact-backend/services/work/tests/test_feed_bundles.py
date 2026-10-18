"""Mine's bundle rows (contract §4.3, §10.1, D9): one row per waiting bundle
on the reader's desk, the twice-filter, the 14-day rule, `approval` read as
`bundle`, and the badge counting bundles."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import AgentBundle
from services.work.feed_shape import CHOOSE_KIND
from services.work.tests.feed_fixtures import COUNT, FeedFixture


class FeedBundleTests(FeedFixture):
    def bundle(self, record, *titles):
        first = self.proposal(record, title=titles[0])
        for title in titles[1:]:
            self.proposal(record, title=title)
        return first.bundle

    def test_a_bundle_row(self):
        bundle = self.bundle(self.pizza, "Save play")
        body = self.body(self.csm)
        (row,) = self.group(body, "decide")["items"]
        self.assertEqual(
            {k: row[k] for k in ("key", "kind", "id", "title", "actions")},
            {
                "key": f"bundle:{bundle.pk}",
                "kind": "bundle",
                "id": bundle.pk,
                "title": "Save play",
                "actions": ["open"],
            },
        )
        self.assertEqual(
            row["record"],
            {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut", "can_open": True},
        )
        self.assertEqual(row["from"], {"type": "agent", "label": "Ops agent"})
        self.assertEqual(
            row["detail"],
            {
                "reason": "Because the figures say so.",
                "participant_view": False,
                "step_count": 1,
                "source": {"kind": "nightly", "label": "Nightly review", "channel": None},
                "routed_to": "owner",
                "department": None,
                "kinds": ["Create a task"],
                "can_run": True,
                # Guided agent: a nightly bundle is never guided, and normal.
                "priority": "normal",
                "guided": False,
            },
        )

    def test_the_twice_filter_and_hidden(self):
        self.bundle(self.pizza, "Mine")
        self.bundle(self.soup, "Not Carl's")
        body = self.body(self.csm)
        self.assertEqual([i["title"] for i in self.group(body, "decide")["items"]], ["Mine"])
        self.assertEqual(body["hidden"], 0)  # Soup Co is Mona's desk, not Carl's
        mona = self.body(self.mona)
        self.assertEqual([i["title"] for i in self.group(mona, "decide")["items"]], ["Not Carl's"])

    def test_a_bundle_the_reader_may_not_read_is_counted_never_named(self):
        # On Carl's own Pizza Hut, but its draft answers Mona's mail, which
        # Carl may not read (§8): counted in hidden, its title and record unnamed.
        from services.agents.tests.drafts_fixtures import draft_action, inbound, mailbox

        mailbox(self.mona)
        action = draft_action(self.org, inbound(self.pizza, self.mona))
        AgentBundle.objects.filter(pk=action.bundle_id).update(title="Offer the two-year deal")
        response = self.feed(self.csm)
        body = response.json()
        self.assertGreater(body["hidden"], 0)
        self.assertEqual(self.group(body, "decide")["items"], [])
        text = response.content.decode()
        for name in ("Offer the two-year deal", "Pizza Hut", "Ann Lee", "Reply to Ann Lee"):
            self.assertNotIn(name, text)

    def test_a_bundle_14_days_old_is_neither_shown_nor_counted(self):
        bundle = self.bundle(self.pizza, "Old")
        AgentBundle.objects.filter(pk=bundle.pk).update(
            created_at=timezone.now() - timedelta(days=14)
        )
        self.assertEqual(self.group(self.body(self.csm), "decide")["items"], [])
        self.assertEqual(self.as_user(self.fresh(self.csm)).get(COUNT).json()["decide"], 0)

    def test_approval_is_read_as_bundle(self):
        self.bundle(self.pizza, "Save play")
        for kind in ("approval", "bundle"):
            with self.subTest(kind=kind):
                items = self.group(self.body(self.csm, kind=kind), "decide")["items"]
                self.assertEqual([i["kind"] for i in items], ["bundle"])
        response = self.feed(self.csm, kind="approvals")
        self.assertEqual(
            response.json(),
            {"kind": [CHOOSE_KIND]},
        )

    def test_the_badge_counts_bundles_not_steps(self):
        first = self.proposal(self.pizza, title="One")
        self.proposal(self.pizza, title="Two")  # its own bundle of one
        from services.metrics.models import AgentAction

        AgentAction.objects.filter(title="Two").update(bundle=first.bundle, position=2)
        AgentBundle.objects.filter(steps__isnull=True).delete()
        self.assertEqual(self.as_user(self.fresh(self.csm)).get(COUNT).json()["decide"], 1)

    def fresh(self, user):
        from services.accounts.models import User

        return User.objects.get(pk=user.pk)
