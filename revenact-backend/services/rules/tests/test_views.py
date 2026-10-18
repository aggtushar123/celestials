"""The rule endpoints: list, create, read, edit and delete. Sharing works as
segments' does; only the owner writes; missing and hidden read the same
404; at most 50 rules each; every write is audited by field name, never
value."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.rules.models import Rule, RuleReview, RuleRun, RuleState
from services.rules.tests.fixtures import NOTIFY_ME, SURVEY, TASK, RuleFixture

URL = "/api/v1/rules/"
NOT_OWNER = {"detail": "Only the rule's owner can change it."}
NOT_SEGMENT_OWNER = {"detail": "A rule can only use your own segments."}
ROW_KEYS = {
    "id", "name", "is_active", "paused_reason", "paused_message", "segment", "trigger", "score",
    "direction", "threshold", "cadence", "weekday", "actions", "cooldown_days", "sharing",
    "owner", "is_owner", "last_run", "updated_at", "made_by",
}  # fmt: skip
DETAIL_KEYS = ROW_KEYS | {"shared_with", "created_at"}


class Endpoint(RuleFixture):
    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def fresh(self, user):
        """A client for the user loaded anew, as each real request loads it."""
        return self.api(User.objects.get(pk=user.pk))

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))

    def body(self, **fields):
        return {
            "name": "Renewal watch",
            "segment": self.book.pk,
            "trigger": "entered",
            "actions": [NOTIFY_ME],
            **fields,
        }


class CreateTests(Endpoint):
    def post(self, user=None, **fields):
        return self.api(user or self.csm).post(URL, self.body(**fields), format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().post(URL, self.body(), format="json").status_code, 401)

    def test_a_rule_is_created_off_for_its_owner(self):
        response = self.post(actions=[NOTIFY_ME, TASK])
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(set(data), DETAIL_KEYS)
        self.assertEqual(
            (data["is_active"], data["owner"], data["is_owner"], data["last_run"]),
            (False, {"id": self.csm.pk, "name": "Carl CSM"}, True, None),
        )
        self.assertEqual(
            data["segment"], {"id": self.book.pk, "name": "My book", "kind": "customer"}
        )
        self.assertEqual(data["actions"], [NOTIFY_ME, TASK])
        self.assertEqual(
            self.events("rule.created"),
            [(str(data["id"]), {"trigger": "entered", "actions": ["notify", "task"]})],
        )
        self.assertEqual(self.events("rule.activated"), [])

    def test_a_rule_created_on_is_audited_as_turned_on(self):
        rule_id = self.post(is_active=True).data["id"]
        self.assertEqual(self.events("rule.activated"), [(str(rule_id), {})])

    def test_the_owner_and_workspace_come_from_the_request(self):
        response = self.post(owner=self.other.pk, organisation=self.other_org.pk)
        rule = Rule.objects.get(pk=response.data["id"])
        self.assertEqual((rule.owner, rule.organisation), (self.csm, self.org))

    def test_400_at_the_field_named(self):
        response = self.post(actions=[NOTIFY_ME, {**TASK, "title": ""}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"actions": [{}, {"title": ["Give the task a title."]}]})

    def test_someone_elses_segment_is_403_and_an_unreadable_one_404(self):
        shared = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        response = self.post(segment=shared.pk)
        self.assertEqual((response.status_code, response.data), (403, NOT_SEGMENT_OWNER))
        private = self.pinned("customer", [self.taco], owner=self.other, name="Private")
        self.assertEqual(self.post(segment=private.pk).status_code, 404)

    def test_the_51st_rule_is_429(self):
        Rule.objects.bulk_create(
            [
                Rule(
                    organisation=self.org,
                    owner=self.csm,
                    name=f"Rule {i}",
                    trigger="entered",
                    actions=[NOTIFY_ME],
                )
                for i in range(50)
            ]
        )
        response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (429, {"detail": "You can own at most 50 rules."}),
        )
        danas = self.pinned("customer", [self.taco], owner=self.other, name="Dana's")
        self.assertEqual(self.post(self.other, segment=danas.pk).status_code, 201)

    def test_sharing_on_create_is_audited(self):
        rule_id = self.post(sharing="people", shared_with=[self.other.pk]).data["id"]
        self.assertEqual(
            self.events("rule.shared"),
            [(str(rule_id), {"sharing": "people", "shared_with": [self.other.pk]})],
        )


class ReadTests(Endpoint):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.mine = cls.make_rule(name="Carl's watch")
        everyone = cls.pinned("customer", [cls.pizza, cls.taco], owner=cls.admin, name="Everyone")
        cls.team = cls.make_rule(
            owner=cls.admin, segment=everyone, name="Team watch", sharing="workspace"
        )
        danas = cls.pinned("customer", [cls.taco], owner=cls.other, name="Dana's")
        cls.hidden = cls.make_rule(owner=cls.other, segment=danas, name="Dana's watch")

    def names(self, user, **query):
        return [row["name"] for row in self.api(user).get(URL, query).data]

    def test_the_list_is_mine_and_what_is_shared_with_me(self):
        self.assertEqual(self.names(self.csm), ["Carl's watch", "Team watch"])
        self.assertEqual(self.names(self.csm, scope="mine"), ["Carl's watch"])
        self.assertEqual(self.names(self.csm, scope="shared"), ["Team watch"])
        self.assertEqual(set(self.api(self.csm).get(URL).data[0]), ROW_KEYS)

    def test_a_rule_shared_by_name_is_read_only_by_those_named(self):
        Rule.objects.filter(pk=self.hidden.pk).update(sharing="people")
        self.hidden.shared_with.set([self.csm])
        self.assertIn("Dana's watch", self.names(self.csm))
        self.assertNotIn("Dana's watch", self.names(self.admin))

    def test_another_workspace_never_sees_a_rule(self):
        self.assertEqual(self.names(self.stranger), [])

    def test_a_reader_sees_the_segment_by_name_only_if_they_cannot_open_it(self):
        data = self.api(self.csm).get(f"{URL}{self.team.pk}/").data
        self.assertEqual(set(data), DETAIL_KEYS)
        self.assertEqual(
            (data["segment"], data["is_owner"]),
            ({"id": None, "name": "Everyone", "kind": "customer"}, False),
        )

    def test_missing_and_hidden_read_the_same_404(self):
        hidden = self.api(self.csm).get(f"{URL}{self.hidden.pk}/")
        missing = self.api(self.csm).get(f"{URL}999999/")
        self.assertEqual((hidden.status_code, missing.status_code), (404, 404))
        self.assertEqual(hidden.data, missing.data)

    def test_the_last_run_is_the_owners_to_read(self):
        RuleRun.objects.create(rule=self.team, run_on=self.today, started_at=self.now, fired=3)
        owner_row = self.api(self.admin).get(URL, {"scope": "mine"}).data[0]
        reader_row = self.api(self.csm).get(URL, {"scope": "shared"}).data[0]
        self.assertEqual(
            owner_row["last_run"], {"run_on": self.today.isoformat(), "fired": 3, "waiting": False}
        )
        self.assertEqual(
            reader_row["last_run"],
            {"run_on": self.today.isoformat(), "fired": None, "waiting": False},
        )

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        # A run already exists so both reads trigger `last_runs`'s review
        # prefetch; otherwise the first read's empty run queryset would
        # skip it, undercounting the "before" side.
        RuleRun.objects.create(rule=self.mine, run_on=self.today, started_at=self.now)
        with CaptureQueriesContext(connection) as before:
            self.fresh(self.csm).get(URL)
        for i in range(4):
            rule = self.make_rule(owner=self.admin, name=f"More {i}", sharing="workspace")
            RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        with CaptureQueriesContext(connection) as after:
            rows = self.fresh(self.csm).get(URL).data
        self.assertEqual(len(rows), 6)
        self.assertEqual(len(after.captured_queries), len(before.captured_queries))


class EditTests(Endpoint):
    def setUp(self):
        self.rule = self.make_rule(is_active=False, sharing="workspace")

    def patch(self, user=None, **body):
        return self.api(user or self.csm).patch(f"{URL}{self.rule.pk}/", body, format="json")

    def remember(self, value=70):
        return RuleState.objects.create(
            rule=self.rule,
            record_kind="customer",
            record_id=self.pizza.pk,
            last_value=value,
            last_fired_on=self.today,
        )

    def test_only_the_owner_edits(self):
        response = self.patch(self.other, name="Mine now")
        self.assertEqual((response.status_code, response.data), (403, NOT_OWNER))
        self.assertEqual(self.patch(self.stranger, name="x").status_code, 404)

    def test_an_edit_records_the_fields_changed_never_their_values(self):
        response = self.patch(name="Renamed", cooldown_days=14)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["name"], "Renamed")
        self.patch(name="Renamed")
        self.assertEqual(
            self.events("rule.updated"),
            [(str(self.rule.pk), {"fields": ["cooldown_days", "name"]})],
        )

    def test_turning_on_and_off_is_audited_on_its_own(self):
        self.patch(is_active=True)
        self.patch(is_active=False)
        self.assertEqual(self.events("rule.activated"), [(str(self.rule.pk), {})])
        self.assertEqual(self.events("rule.paused"), [(str(self.rule.pk), {"reason": "owner"})])
        self.assertEqual(self.events("rule.updated"), [])

    def test_turning_on_clears_a_pause_and_forgets_last_scores(self):
        Rule.objects.filter(pk=self.rule.pk).update(paused_reason="owner_inactive")
        state = self.remember()
        data = self.patch(is_active=True).data
        state.refresh_from_db()
        self.assertEqual((data["paused_reason"], data["paused_message"]), ("", ""))
        self.assertEqual((state.last_value, state.last_fired_on), (None, self.today))

    def test_a_new_segment_or_trigger_starts_afresh(self):
        self.remember()
        self.assertEqual(self.patch(trigger="left").status_code, 200)
        self.assertFalse(RuleState.objects.exists())

    def waiting_review(self):
        run = RuleRun.objects.create(rule=self.rule, run_on=self.today, started_at=self.now)
        return RuleReview.objects.create(
            rule=self.rule,
            run=run,
            action=dict(SURVEY),
            records=[{"kind": "customer", "id": self.pizza.pk}],
        )

    def test_a_new_segment_expires_the_waiting_reviews(self):
        review = self.waiting_review()
        accounts = self.pinned("account", [self.emea], name="Accounts")
        response = self.patch(segment=accounts.pk, actions=[NOTIFY_ME])
        self.assertEqual(response.status_code, 200, response.content)
        review.refresh_from_db()
        self.assertEqual((review.status, review.decided_by), ("expired", None))
        self.assertIsNotNone(review.decided_at)
        self.assertEqual(
            self.events("rule.review_expired"),
            [(str(review.pk), {"rule": self.rule.pk, "kind": "survey", "reason": "rule_changed"})],
        )

    def test_a_new_trigger_expires_the_waiting_reviews(self):
        review = self.waiting_review()
        self.assertEqual(self.patch(trigger="left").status_code, 200)
        review.refresh_from_db()
        self.assertEqual(review.status, "expired")

    def test_a_rename_leaves_the_waiting_reviews_alone(self):
        review = self.waiting_review()
        self.assertEqual(self.patch(name="Renamed").status_code, 200)
        review.refresh_from_db()
        self.assertEqual(review.status, "waiting")
        self.assertEqual(self.events("rule.review_expired"), [])

    def test_a_new_line_forgets_last_scores_but_keeps_the_cooldown(self):
        Rule.objects.filter(pk=self.rule.pk).update(
            trigger="crossed", score="csat", direction="below", threshold=60
        )
        state = self.remember()
        self.assertEqual(self.patch(threshold=50).status_code, 200)
        state.refresh_from_db()
        self.assertEqual((state.last_value, state.last_fired_on), (None, self.today))

    def test_turning_on_needs_a_segment(self):
        Rule.objects.filter(pk=self.rule.pk).update(segment=None)
        response = self.patch(is_active=True)
        self.assertEqual(
            (response.status_code, response.data), (400, {"segment": ["Choose a segment."]})
        )

    def test_sharing_changes_are_audited(self):
        self.patch(sharing="private")
        self.assertEqual(
            self.events("rule.shared"),
            [(str(self.rule.pk), {"sharing": "private", "shared_with": []})],
        )


class DeleteTests(Endpoint):
    def test_the_owner_deletes_and_it_is_audited(self):
        rule = self.make_rule(sharing="workspace")
        self.assertEqual(self.api(self.other).delete(f"{URL}{rule.pk}/").status_code, 403)
        self.assertEqual(self.api(self.stranger).delete(f"{URL}{rule.pk}/").status_code, 404)
        self.assertEqual(self.api(self.csm).delete(f"{URL}{rule.pk}/").status_code, 204)
        self.assertFalse(Rule.objects.filter(pk=rule.pk).exists())
        self.assertEqual(self.events("rule.deleted"), [(str(rule.pk), {"trigger": "entered"})])
