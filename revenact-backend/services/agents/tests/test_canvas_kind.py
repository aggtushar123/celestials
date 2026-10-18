"""canvas.create (contract, owner decision 2): a map of a record's people,
laid out by role with no links, citing the record's people line; applied as
the approver from the people they may open; undo while its version is the
one applied."""

from django.db import transaction

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import bulk, evidence
from services.agents.actions import canvases
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.builder_fixtures import builder_action
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Canvas, Contact
from services.surveys.tests.fixtures import contact

CREATE = canvases.CREATE


class CanvasKindTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.tia = contact(cls.taco, "Tia", Contact.Role.CHAMPION)
        cls.eve = contact(cls.east, "Eve", Contact.Role.DECISION_MAKER)
        cls.tom = contact(cls.west, "Tom", Contact.Role.OTHER)

    def action(self, record=None, agent="cs"):
        record = record or self.taco
        return builder_action(
            self.org,
            "canvas.create",
            {"name": "Taco people"},
            record=record,
            agent=agent,
            target="canvas",
        )

    def applied(self, actor):
        action = self.action()
        action.after, action.result = CREATE.apply(action, actor)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def test_the_kind(self):
        self.assertEqual(
            (CREATE.label, CREATE.max_level, CREATE.agents),
            ("Map a record's people", "ask", ("cs", "sales", "ops")),
        )
        self.assertTrue(CREATE.builder and CREATE.per_reader)
        self.assertFalse(CREATE.workspace_level)

    def test_validate_needs_the_people_line_cited(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        row = ctx.records[f"customer:{self.taco.pk}"]
        line = row["people"]
        self.assertEqual(line, "people: 3 (decision maker 1, champion 1, other 1)")
        self.assertEqual(CREATE.validate({"name": " Map "}, row, ctx, [line]), {"name": "Map"})
        self.assertEqual(CREATE.target({"name": "Map"}), "canvas")
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "Map"}, row, ctx, ["something else"])
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "x" * 121}, row, ctx, [line])
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "Map"}, None, ctx, [line])
        nobody = ctx.records[f"customer:{self.dough.pk}"]
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "Map"}, nobody, ctx, ["people: 0"])

    def test_the_preview_counts_the_readers_people(self):
        action = self.action()
        self.assertEqual(
            CREATE.preview(action, self.other), {"canvas": {"name": "Taco people", "people": 3}}
        )
        self.assertEqual(CREATE.preview(action, self.csm)["canvas"]["people"], 2)
        with bulk.using([action]):
            self.assertEqual(CREATE.preview(action, self.csm)["canvas"]["people"], 2)

    def test_apply_maps_the_people_the_approver_may_open(self):
        action = self.applied(self.csm)
        canvas = Canvas.objects.get(pk=action.result["canvas_id"])
        on_map = {node["data"]["contact_id"] for node in canvas.nodes}
        self.assertEqual(on_map, {self.tia.pk, self.eve.pk})
        self.assertEqual(
            (canvas.customer, canvas.edges, canvas.created_by, canvas.agent_action),
            (self.taco, [], self.csm, action),
        )
        self.assertEqual(action.after, {"canvas_id": canvas.pk, "version": 1})
        event = AuditEvent.objects.get(action="canvas.created")
        self.assertEqual(
            (event.actor, event.target_repr, event.metadata),
            (
                self.csm,
                f"Canvas {canvas.pk}",
                {"start": "people", "nodes": 2, "agent_action": action.pk},
            ),
        )

    def test_apply_is_stale_without_a_person_or_anyone_to_map(self):
        # One open map proposal per record: the same action, two approvers.
        action = self.action()
        with self.assertRaises(Stale):
            CREATE.apply(action, None)
        with self.assertRaises(Stale):
            CREATE.apply(action, self.lee)
        with self.assertRaises(Stale):
            CREATE.apply(self.action(record=self.dough), self.csm)

    def test_apply_is_stale_when_the_approver_may_open_none_of_its_people(self):
        # The record still has Tom (on an account the approver may not open),
        # and the approver may open the record itself.
        Contact.objects.filter(pk__in=[self.tia.pk, self.eve.pk]).delete()
        action = self.action()
        self.assertEqual(CREATE.preview(action, self.csm)["canvas"]["people"], 0)
        self.assertEqual(CREATE.preview(action, self.other)["canvas"]["people"], 1)
        with self.assertRaises(Stale):
            CREATE.apply(action, self.csm)
        self.assertFalse(Canvas.objects.exists())
        self.assertFalse(AuditEvent.objects.filter(action="canvas.created").exists())

    def test_undo_deletes_it_until_it_is_edited(self):
        action = self.applied(self.other)
        canvas_id = action.result["canvas_id"]
        Canvas.objects.filter(pk=canvas_id).update(version=2)
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            CREATE.undo(action, self.other)
        self.assertEqual(caught.exception.detail, "This map has been edited since.")
        Canvas.objects.filter(pk=canvas_id).update(version=1)
        with transaction.atomic():
            CREATE.undo(action, self.other)
        self.assertFalse(Canvas.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="canvas.deleted").actor, self.other)
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            CREATE.undo(action, self.other)
        self.assertEqual(caught.exception.detail, "This map has been deleted.")
