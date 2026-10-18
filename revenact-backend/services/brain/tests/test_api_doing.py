"""`doing/` over HTTP (spec §1.4, §3)."""

from datetime import timedelta
from decimal import Decimal

from rest_framework.test import APIClient

from core.models import AuditEvent
from services.brain import initiatives as say
from services.brain.metrics import figures
from services.brain.scope import book_actor, resolve
from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Risk
from services.metrics.models import Initiative
from services.metrics.registry import compute_all
from services.metrics.signals import number

DOING = "/api/v1/brain/doing/"


class DoingApiTests(DoingFixture):
    def test_the_contract_shape(self):
        self.initiative(self.csm, cut=self.csm)
        self.plan(self.pizza)
        self.night(self.rule(self.csm), fired=1)
        body = self.as_user(self.mona).get(f"{DOING}?scope=team").json()
        self.assertEqual(
            set(body), {"scope", "currency", "hidden", "trackable", "initiatives", "plans", "rules"}
        )
        self.assertEqual(
            (len(body["initiatives"]), len(body["plans"]), len(body["rules"])), (1, 1, 1)
        )

    def test_no_scope_reads_the_default(self):
        self.assertEqual(self.as_user(self.mona).get(DOING).json()["scope"], "team")
        self.assertEqual(self.as_user(self.csm).get(DOING).json()["scope"], "me")
        self.assertEqual(self.as_user(self.lee).get(DOING).json()["scope"], "company")

    def test_scope_refusals(self):
        response = self.as_user(self.csm).get(f"{DOING}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = self.as_user(self.csm).get(f"{DOING}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SCOPE_UNKNOWN")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().get(DOING).status_code, 401)

    def test_another_tenant_sees_none_of_ours(self):
        self.initiative(self.csm, cut=self.csm)
        self.plan(self.pizza)
        self.rule(self.csm)
        body = self.as_user(self.stranger).get(f"{DOING}?scope=me").json()
        self.assertEqual(
            (body["initiatives"], body["plans"], body["rules"], body["hidden"]), ([], [], [], 0)
        )


INITIATIVES = "/api/v1/brain/initiatives/"


class InitiativeStartTests(DoingFixture):
    def body(self, **extra):
        return {
            "title": "Halve my ARR at risk",
            "hypothesis": "If we run a save play on Dough Co, then ARR at risk halves.",
            "metric": "at_risk_arr",
            "target_value": "0",
            "target_by": (self.today + timedelta(days=60)).isoformat(),
            **extra,
        }

    def post(self, user, scope="me", **extra):
        return self.as_user(user).post(f"{INITIATIVES}?scope={scope}", self.body(**extra),
                                       format="json")  # fmt: skip

    def test_me_starts_one_on_my_own_book(self):
        response = self.post(self.csm)
        self.assertEqual(response.status_code, 201, response.json())
        body = response.json()
        self.assertEqual(
            body["for"], {"dimension": "owner", "member": str(self.csm.pk), "label": "Carl CSM"}
        )
        self.assertEqual(body["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertTrue(body["can_edit"])
        row = Initiative.objects.get(pk=body["id"])
        self.assertEqual(
            (row.created_by, row.owner, row.dimension, row.member, row.status),
            (self.csm, self.csm, "owner", str(self.csm.pk), "active"),
        )
        self.assertEqual(row.baseline_as_of, self.today)
        self.assertEqual(body["progress"]["baseline"], number(row.baseline_value))
        event = AuditEvent.objects.get(action="initiative.created")
        self.assertEqual(
            event.metadata, {"scope": "me", "metric": "at_risk_arr", "for_user": self.csm.pk}
        )
        self.assertEqual(event.target_repr, f"Initiative {row.pk}")

    def test_a_brain_started_baseline_is_the_creators_figure_over_the_book(self):
        """SOC2:AUTH-02 the starting line is the creator's own read of the
        person's book, not the registry's organisation-wide slice."""
        Risk.objects.create(
            title="Sales worry",
            customer=self.pizza,
            mrr=Decimal("1000"),
            priority=Risk.Priority.HIGH,
            department="sales",
        )
        carls_me = figures(resolve(self.csm, "me")).values["at_risk_arr"]
        response = self.post(self.csm)
        self.assertEqual(response.status_code, 201, response.json())
        row = Initiative.objects.get(pk=response.json()["id"])
        self.assertEqual(row.baseline_scope, "book")
        self.assertEqual(number(row.baseline_value), carls_me)
        self.assertEqual(response.json()["progress"]["baseline"], carls_me)
        self.assertEqual(response.json()["progress"]["current"], carls_me)
        # My team: the creator (Mona) over Carl's book.
        response = self.post(self.mona, "team", for_user=self.csm.pk)
        row = Initiative.objects.get(pk=response.json()["id"])
        self.assertEqual(
            number(row.baseline_value),
            number(compute_all(self.org, actor=book_actor(self.mona, self.csm.pk))["at_risk_arr"]),
        )

    def test_me_refuses_a_for_user_who_isnt_me(self):
        response = self.post(self.csm, for_user=self.other.pk)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": say.NOT_BELOW})
        self.assertFalse(Initiative.objects.exists())
        self.assertEqual(self.post(self.csm, for_user=self.csm.pk).status_code, 201)

    def test_my_team_starts_one_for_someone_below_me(self):
        response = self.post(self.mona, "team", for_user=self.csm.pk)
        self.assertEqual(response.status_code, 201, response.json())
        row = Initiative.objects.get(pk=response.json()["id"])
        self.assertEqual((row.owner, row.created_by, row.member), (self.csm, self.mona,
                                                                    str(self.csm.pk)))  # fmt: skip
        self.assertEqual(AuditEvent.objects.get(action="initiative.created").metadata["scope"],
                         "team")  # fmt: skip

    def test_my_team_defaults_to_my_own_book(self):
        body = self.post(self.mona, "team").json()
        self.assertEqual(body["owner"]["id"], self.mona.pk)

    def test_my_team_refuses_anyone_not_below_me(self):
        for someone in (self.other, self.stranger, self.admin):
            response = self.post(self.mona, "team", for_user=someone.pk)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json(), {"for_user": [say.NOT_BELOW]})
        self.assertFalse(Initiative.objects.exists())

    def test_a_number_without_an_owner_cut_is_refused(self):
        response = self.post(self.csm, metric="coverage")
        self.assertEqual(
            (response.status_code, response.json()), (400, {"detail": say.NOT_TRACKABLE})
        )
        response = self.post(self.csm, metric="nope")
        self.assertEqual(response.status_code, 400)
        self.assertIn("metric", response.json())

    def test_a_past_date_is_refused(self):
        response = self.post(self.csm, target_by=(self.today - timedelta(days=1)).isoformat())
        self.assertEqual(response.status_code, 400)
        self.assertIn("target_by", response.json())

    def test_company_is_started_elsewhere(self):
        for path in (f"{INITIATIVES}?scope=company", INITIATIVES):
            response = self.as_user(self.admin).post(path, self.body(), format="json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(
                response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": say.COMPANY_ELSEWHERE}
            )

    def test_a_scope_i_dont_have_is_refused(self):
        response = self.post(self.csm, "team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "You can't see that view.")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().post(INITIATIVES, {}, format="json").status_code, 401)

    def test_created_done_or_abandoned_closes_it(self):
        self.assertIsNotNone(self.post(self.csm, status="done").json()["id"])
        row = Initiative.objects.get(status="done")
        self.assertIsNotNone(row.closed_at)

    def test_the_create_and_its_audit_row_share_a_transaction(self):
        from unittest.mock import patch

        with patch("services.brain.initiatives.audit.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.post(self.csm)
        self.assertFalse(Initiative.objects.exists())


class InitiativeEditTests(DoingFixture):
    def setUp(self):
        self.mine = self.initiative(self.csm, cut=self.csm)

    def patch(self, user, initiative, body):
        return self.as_user(user).patch(f"{INITIATIVES}{initiative.pk}/", body, format="json")

    def test_the_owner_their_chain_and_company_may_edit(self):
        for user, as_ in ((self.csm, "me"), (self.mona, "team"), (self.admin, "company")):
            response = self.patch(user, self.mine, {"title": f"By {user.name}"})
            self.assertEqual(response.status_code, 200, response.json())
            self.assertEqual(response.json()["title"], f"By {user.name}")
            event = AuditEvent.objects.filter(action="initiative.updated").latest("id")
            self.assertEqual(event.metadata, {"scope": as_, "fields": ["title"]})
            self.assertEqual(event.target_repr, f"Initiative {self.mine.pk}")

    def test_the_patch_row_withholds_a_company_baseline(self):
        response = self.patch(self.csm, self.mine, {"title": "Mine"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["progress"]["baseline"])
        self.assertIsNone(response.json()["progress"]["progress_pct"])

    def test_anyone_else_is_refused(self):
        for user in (self.other, self.lee):
            response = self.patch(user, self.mine, {"title": "Mine now"})
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json(), {"detail": say.NOT_EDITOR})
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.title, "Halve ARR at risk")
        self.assertFalse(AuditEvent.objects.filter(action="initiative.updated").exists())

    def test_a_refused_editor_sending_a_locked_field_gets_403_not_400(self):
        """Permission is asked before the body is even parsed for locked
        fields: a non-editor sending `metric` still gets the plain refusal,
        not a 400 about a field they were never going to be allowed to touch."""
        response = self.patch(self.other, self.mine, {"metric": "nrr", "title": "Mine now"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": say.NOT_EDITOR})

    def test_an_initiative_with_no_owner_is_company_only(self):
        unowned = self.initiative(None, cut=self.csm)
        self.assertEqual(self.patch(self.csm, unowned, {"title": "x"}).status_code, 403)
        self.assertEqual(self.patch(self.admin, unowned, {"title": "x"}).status_code, 200)

    def test_another_tenant_gets_a_404(self):
        self.assertEqual(self.patch(self.stranger, self.mine, {"title": "x"}).status_code, 404)

    def test_closing_stamps_and_reopening_clears(self):
        self.patch(self.csm, self.mine, {"status": "done", "outcome": "Saved Dough Co."})
        self.mine.refresh_from_db()
        closed_at = self.mine.closed_at
        self.assertIsNotNone(closed_at)
        self.patch(self.csm, self.mine, {"status": "abandoned"})
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.closed_at, closed_at)
        self.patch(self.csm, self.mine, {"status": "active"})
        self.mine.refresh_from_db()
        self.assertIsNone(self.mine.closed_at)

    def test_what_it_tracks_cant_be_changed_here(self):
        response = self.patch(self.csm, self.mine, {"metric": "nrr", "owner_id": self.other.pk})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(), {"metric": [say.LOCKED_FIELD], "owner_id": [say.LOCKED_FIELD]}
        )

    def test_a_patch_that_changes_nothing_records_nothing(self):
        response = self.patch(self.csm, self.mine, {"title": "Halve ARR at risk"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="initiative.updated").exists())

    def test_the_edit_and_its_audit_row_share_a_transaction(self):
        from unittest.mock import patch as mock_patch

        target = "services.brain.initiatives.audit.record"
        with mock_patch(target, side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.patch(self.csm, self.mine, {"title": "Never saved"})
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.title, "Halve ARR at risk")
