"""Activity, approve, reject and undo over HTTP (contract): the
twice-filter, hidden counts, evidence for view-all only, and the error
order. Approve and reject answer 409 USE_BUNDLE (agent bundles D19): a step
is decided by running or rejecting its bundle."""

from django.utils import timezone

from services.agents.tests.bundle_fixtures import BUNDLES, run_one
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction

LIST = "/api/v1/agents/actions/"


class MakesActions:
    def make(self, record, **fields):
        fields.setdefault("status", "proposed")
        parent = (
            {"account": record} if record.__class__.__name__ == "Account" else {"customer": record}
        )
        defaults = {
            "kind": "record.lifecycle",
            "target": "lifecycle",
            "title": f"Move {record.name}",
            "rationale": "Renews soon.",
            "evidence": ["Renews in 30 days"],
            "payload": {"stage": "renewal"},
            "before": record.lifecycle_stage,
        }
        return AgentAction.objects.create(
            organisation=self.org, agent="cs", batch="b", **parent, **{**defaults, **fields}
        )


class ActionsApiTests(MakesActions, AgentsFixture):
    def test_activity_names_only_what_the_reader_opens(self):
        self.make(self.pizza)
        self.make(self.soup)
        data = self.client_for(self.csm).get(LIST).data
        self.assertEqual([r["record"]["name"] for r in data["results"]], ["Pizza Hut"])
        self.assertEqual(data["hidden"], 1)
        self.assertEqual(data["results"][0]["evidence"], [])
        self.assertEqual(data["results"][0]["rationale"], "Renews soon.")
        admin = self.client_for(self.admin).get(LIST).data
        self.assertEqual(admin["hidden"], 0)
        self.assertEqual(admin["results"][0]["evidence"][0]["label"], "Renews in 30 days")

    def test_filters_and_a_bad_filter(self):
        self.make(self.pizza)
        self.assertEqual(self.client_for(self.admin).get(LIST, {"agent": "ops"}).data["count"], 0)
        response = self.client_for(self.admin).get(LIST, {"agent": "hr"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"agent": ["Choose cs, sales or ops."]})
        for status in ("failed", "skipped"):
            ok = self.client_for(self.admin).get(LIST, {"status": status})
            self.assertEqual(ok.status_code, 200, status)
        response = self.client_for(self.admin).get(LIST, {"status": "done"})
        self.assertEqual(
            response.data,
            {"status": ["Choose proposed, applied, rejected, expired, undone, failed or skipped."]},
        )

    def test_approve_then_already_decided(self):
        action = self.make(self.pizza)
        url = f"{LIST}{action.pk}/approve/"
        old = self.client_for(self.csm).post(url, {}, format="json")
        self.assertEqual((old.status_code, old.data["code"]), (409, "USE_BUNDLE"))
        response = run_one(self.client_for(self.csm), action)
        self.assertEqual(response.status_code, 200, response.data)
        step = response.data["bundle"]["steps"][0]
        self.assertEqual(step["status"], "applied")
        self.assertTrue(step["undo"]["allowed"])
        again = run_one(self.client_for(self.mona), action)
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.data["code"], "BUNDLE_RAN")
        self.assertRegex(again.data["detail"], r"^Carl CSM ran this at \d\d:\d\d\.$")

    def test_error_order(self):
        action = self.make(self.soup)
        url = f"{LIST}{action.pk}/approve/"
        self.assertEqual(self.client_for(self.csm).post(url).status_code, 404)
        self.assertEqual(self.client_for(self.lee).post(url).status_code, 404)
        mine = self.make(self.pizza)
        response = self.client_for(self.other).post(f"{LIST}{mine.pk}/approve/")
        self.assertEqual(response.status_code, 404)

    def test_expired_on_approve(self):
        action = self.make(self.pizza)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        response = run_one(self.client_for(self.csm), action)
        # D14: a step whose check fails at run expires; the bundle with it
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["bundle"]["status"], "expired")
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "expired")
        action.refresh_from_db()
        self.assertEqual(action.expired_reason, "changed")

    def test_one_action_for_its_reader(self):
        mine = self.make(self.pizza)
        theirs = self.make(self.soup)
        ok = self.client_for(self.csm).get(f"{LIST}{mine.pk}/")
        self.assertEqual((ok.status_code, ok.data["id"]), (200, mine.pk))
        self.assertEqual(self.client_for(self.csm).get(f"{LIST}{theirs.pk}/").status_code, 404)
        self.assertEqual(self.client_for(self.admin).get(f"{LIST}{theirs.pk}/").status_code, 200)

    def test_undo_already_undone_carries_the_action(self):
        action = self.make(self.pizza)
        run_one(self.client_for(self.csm), action)
        self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        again = self.client_for(self.mona).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual((again.status_code, again.data["code"]), (409, "ALREADY_DECIDED"))
        self.assertEqual(again.data["detail"], "Carl CSM already undid this.")
        self.assertEqual(again.data["action"]["status"], "undone")

    def test_reject_with_a_long_note_is_refused(self):
        action = self.make(self.pizza)
        response = self.client_for(self.csm).post(
            f"{BUNDLES}{action.bundle_id}/reject/",
            {"reason": "other", "note": "x" * 256},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"note": ["Keep the note under 255 characters."]})

    def test_undo_over_http(self):
        action = self.make(self.pizza)
        run_one(self.client_for(self.csm), action)
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CHANGED_SINCE")
        self.assertEqual((response.data["current"], response.data["applied"]), ("Churn", "Renewal"))
        not_applied = self.make(self.dough)
        response = self.client_for(self.csm).post(f"{LIST}{not_applied.pk}/undo/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "NOT_APPLIED"))
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timezone.timedelta(days=8)
        )
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual((response.status_code, response.data["code"]), (410, "UNDO_EXPIRED"))


class ActionRoutesAreClosedFirstTests(AgentsFixture):
    """404 comes before anything else, because `undo()` does not check the
    workspace and `deciding` is only reached for what the reader may open."""

    def make(self, record=None, **fields):
        fields.setdefault("kind", "record.lifecycle")
        fields.setdefault("status", "proposed")
        parent = {}
        if record is not None:
            key = "account" if record.__class__.__name__ == "Account" else "customer"
            parent[key] = record
        return AgentAction.objects.create(
            organisation=fields.pop("organisation", self.org),
            agent=fields.pop("agent", "cs"),
            batch="b",
            target="t",
            title="t",
            rationale="r",
            payload={"stage": "renewal"},
            applied_at=timezone.now() if fields["status"] == "applied" else None,
            **parent,
            **fields,
        )

    def every_route(self, client, pk):
        base = f"{LIST}{pk}/"
        return [
            client.get(base),
            client.post(f"{base}approve/"),
            client.post(f"{base}reject/"),
            client.post(f"{base}undo/"),
        ]

    def test_another_workspaces_action_is_a_404_on_every_route(self):
        theirs = self.make(self.globex, organisation=self.other_org, status="applied")
        for response in self.every_route(self.client_for(self.admin), theirs.pk):
            self.assertEqual(response.status_code, 404)
        theirs.refresh_from_db()
        self.assertEqual(theirs.status, "applied")

    def test_a_record_the_reader_cannot_open_is_a_404_on_every_route(self):
        hidden = self.make(self.soup, status="applied")
        for response in self.every_route(self.client_for(self.csm), hidden.pk):
            self.assertEqual(response.status_code, 404)
        hidden.refresh_from_db()
        self.assertEqual(hidden.status, "applied")

    def test_a_workspace_level_action_is_a_404_unless_view_all(self):
        action = self.make(kind="initiative.create", agent="ops", status="applied")
        for response in self.every_route(self.client_for(self.csm), action.pk):
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client_for(self.admin).get(f"{LIST}{action.pk}/").status_code, 200)

    def test_403_comes_after_the_404_for_a_reader_who_opens_the_record(self):
        # Dana owns Taco Bell, which Carl can open through Taco East: he
        # opens it but is neither its owner nor above her.
        action = self.make(self.taco)
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/approve/")
        self.assertEqual((response.status_code, response.data["code"]), (403, "CANT_DECIDE"))
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual((response.status_code, response.data["code"]), (403, "CANT_DECIDE"))

    def test_undo_already_undone_answers_even_after_the_7_days(self):
        action = self.make(self.pizza, status="undone")
        AgentAction.objects.filter(pk=action.pk).update(
            applied_at=timezone.now() - timezone.timedelta(days=30), undone_by=self.mona
        )
        response = self.client_for(self.csm).post(f"{LIST}{action.pk}/undo/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_DECIDED"))
        self.assertEqual(response.data["action"]["status"], "undone")

    def test_approving_an_expired_action_says_expired(self):
        action = self.make(self.pizza, status="expired", expired_reason="waited")
        response = run_one(self.client_for(self.csm), action)
        self.assertEqual((response.status_code, response.data["code"]), (409, "BUNDLE_EXPIRED"))
        self.assertEqual(response.data["detail"], "This bundle expired: it waited 14 days.")


class ActivityQueryCountTests(AgentsFixture):
    """A page costs the same queries however many rows it holds."""

    def rows(self, start, count):
        from services.attributes.models import AIAttribute
        from services.customers.models import Task

        attribute = AIAttribute.objects.get_or_create(
            organisation=self.org,
            api_name="score",
            defaults={"name": "Score", "prompt": "p", "value_type": "number"},
        )[0]
        today = timezone.localdate()
        for i in range(start, start + count):
            task = Task.objects.create(
                customer=self.pizza,
                title=f"Call {i}",
                assignee=self.csm,
                assignee_name=self.csm.name,
                created_by=self.csm,
                due_date=today + timezone.timedelta(days=3),
            )
            common = {
                "organisation": self.org,
                "agent": "cs",
                "batch": "b",
                "customer": self.pizza,
                "title": "t",
                "rationale": "r",
                "evidence": ["e"],
            }
            specs = [
                ("record.lifecycle", {"stage": "renewal"}, "lifecycle", "live", {}),
                ("record.owner", {"owner_id": self.mona.pk}, "owner", self.csm.pk, {}),
                (
                    "record.attribute",
                    {"attribute_id": attribute.pk, "value": 5},
                    "attribute",
                    None,
                    {"status": "applied", "after": 5, "applied_at": timezone.now()},
                ),
                (
                    "task.reassign",
                    {"task_id": task.pk, "assignee_id": self.mona.pk},
                    "reassign",
                    self.csm.pk,
                    {},
                ),
                (
                    "task.redate",
                    {
                        "task_id": task.pk,
                        "due_date": (today + timezone.timedelta(days=9)).isoformat(),
                    },
                    "redate",
                    task.due_date.isoformat(),
                    {"status": "applied", "applied_at": timezone.now(), "after": "x"},
                ),
                (
                    "task.complete",
                    {"task_id": task.pk, "because": "e"},
                    "complete",
                    {"status": "open", "blocked_reason": ""},
                    {},
                ),
                (
                    "task.create",
                    {
                        "title": "T",
                        "assignee_id": self.csm.pk,
                        "assignee_name": "Carl CSM",
                        "due_date": today.isoformat(),
                        "priority": "high",
                    },
                    "create",
                    None,
                    {},
                ),
                ("note.create", {"title": "N", "body": "b"}, "note", None, {}),
            ]
            for kind, payload, target, before, extra in specs:
                AgentAction.objects.create(
                    kind=kind,
                    payload=payload,
                    target=f"{target}{i}",
                    before=before,
                    **common,
                    **extra,
                )

    def count(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        client = self.client_for(self.csm)
        with CaptureQueriesContext(connection) as queries:
            response = client.get(LIST)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in queries).upper())
        return len(queries), len(response.data["results"])

    def test_the_query_count_does_not_grow_with_the_page(self):
        self.rows(0, 1)
        small, small_rows = self.count()
        self.rows(1, 4)
        large, large_rows = self.count()
        self.assertEqual((small_rows, large_rows), (8, 40))
        self.assertEqual(large, small)
        self.assertLessEqual(large, 20)


class ReaderRulesTests(MakesActions, AgentsFixture):
    """Hidden counts, filters that can't probe, the 404 body, and the
    undo reason of every applied attribute row."""

    def test_hidden_counts_records_only_not_workspace_level_actions(self):
        self.make(self.pizza)
        self.make(self.soup)
        AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:x",
            title="t",
            rationale="r",
            payload={},
        )
        data = self.client_for(self.csm).get(LIST).data
        self.assertEqual((data["count"], data["hidden"]), (1, 1))

    def test_a_filter_naming_a_hidden_record_is_an_empty_page(self):
        self.make(self.soup)
        data = self.client_for(self.csm).get(LIST, {"customer": self.soup.pk}).data
        self.assertEqual(
            data, {"count": 0, "next": None, "previous": None, "results": [], "hidden": 0}
        )
        data = self.client_for(self.csm).get(LIST, {"account": self.west.pk}).data
        self.assertEqual((data["count"], data["hidden"]), (0, 0))

    def test_a_404_carries_its_code(self):
        action = self.make(self.soup)
        response = self.client_for(self.csm).get(f"{LIST}{action.pk}/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data, {"code": "NO_SUCH_ACTION", "detail": "No such action."})

    def test_every_applied_attribute_action_is_judged_on_its_own_record(self):
        from services.attributes.models import AIAttribute, AIAttributeValue

        attribute = AIAttribute.objects.create(
            organisation=self.org, name="Score", api_name="score", prompt="p", value_type="number"
        )

        def applied(record, value_id):
            return AgentAction.objects.create(
                organisation=self.org,
                agent="cs",
                batch="b",
                kind="record.attribute",
                customer=record,
                target=f"attribute:{attribute.pk}",
                title="t",
                rationale="r",
                payload={"attribute_id": attribute.pk, "value": 5},
                status="applied",
                before=None,
                after=5,
                result={"value_id": value_id},
                applied_at=timezone.now(),
            )

        # The older action is unchanged; the newer one changed since.
        same = AIAttributeValue.objects.create(attribute=attribute, customer=self.pizza, value=5)
        unchanged = applied(self.pizza, same.pk)
        moved = AIAttributeValue.objects.create(attribute=attribute, customer=self.dough, value=5)
        changed = applied(self.dough, moved.pk)
        AIAttributeValue.objects.create(attribute=attribute, customer=self.dough, value=9)
        results = self.client_for(self.csm).get(LIST).data["results"]
        undo = {r["id"]: r["undo"] for r in results}
        self.assertTrue(undo[unchanged.pk]["allowed"])
        self.assertIsNone(undo[unchanged.pk]["reason"])
        self.assertEqual(undo[changed.pk]["reason"], "changed_since")


class FinalReviewApiTests(MakesActions, AgentsFixture):
    """Final review: undo's hint for task.complete, the owner-change right on
    undo and in Waiting, task titles a reader can't read, and date_passed."""

    def task(self, **fields):
        from datetime import timedelta

        from services.customers.models import Task

        fields.setdefault("customer", self.pizza)
        fields.setdefault("due_date", self.today + timedelta(days=3))
        return Task.objects.create(title=fields.pop("title", "Send the deck"), **fields)

    def test_an_untouched_completed_task_offers_undo(self):
        task = self.task(assignee=self.csm, created_by=self.csm)
        action = self.make(
            self.pizza,
            kind="task.complete",
            target=f"task:{task.pk}:status",
            payload={"task_id": task.pk, "because": "Renews in 30 days"},
            before={"status": task.status, "blocked_reason": ""},
        )
        response = run_one(self.client_for(self.csm), action)
        self.assertEqual(response.status_code, 200, response.data)
        undo = response.data["bundle"]["steps"][0]["undo"]
        self.assertEqual(undo["allowed"], True, undo)
        task.status = "pending"
        task.save(update_fields=["status"])
        detail = self.client_for(self.csm).get(f"{LIST}{action.pk}/").data
        self.assertEqual(detail["undo"]["reason"], "changed_since")

    def owner_change(self, **fields):
        from services.agents.tests.fixtures import viewer

        self.vic = viewer(self.org)
        return self.make(
            self.soup,
            kind="record.owner",
            target="owner",
            payload={"owner_id": self.mona.pk},
            **fields,
        )

    def test_undoing_an_owner_change_needs_the_owner_change_right(self):
        action = self.owner_change(
            status="applied",
            applied_at=timezone.now(),
            before=self.csm.pk,
            after=self.mona.pk,
            decided_by=self.admin,
        )
        vic = self.client_for(self.vic)
        self.assertEqual(vic.get(f"{LIST}{action.pk}/").data["undo"]["reason"], "cant_decide")
        response = vic.post(f"{LIST}{action.pk}/undo/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CANT_DECIDE")
        admin = self.client_for(self.admin).get(f"{LIST}{action.pk}/").data
        self.assertEqual(admin["undo"]["reason"], None)

    def test_rejecting_an_owner_change_needs_the_owner_change_right(self):
        action = self.owner_change(before=self.mona.pk)
        url = f"{BUNDLES}{action.bundle_id}/reject/"
        body = {"reason": "other"}
        response = self.client_for(self.vic).post(url, body, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CANT_REJECT")
        admin = self.client_for(self.admin).post(url, body, format="json")
        self.assertEqual(admin.status_code, 200, admin.data)
        self.assertEqual(admin.data["bundle"]["steps"][0]["status"], "rejected")

    def test_the_team_queue_offers_an_owner_change_only_to_who_may_make_it(self):
        self.owner_change(before=self.mona.pk)
        url = "/api/v1/work/feed/team/?scope=company"

        def can_decide(user):
            groups = self.client_for(user).get(url).data["groups"]
            # The row is opened; whether its step may be run is the bundle's can_run.
            return [
                i["detail"]["can_run"]
                for g in groups
                if g["key"] == "decide"
                for i in g["items"]
                if i["kind"] == "bundle"
            ]

        self.assertEqual(can_decide(self.vic), [False])
        self.assertEqual(can_decide(self.admin), [True])

    def test_a_task_title_only_for_readers_of_the_task(self):
        # Dana's own task on Carl's Pizza Hut: Carl opens the record, not the task.
        task = self.task(
            title="Dana's private follow-up", assignee=self.other, created_by=self.other
        )
        action = self.make(
            self.pizza,
            kind="task.redate",
            target=f"task:{task.pk}:due",
            payload={"task_id": task.pk, "due_date": (self.today.replace(day=1)).isoformat()},
            before=task.due_date.isoformat(),
        )
        carl = self.client_for(self.csm)
        listed = carl.get(LIST).data["results"][0]["preview"]["task"]
        self.assertEqual(listed, {"id": None, "title": "A task you can't see"})
        one = carl.get(f"{LIST}{action.pk}/").data["preview"]["task"]
        self.assertEqual(one["title"], "A task you can't see")
        admin = self.client_for(self.admin).get(LIST).data["results"][0]["preview"]["task"]
        self.assertEqual(admin["title"], "Dana's private follow-up")
        self.assertEqual(admin["id"], task.pk)

    def test_a_removed_tasks_preview_has_no_id(self):
        task = self.task(title="Call the sponsor", assignee=self.csm, created_by=self.csm)
        self.make(
            self.pizza,
            kind="task.redate",
            target=f"task:{task.pk}:due",
            payload={"task_id": task.pk, "due_date": self.today.isoformat()},
            before=task.due_date.isoformat(),
        )
        task.delete()
        listed = self.client_for(self.csm).get(LIST).data["results"][0]["preview"]["task"]
        self.assertEqual(listed, {"id": None, "title": "A removed task"})

    def test_a_task_whose_date_passed_expires_as_date_passed(self):
        from datetime import timedelta

        action = self.make(
            self.pizza,
            kind="task.create",
            target="task:call",
            payload={
                "title": "Call",
                "assignee_id": self.csm.pk,
                "assignee_name": "Carl CSM",
                "due_date": (self.today - timedelta(days=1)).isoformat(),
                "priority": "high",
            },
            before=None,
        )
        response = run_one(self.client_for(self.csm), action)
        # D14: 200 with the step and its bundle expired
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["bundle"]["status"], "expired")
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "expired")
        action.refresh_from_db()
        self.assertEqual(action.expired_reason, "date_passed")
