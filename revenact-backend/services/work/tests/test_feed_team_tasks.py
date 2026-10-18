"""The Team queue's overdue group (delivery 2 contract §1.4): open tasks
with a record, past due and not Blocked, assigned to the scope's people
other than the reader, that the reader may read. Read-only (Decision D4);
to-dos never, not even counted."""

from services.accounts.models import User
from services.work.feed_team_tasks import TeamOverdue
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamOverdueTests(FeedFixture):
    def source(self, user, key="team"):
        reader = User.objects.get(pk=user.pk)
        return TeamOverdue(reader, resolve_team(reader, key), self.today)

    def test_a_reports_overdue_task_is_listed_read_only_for_its_assignee(self):
        late = self.due(self.csm, self.pizza, due_in=-2, title="Chase the sponsor")
        (key, item) = self.source(self.mona).page(None, 51)[0]
        self.assertEqual((item["key"], item["kind"]), (f"task:{late.pk}", "task"))
        self.assertEqual(item["actions"], ["open"])
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(item["due_date"], late.due_date.isoformat())
        self.assertEqual(len(key), 4)

    def test_only_overdue_and_not_blocked(self):
        self.due(self.csm, self.pizza, due_in=0, title="Today")
        self.due(self.csm, self.pizza, due_in=3, title="Soon")
        self.due(self.csm, self.pizza, due_in=-1, status="blocked", reason="Legal", title="Stuck")
        late = self.due(self.csm, self.pizza, due_in=-1, title="Late")
        source = self.source(self.mona)
        self.assertEqual([item["id"] for _k, item in source.page(None, 51)], [late.pk])
        self.assertEqual(source.count(), 1)

    def test_the_readers_own_and_to_dos_never_count(self):
        self.due(self.mona, self.soup, due_in=-1, title="Mona's own")
        self.todo(self.csm, due_in=-3, title="Renew my passport")
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 0))
        admin = self.source(self.admin, "company")
        self.assertNotIn("Renew my passport", [item["title"] for _k, item in admin.page(None, 51)])
        self.assertEqual(admin.hidden(), 0)

    def test_a_task_on_a_record_the_reader_cannot_open_is_hidden(self):
        self.due(self.csm, self.west, due_in=-1, title="West handover")
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 1))
        self.assertEqual(source.page(None, 51), [])

    def test_order_is_due_date_then_priority(self):
        older = self.due(self.csm, self.pizza, due_in=-3, priority="low", title="A")
        high = self.due(self.csm, self.dough, due_in=-1, priority="high", title="B")
        low = self.due(self.csm, self.pizza, due_in=-1, priority="low", title="C")
        ids = [item["id"] for _k, item in self.source(self.mona).page(None, 51)]
        self.assertEqual(ids, [older.pk, high.pk, low.pk])

    def test_paging_after_a_position(self):
        first = self.due(self.csm, self.pizza, due_in=-2, title="First")
        second = self.due(self.csm, self.pizza, due_in=-1, title="Second")
        source = self.source(self.mona)
        (position, item) = source.page(None, 1)[0]
        self.assertEqual(item["id"], first.pk)
        self.assertEqual([i["id"] for _k, i in source.page(position, 51)], [second.pk])
