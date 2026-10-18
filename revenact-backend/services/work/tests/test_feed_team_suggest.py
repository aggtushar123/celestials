"""The Team queue's suggestions (delivery 2 contract §1.4, Decision D5):
the four live kinds the reader may decide, recipient in scope and not the
reader, on records they may open; newest first; Assign and Dismiss only."""

from django.utils import timezone

from services.accounts.models import User
from services.work.feed_team_suggest import TeamSuggestions
from services.work.models import Recommendation
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamSuggestionTests(FeedFixture):
    def source(self, user, key="team"):
        reader = User.objects.get(pk=user.pk)
        return TeamSuggestions(reader, self.today, resolve_team(reader, key))

    def items(self, source):
        return [entry for _key, entry in source.page(None, 51)]

    def test_a_reports_suggestion_is_listed_for_its_recipient(self):
        rec = self.suggestion(self.csm, self.pizza)
        (item,) = self.items(self.source(self.mona))
        self.assertEqual((item["key"], item["kind"]), (f"recommendation:{rec.pk}", "suggestion"))
        self.assertEqual(item["actions"], ["assign", "dismiss"])
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_the_readers_own_and_retired_kinds_stay_out(self):
        self.suggestion(self.mona, self.soup)
        self.suggestion(self.csm, self.pizza, kind="overdue_tasks")
        self.suggestion(self.csm, self.dough, kind="open_questions")
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 0))

    def test_one_the_reader_may_not_decide_is_neither_listed_nor_counted(self):
        self.suggestion(self.other, self.taco)  # Dana's: not below Mona
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 0))

    def test_company_lists_everyone_elses_for_view_all(self):
        dana = self.suggestion(self.other, self.taco)
        carl = self.suggestion(self.csm, self.pizza)
        ids = {item["id"] for item in self.items(self.source(self.admin, "company"))}
        self.assertEqual(ids, {dana.pk, carl.pk})

    def test_a_decidable_one_on_a_record_the_reader_cannot_open_is_hidden(self):
        self.suggestion(self.csm, self.west)
        source = self.source(self.mona)
        self.assertEqual((source.count(), source.hidden()), (0, 1))

    def test_newest_first_and_a_same_time_tie_breaks_by_id(self):
        first = self.suggestion(self.csm, self.pizza)
        second = self.suggestion(self.csm, self.dough)
        stamp = timezone.now()
        Recommendation.objects.filter(pk__in=[first.pk, second.pk]).update(created_at=stamp)
        source = self.source(self.mona)
        self.assertEqual([i["id"] for i in self.items(source)], [second.pk, first.pk])
        (position, _item) = source.page(None, 1)[0]
        self.assertEqual([i["id"] for _k, i in source.page(position, 51)], [first.pk])
