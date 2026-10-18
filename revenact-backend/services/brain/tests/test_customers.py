"""What customers are saying, section by section (Brain delivery 4 spec
§1.3): asks and anomalies are the top of the scoped lists; scores are
recomputed from the answers on the scope's book that the reader may open."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.brain import customers
from services.brain.tests.customers_fixtures import CustomersFixture
from services.customers.models import Contact
from services.surveys.models import SurveyInvite


class AsksAndAnomaliesTests(CustomersFixture):
    def setUp(self):
        # emea (Carl's, under his own Pizza Hut), not east (under Dana's
        # Taco Bell): east's evidence would also land in Dana's book,
        # through brain.book's "an account under the book's customers"
        # reach, which would put this ask in her section too — this
        # fixture keeps it to Carl's and Mona's books only, as
        # test_nothing_in_the_book_is_an_empty_section below assumes.
        self.sso = self.feature("SSO with Okta", self.pizza, self.emea, self.soup)
        for i in range(6):
            self.feature(f"Ask {i}", self.dough)
        self.outage = self.anomaly("Login fails at Pizza Hut", self.pizza, self.soup)

    def test_asks_are_the_top_five_of_the_scoped_list_with_the_total(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        asks = customers.asks(reader, scope)
        self.assertEqual(asks["total"], 7)
        self.assertEqual(len(asks["top"]), 5)
        self.assertEqual(
            asks["top"][0],
            {
                "id": self.sso.id,
                "title": "SSO with Okta",
                "status": "open",
                "arr": 350000.0,
                "companies": 2,
                "last_90_days": 3,
                "previous_90_days": 0,
            },
        )

    def test_in_me_the_ask_counts_only_the_readers_book(self):
        reader, scope = self.reader_and_scope(self.csm, "me")
        top = customers.asks(reader, scope)["top"]
        sso = next(row for row in top if row["id"] == self.sso.id)
        self.assertEqual((sso["arr"], sso["companies"]), (300000.0, 1))

    def test_anomalies_keep_the_title_gate(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        anomalies = customers.anomalies(reader, scope)
        self.assertEqual(anomalies["total"], 1)
        (row,) = anomalies["top"]
        self.assertEqual(set(row), {"id", "title", "status", "arr", "companies", "last_seen_at"})
        self.assertEqual(row["title"], "Similar reports across 2 of your companies")
        self.assertEqual((row["arr"], row["status"]), (350000.0, "live"))
        reader, scope = self.reader_and_scope(self.admin, "company")
        (row,) = customers.anomalies(reader, scope)["top"]
        self.assertEqual(row["title"], "Login fails at Pizza Hut")

    def test_nothing_in_the_book_is_an_empty_section(self):
        reader, scope = self.reader_and_scope(self.other, "me")
        self.assertEqual(customers.asks(reader, scope), {"total": 0, "top": []})
        self.assertEqual(customers.anomalies(reader, scope), {"total": 0, "top": []})


class ScoresTests(CustomersFixture):
    def setUp(self):
        self.nps = self.send("nps")
        self.answers(self.nps, self.pizza, [10, 10, 9, 3])
        self.answer(self.nps, self.emea, 7)
        self.answers(self.nps, self.pizza, [10, 2, 2, 2], days_ago=120)
        self.answer(self.nps, self.taco, 0)  # Dana's: not in Carl's book
        self.csat = self.send("csat")
        self.answers(self.csat, self.dough, [5, 5, 4, 4, 2])
        self.answers(self.csat, self.dough, [5, 5, 1, 1, 1], days_ago=100)
        self.ces = self.send("ces")
        self.answer(self.ces, self.pizza, 6)
        self.answer(self.ces, self.emea, 7)  # an account's CES: not counted

    def scores(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return customers.scores(reader, scope, self.today)

    def test_figures_over_the_scope_now_and_then(self):
        scores = self.scores(self.csm, "me")
        # NPS now: 10, 10, 9, 3 on Pizza Hut and 7 on Pizza EMEA: 3 promoters,
        # 1 detractor in 5 = 40. Then: 4 answers, under 5, so no figure.
        self.assertEqual(
            scores["nps"], {"now": 40, "then": None, "responses": 5, "previous_responses": 4}
        )
        self.assertEqual(
            scores["csat"], {"now": 80.0, "then": 40.0, "responses": 5, "previous_responses": 5}
        )
        self.assertEqual(
            scores["ces"], {"now": None, "then": None, "responses": 1, "previous_responses": 0}
        )

    def test_my_team_adds_the_reports_book(self):
        self.answer(self.nps, self.soup, 10)
        # 4 promoters, 1 detractor in 6 = 50
        self.assertEqual(self.scores(self.mona, "team")["nps"]["now"], 50)
        self.assertEqual(self.scores(self.csm, "me")["nps"]["now"], 40)

    def test_a_send_the_reader_cant_read_is_not_counted(self):
        private = self.send("nps", owner=self.other, sharing="private")
        self.answers(private, self.pizza, [0, 0, 0, 0, 0])
        self.assertEqual(self.scores(self.csm, "me")["nps"]["responses"], 5)

    def test_comments_newest_first_at_most_five(self):
        for days in range(1, 8):
            self.answer(self.nps, self.pizza, 4, days_ago=days, comment=f"Day {days}")
        scores = self.scores(self.csm, "me")
        self.assertEqual(
            [c["comment"] for c in scores["comments"]],
            ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"],
        )
        first = scores["comments"][0]
        self.assertEqual(
            (first["survey_type"], first["score"], first["record"]),
            ("nps", 4, {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}),
        )
        self.assertIn("answered_at", first)
        self.assertEqual(scores["hidden"], 0)

    def test_comments_name_only_records_the_reader_may_open(self):
        self.answer(self.nps, self.pizza, 4, comment="Support is slow lately.", days_ago=2)
        self.answer(self.nps, self.loose, 9, comment="Lovely team.")
        self.answer(self.nps, self.pizza, 8, comment="Old news.", days_ago=120)
        scores = self.scores(self.lee, "company")
        self.assertEqual([c["comment"] for c in scores["comments"]], ["Lovely team."])
        self.assertEqual(
            scores["comments"][0]["record"],
            {"type": "customer", "id": self.loose.id, "name": "Loose Ltd"},
        )
        # Pizza Hut's comment is counted, never named; the old one is outside the window.
        self.assertEqual(scores["hidden"], 1)
        # Lee's figures count only answers on what he may open: Loose Ltd's.
        self.assertEqual(scores["nps"]["responses"], 1)


class ScoreWindowBoundaryTests(CustomersFixture):
    """Score windows are day-aligned (Decision 4): "now" is answers since
    the start of today - 90 days; "then" the 90 days before that."""

    def test_the_windows_start_midnight_is_in_now_one_second_earlier_is_in_then(self):
        nps = self.send("nps")
        start = customers.day_start(self.today - timedelta(days=90))
        at_start = self.answer(nps, self.pizza, 7)
        SurveyInvite.objects.filter(pk=at_start.pk).update(answered_at=start)
        before_start = self.answer(nps, self.pizza, 7)
        SurveyInvite.objects.filter(pk=before_start.pk).update(
            answered_at=start - timedelta(seconds=1)
        )
        reader, scope = self.reader_and_scope(self.csm, "me")
        scores = customers.scores(reader, scope, self.today)
        self.assertEqual((scores["nps"]["responses"], scores["nps"]["previous_responses"]), (1, 1))


class SentimentTests(CustomersFixture):
    def setUp(self):
        self.olivia = self.contact(self.pizza, "Olivia Park")
        self.ed = self.contact(self.emea, "Ed Emea")
        self.tia = self.contact(self.taco, "Tia Taco", "negative")
        self.sam = self.contact(self.soup, "Sam Soup", "negative")
        self.lou = self.contact(self.loose, "Lou Loose")

    def sentiment(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return customers.sentiment(reader, scope, self.today)

    def test_before_any_change(self):
        self.assertEqual(
            self.sentiment(self.csm, "me"),
            {"negative": 0, "tracking_since": None, "turned_negative": []},
        )
        self.assertEqual(self.sentiment(self.mona, "team")["negative"], 1)

    def test_who_turned_negative_in_the_last_30_days_newest_first(self):
        self.turned(self.olivia, "neutral", days_ago=2)
        self.turned(self.ed, "positive", days_ago=1)
        dot = self.contact(self.dough, "Dot Dough")
        self.turned(dot, "neutral", days_ago=40)
        sentiment = self.sentiment(self.csm, "me")
        self.assertEqual(sentiment["negative"], 3)
        turned = sentiment["turned_negative"]
        self.assertEqual([row["contact"]["name"] for row in turned], ["Ed Emea", "Olivia Park"])
        self.assertEqual(turned[0]["contact"], {"id": self.ed.id, "name": "Ed Emea"})
        self.assertEqual(
            turned[0]["record"], {"type": "account", "id": self.emea.id, "name": "Pizza EMEA"}
        )
        self.assertEqual(turned[0]["previous"], "positive")
        self.assertIn("changed_at", turned[0])
        self.assertEqual(
            sentiment["tracking_since"],
            timezone.localdate(timezone.now() - timedelta(days=40)).isoformat(),
        )

    def test_one_who_turned_back_is_not_listed(self):
        Contact.objects.filter(pk=self.olivia.pk).update(
            sentiment="positive",
            previous_sentiment="negative",
            sentiment_changed_at=timezone.now() - timedelta(days=1),
        )
        sentiment = self.sentiment(self.csm, "me")
        self.assertEqual((sentiment["negative"], sentiment["turned_negative"]), (0, []))
        self.assertIsNotNone(sentiment["tracking_since"])

    def test_in_company_only_contacts_the_reader_may_open(self):
        self.turned(self.olivia, "neutral", days_ago=5)
        self.turned(self.lou, "neutral", days_ago=1)
        sentiment = self.sentiment(self.lee, "company")
        # Tia, Sam and Olivia are negative too, on records Lee can't open.
        self.assertEqual(sentiment["negative"], 1)
        self.assertEqual(
            [row["contact"]["name"] for row in sentiment["turned_negative"]], ["Lou Loose"]
        )
        # tracking_since never dates a change Lee couldn't see.
        self.assertEqual(
            sentiment["tracking_since"],
            timezone.localdate(timezone.now() - timedelta(days=1)).isoformat(),
        )

    def test_at_most_ten(self):
        for i in range(12):
            self.turned(self.contact(self.pizza, f"Person {i}"), "neutral", days_ago=1)
        self.assertEqual(len(self.sentiment(self.csm, "me")["turned_negative"]), 10)

    def test_tracking_since_counts_a_contact_outside_the_book_the_reader_may_open(self):
        # Tia is on Taco Bell: Dana's, outside Carl's Me book, but Carl may
        # open it (through his own Taco East) — Decision 8 says
        # tracking_since dates this change anyway.
        self.turned(self.tia, "neutral", days_ago=10)
        sentiment = self.sentiment(self.csm, "me")
        # Not Carl's book, so not counted as negative in his section...
        self.assertEqual(sentiment["negative"], 0)
        # ...but tracking_since still reads it, since Carl may open Taco Bell.
        self.assertEqual(
            sentiment["tracking_since"],
            timezone.localdate(timezone.now() - timedelta(days=10)).isoformat(),
        )


class BuildTests(CustomersFixture):
    def test_the_payload_carries_every_section(self):
        self.feature("SSO with Okta", self.pizza)
        reader, scope = self.reader_and_scope(self.csm, "me")
        payload = customers.build(reader, scope, self.today)
        self.assertEqual(
            set(payload), {"scope", "currency", "asks", "anomalies", "scores", "sentiment"}
        )
        self.assertEqual((payload["scope"], payload["currency"]), ("me", "USD"))
        self.assertEqual(payload["asks"]["total"], 1)
        self.assertEqual(set(payload["scores"]), {"nps", "csat", "ces", "comments", "hidden"})

    def fill(self, n):
        nps = self.send("nps")
        for i in range(n):
            self.feature(f"Ask {i}", self.pizza, self.emea)
            self.anomaly(f"Outage {i}", self.pizza, self.emea)
            self.answer(nps, self.pizza, 3, comment=f"Slow {i}")
            self.answer(nps, self.emea, 9, comment=f"Fine {i}")
            self.turned(self.contact(self.pizza, f"Person {i}"), "neutral")
            self.turned(self.contact(self.emea, f"Other {i}"), "positive")

    #: Every scope the guard runs over: Carl's own book, his manager
    #: Mona's team book, and Lee's Company (view_all_accounts off, so
    #: `Companies(within=...)`'s `within=None` branch and its `openable`
    #: narrowing both run, same as a book-scoped reader's).
    SCOPES = (("csm", "me"), ("mona", "team"), ("lee", "company"))

    def queries(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        with CaptureQueriesContext(connection) as captured:
            customers.build(reader, scope, self.today)
        return captured.captured_queries

    def test_the_query_count_does_not_grow_and_no_query_is_distinct(self):
        self.fill(1)
        fewer = {key: self.queries(getattr(self, attr), key) for attr, key in self.SCOPES}
        self.fill(5)
        more = {key: self.queries(getattr(self, attr), key) for attr, key in self.SCOPES}
        for attr, key in self.SCOPES:
            with self.subTest(scope=key):
                self.assertEqual(len(fewer[key]), len(more[key]))
                for query in more[key]:
                    self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
