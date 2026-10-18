"""What an answer does to the scores: the record's rolling 90-day figure
(an organisation's includes its accounts'; CES lands on the organisation
only) and one log row per send and record."""

from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from services.customers.models import Contact, Survey
from services.surveys.models import SurveyInvite
from services.surveys.scores import record_answer, refresh, upsert_log, whole_percent
from services.surveys.summary import rate, send_summary
from services.surveys.tests.fixtures import SurveyFixture, contact


class RefreshTests(SurveyFixture):
    def test_nps_is_promoters_minus_detractors_over_live_answers(self):
        send = self.make_send()
        for name, score in (("Pat", 10), ("Pia", 9), ("Dee", 3)):
            self.answered(send, contact(self.pizza, name), score)
        self.assertTrue(refresh(self.pizza, "nps", now=self.now))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 33)

    def test_csat_and_ces_keep_two_decimals(self):
        csat = self.make_send(survey_type="csat")
        for name, score in (("Al", 5), ("Bo", 4), ("Cy", 1)):
            self.answered(csat, contact(self.pizza, name), score)
        ces = self.make_send(survey_type="ces")
        for name, score in (("Di", 7), ("Ed", 4), ("Fi", 2)):
            self.answered(ces, contact(self.pizza, name), score)
        refresh(self.pizza, "csat", now=self.now)
        refresh(self.pizza, "ces", now=self.now)
        self.pizza.refresh_from_db()
        self.assertEqual(
            (self.pizza.csat_score, self.pizza.ces_percentage), (Decimal("66.67"), Decimal("33.33"))
        )

    def test_only_answers_from_the_last_90_days_count(self):
        send = self.make_send()
        self.answered(send, self.ann, 0, days_ago=91)
        self.answered(send, contact(self.pizza, "Pia"), 10, days_ago=89)
        refresh(self.pizza, "nps", now=self.now)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)

    def test_a_record_with_no_live_answers_keeps_its_score(self):
        self.pizza.nps_score = 40
        self.pizza.save(update_fields=["nps_score"])
        self.answered(self.make_send(), self.ann, 0, days_ago=120)
        self.assertFalse(refresh(self.pizza, "nps", now=self.now))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 40)

    def test_pending_failed_and_other_types_do_not_count(self):
        send = self.make_send()
        self.answered(send, self.ann, 10)
        self.make_invite(send, contact(self.pizza, "Pia"))
        self.make_invite(send, contact(self.pizza, "Fay"), status="failed", failure="x")
        self.answered(self.make_send(survey_type="csat"), contact(self.pizza, "Cy"), 1)
        refresh(self.pizza, "nps", now=self.now)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)

    def test_an_organisation_counts_its_accounts_answers_and_an_account_only_its_own(self):
        send = self.make_send()
        self.answered(send, self.ann, 10)
        self.answered(send, self.ben, 0)
        refresh(self.pizza, "nps", now=self.now)
        refresh(self.emea, "nps", now=self.now)
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (0, -100))


class RoundingTests(SurveyFixture):
    """Round half up, once, straight from the counts (decision 11)."""

    def answers(self, send, scores):
        people = Contact.objects.bulk_create(
            Contact(customer=self.pizza, name=f"P{i}", email=f"p{i}@example.com", role="champion")
            for i in range(len(scores))
        )
        SurveyInvite.objects.bulk_create(
            SurveyInvite(
                send=send,
                contact=person,
                customer=self.pizza,
                email=person.email,
                token_hash=f"{send.pk}-{person.pk}",
                expires_at=self.now,
                status="answered",
                score=score,
                answered_at=self.now - timedelta(days=1),
            )
            for person, score in zip(people, scores, strict=True)
        )

    def stored(self, scores):
        send = self.make_send()
        self.answers(send, scores)
        refresh(self.pizza, "nps", now=self.now)
        row = upsert_log(send, self.pizza, now=self.now)
        self.pizza.refresh_from_db()
        return self.pizza.nps_score, row.score, send_summary(send, self.csm)["figure"]

    def test_one_net_promoter_in_201_stores_0(self):
        # 100 x 1/201 = 0.4975...: once rounded it is 0, rounded twice (0.50) it was 1.
        self.assertEqual(self.stored([10] + [8] * 200), (0, 0, 0))

    def test_exactly_half_rounds_up(self):
        # 1 promoter in 8 is 12.5: half up gives 13 (half even would give 12).
        self.assertEqual(self.stored([10] + [8] * 7), (13, 13, 13))
        self.assertEqual(whole_percent(-1, 8), -13)

    def test_the_answer_rate_rounds_once(self):
        self.assertEqual((rate(1, 201), rate(1, 8), rate(0, 0)), (0, 13, None))


class RecordAnswerTests(SurveyFixture):
    def answer(self, send, person, score, comment=""):
        invite = self.make_invite(send, person)
        record_answer(invite, score, comment, now=self.now)
        return invite

    def log_rows(self, send):
        return set(
            Survey.objects.filter(send=send).values_list("customer_id", "account_id", "score")
        )

    def test_an_answer_moves_the_organisation_and_writes_its_log_row(self):
        send = self.make_send(started_at=self.now, sent_at=self.now)
        invite = self.answer(send, self.ann, 9, "Great")
        invite.refresh_from_db()
        self.assertEqual(
            (invite.status, invite.score, invite.comment, invite.answered_at),
            ("answered", 9, "Great", self.now),
        )
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)
        row = Survey.objects.get(send=send)
        today = timezone.localdate(self.now)
        self.assertEqual(
            (row.customer_id, row.account_id, row.survey_type, row.status, row.score),
            (self.pizza.pk, None, "nps", "responded", 100),
        )
        self.assertEqual((row.sent_at, row.responded_at), (today, today))

    def test_an_account_contacts_answer_moves_the_account_and_its_organisation(self):
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ben, 0)
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (-100, -100))
        self.assertEqual(
            self.log_rows(send), {(self.pizza.pk, None, -100), (None, self.emea.pk, -100)}
        )

    def test_the_answer_locks_the_records_it_rescores(self):
        send = self.make_send(sent_at=self.now)
        invite = self.make_invite(send, self.ben)
        with CaptureQueriesContext(connection) as ctx:
            record_answer(invite, 0, "", now=self.now)
        locks = [
            query["sql"] for query in ctx.captured_queries if "FOR NO KEY UPDATE" in query["sql"]
        ]
        self.assertTrue(any('"customers_account"' in sql for sql in locks), locks)
        self.assertTrue(any('"customers_customer"' in sql for sql in locks), locks)

    def test_the_record_locks_are_no_key_so_foreign_key_inserts_never_wait_on_them(self):
        # FOR UPDATE conflicts with the FOR KEY SHARE every FK insert takes on
        # its parent (a claim's invites, a rule's tasks); NO KEY UPDATE does not
        send = self.make_send(sent_at=self.now)
        invite = self.make_invite(send, self.ben)
        with CaptureQueriesContext(connection) as ctx:
            record_answer(invite, 0, "", now=self.now)
        record_locks = [
            query["sql"]
            for query in ctx.captured_queries
            if " FOR " in query["sql"]
            and ('"customers_account"' in query["sql"] or '"customers_customer"' in query["sql"])
            and '"surveys_surveyinvite"' not in query["sql"]
        ]
        self.assertEqual(len(record_locks), 2, record_locks)
        for sql in record_locks:
            self.assertTrue(sql.endswith("FOR NO KEY UPDATE"), sql)
        # accounts before customers, as before
        self.assertIn('"customers_account"', record_locks[0])
        self.assertIn('"customers_customer"', record_locks[1])

    def test_an_account_contacts_ces_answer_scores_only_its_organisation(self):
        send = self.make_send(survey_type="ces", sent_at=self.now)
        self.answer(send, self.ben, 6)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.ces_percentage, Decimal("100.00"))
        self.assertEqual(self.log_rows(send), {(self.pizza.pk, None, 100)})

    def test_an_account_on_two_organisations_scores_both(self):
        self.emea.customers.add(self.taco)
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ben, 10)
        self.taco.refresh_from_db()
        self.assertEqual(self.taco.nps_score, 100)
        self.assertEqual(len(self.log_rows(send)), 3)

    def test_the_log_row_is_upserted_as_answers_arrive(self):
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ann, 10)
        self.answer(send, contact(self.pizza, "Pia"), 0)
        self.assertEqual(self.log_rows(send), {(self.pizza.pk, None, 0)})

    def test_the_log_row_is_this_sends_figure_and_the_record_the_90_day_one(self):
        self.answered(self.make_send(), contact(self.pizza, "Old"), 0, days_ago=10)
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ann, 10)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 0)
        self.assertEqual(self.log_rows(send), {(self.pizza.pk, None, 100)})

    def test_a_send_still_sending_logs_with_its_start_date(self):
        started = self.now - timedelta(days=1)
        send = self.make_send(status="sending", started_at=started)
        self.answer(send, self.ann, 10)
        self.assertEqual(Survey.objects.get(send=send).sent_at, timezone.localdate(started))


class LogRowApiTests(SurveyFixture):
    def test_the_logged_list_names_the_send_behind_a_row(self):
        send = self.make_send(sent_at=self.now)
        record_answer(self.make_invite(send, self.ann), 9, "", now=self.now)
        by_hand = Survey.objects.create(
            customer=self.pizza, survey_type="csat", status="sent", sent_at=self.today
        )
        client = APIClient()
        client.force_authenticate(self.admin)
        rows = {row["id"]: row for row in client.get("/api/v1/surveys/").data}
        self.assertEqual(rows[Survey.objects.get(send=send).pk]["send_id"], send.pk)
        self.assertIsNone(rows[by_hand.pk]["send_id"])


class SendWrittenRowTests(SurveyFixture):
    """A log row a send wrote updates itself from the answers: the existing
    Surveys API reads it but neither edits nor deletes it. Rows logged by
    hand are unchanged."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        send = cls.make_send(sent_at=cls.now)
        record_answer(cls.make_invite(send, cls.ann), 9, "", now=cls.now)
        cls.from_send = Survey.objects.get(send=send)
        cls.by_hand = Survey.objects.create(
            customer=cls.pizza, survey_type="nps", status="sent", sent_at=cls.today
        )

    def api(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        return client

    def test_a_send_written_row_cannot_be_edited(self):
        url = f"/api/v1/surveys/{self.from_send.pk}/"
        full = {"survey_type": "nps", "status": "responded", "score": -50, "sent_at": "2026-10-01"}
        for response in (
            self.api().patch(url, {"score": -50}, format="json"),
            self.api().put(url, full, format="json"),
        ):
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"detail": "This score comes from a sent survey and updates itself."}),
            )
        self.from_send.refresh_from_db()
        self.pizza.refresh_from_db()
        self.assertEqual((self.from_send.score, self.pizza.nps_score), (100, 100))

    def test_a_send_written_row_cannot_be_deleted(self):
        response = self.api().delete(f"/api/v1/surveys/{self.from_send.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"detail": "This score comes from a sent survey and updates itself."}),
        )
        self.assertTrue(Survey.objects.filter(pk=self.from_send.pk).exists())

    def test_a_send_written_row_can_still_be_read(self):
        response = self.api().get(f"/api/v1/surveys/{self.from_send.pk}/")
        self.assertEqual((response.status_code, response.data["score"]), (200, 100))

    def test_rows_logged_by_hand_are_unchanged(self):
        url = f"/api/v1/surveys/{self.by_hand.pk}/"
        response = self.api().patch(url, {"status": "responded", "score": 40}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 40)
        self.assertEqual(self.api().delete(url).status_code, 204)
