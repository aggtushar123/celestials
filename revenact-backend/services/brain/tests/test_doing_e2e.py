"""End to end over HTTP: the four journeys the plan names. A CSM starts an
initiative on their own ARR at risk and their manager sees it in My team; a
plan started now shows then → now while an old one has no starting figures;
non-owners see only a rule's fired count; a member can't edit someone else's
initiative outside their chain."""

from datetime import timedelta
from decimal import Decimal

from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Customer
from services.metrics.models import Initiative
from services.plans.models import Plan, PlanTemplate
from services.rules.models import empty_skips

DOING = "/api/v1/brain/doing/"
INITIATIVES = "/api/v1/brain/initiatives/"
PLANS = "/api/v1/plans/"


class DoingEndToEndTests(DoingFixture):
    def start_mine(self):
        response = self.as_user(self.csm).post(
            f"{INITIATIVES}?scope=me",
            {
                "title": "Halve my ARR at risk",
                "hypothesis": "If Dough Co gets a save play, my ARR at risk halves.",
                "metric": "at_risk_arr",
                "target_value": "0",
                "target_by": (self.today + timedelta(days=60)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()

    def test_a_csm_starts_one_on_their_own_arr_at_risk_and_their_manager_sees_it(self):
        made = self.start_mine()
        self.assertEqual(made["metric_label"], "ARR at risk")
        # Dough Co is Carl's, in poor health and renewing in 30 days.
        self.assertGreater(made["progress"]["baseline"], 0)
        mine = self.as_user(self.csm).get(f"{DOING}?scope=me").json()["initiatives"]
        self.assertEqual([row["id"] for row in mine], [made["id"]])
        team = self.as_user(self.mona).get(f"{DOING}?scope=team").json()["initiatives"]
        (seen,) = [row for row in team if row["id"] == made["id"]]
        self.assertEqual(seen["for"]["label"], "Carl CSM")
        self.assertTrue(seen["can_edit"])
        self.assertEqual(
            self.as_user(self.other).get(f"{DOING}?scope=me").json()["initiatives"], []
        )

    def test_a_member_cant_edit_someone_elses_initiative_outside_their_chain(self):
        made = self.start_mine()
        path = f"{INITIATIVES}{made['id']}/"
        response = self.as_user(self.other).patch(path, {"status": "abandoned"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "You can't change this initiative."})
        self.assertEqual(Initiative.objects.get(pk=made["id"]).status, "active")
        closed = self.as_user(self.mona).patch(
            path, {"status": "done", "outcome": "Dough Co renewed."}, format="json"
        )
        self.assertEqual(closed.status_code, 200, closed.json())
        self.assertEqual((closed.json()["status"], closed.json()["outcome"]),
                         ("done", "Dough Co renewed."))  # fmt: skip

    def test_a_plan_started_now_shows_then_and_now_and_an_old_one_has_none(self):
        old = Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            name="Old QBR",
            kind="qbr",
            owner=self.csm,
            start_date=self.today - timedelta(days=20),
            target_date=self.today + timedelta(days=10),
            status="on_track",
        )
        carl = self.as_user(self.csm)
        save = PlanTemplate.objects.get(is_builtin=True, kind="save")
        started = carl.post(PLANS, {"template": save.pk, "customer": self.dough.pk}, format="json")
        self.assertEqual(started.status_code, 201, started.content)
        Customer.objects.filter(pk=self.dough.pk).update(health_score=Decimal("4.5"))
        plans = {row["id"]: row for row in carl.get(f"{DOING}?scope=me").json()["plans"]}
        new = plans[started.json()["id"]]
        self.assertEqual(
            new["then"], {"health_score": 2.0, "arr": 100000.0, "taken_on": self.today.isoformat()}
        )
        self.assertEqual(new["now"], {"health_score": 4.5, "arr": 100000.0})
        self.assertIsNone(plans[old.pk]["then"])
        self.assertEqual(plans[old.pk]["now"], {"health_score": 8.0, "arr": 300000.0})

    def test_non_owners_see_only_a_rules_fired_count(self):
        rule = self.rule(self.csm)
        self.night(rule, fired=2, matched=12, skipped={**empty_skips(), "cooldown": 2},
                   records=(self.pizza, self.dough))  # fmt: skip
        (mine,) = self.as_user(self.csm).get(f"{DOING}?scope=me").json()["rules"]
        self.assertEqual(
            mine["last_run"],
            {"run_on": self.today.isoformat(), "fired": 2, "matched": 12, "skipped": 2},
        )
        (theirs,) = self.as_user(self.mona).get(f"{DOING}?scope=team").json()["rules"]
        self.assertEqual((theirs["mine"], theirs["readable"]), (False, False))
        self.assertEqual(theirs["last_run"], {"run_on": self.today.isoformat(), "fired": 2})
        company = self.as_user(self.lee).get(f"{DOING}?scope=company").json()["rules"]
        (seen,) = [row for row in company if row["id"] == rule.pk]
        self.assertEqual(seen["last_run"], {"run_on": self.today.isoformat(), "fired": 0})
