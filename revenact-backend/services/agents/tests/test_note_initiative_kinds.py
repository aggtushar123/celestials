"""note.create files a note in the agent's name; initiative.create starts
a decision on a number (Ops only), and undo closes it while nothing hangs
off it."""

from unittest.mock import patch

from services.agents.actions import initiatives, notes
from services.agents.evidence import Context
from services.agents.kinds import ChangedSince, Invalid
from services.agents.tests.fixtures import AgentsFixture
from services.agents.tests.test_record_kinds import row_for
from services.customers.models import Note
from services.metrics.models import AgentAction, Initiative


class NoteTests(AgentsFixture):
    def action(self, payload):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:x",
            title="t",
            rationale="r",
            payload=payload,
        )

    def test_a_note_in_the_agents_name_and_undo_until_edited(self):
        ctx = Context(self.org, "cs", self.today)
        clean = notes.CREATE.validate(
            {"title": "Renewal call", "body": "Asked for a 2-year term."},
            row_for(self.pizza),
            ctx,
            [],
        )
        action = self.action(clean)
        action.after, action.result = notes.CREATE.apply(action, None)
        note = Note.objects.get(pk=action.result["note_id"])
        self.assertEqual((note.author_id, note.author_name), (None, "CS agent"))
        notes.CREATE.undo(action, self.mona)
        self.assertFalse(Note.objects.filter(pk=note.pk).exists())

        action.after, action.result = notes.CREATE.apply(action, None)
        Note.objects.filter(pk=action.result["note_id"]).update(body="Edited by Carl")
        with self.assertRaises(ChangedSince):
            notes.CREATE.undo(action, self.mona)

    def test_a_note_is_logged_on_the_workspaces_today(self):
        from datetime import date

        day = date(2026, 1, 2)
        action = self.action({"title": "Renewal call", "body": "Asked for terms."})
        with patch("services.agents.actions.notes.today_for", return_value=day) as today_for:
            action.after, action.result = notes.CREATE.apply(action, None)
        self.assertEqual(Note.objects.get(pk=action.result["note_id"]).logged_at, day)
        self.assertEqual(today_for.call_args.args[0].pk, self.org.pk)

    def test_empty_or_long_notes_are_refused(self):
        ctx = Context(self.org, "cs", self.today)
        for bad in ({"title": "", "body": "x"}, {"title": "x", "body": "y" * 4001}):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                notes.CREATE.validate(bad, row_for(self.pizza), ctx, [])


class InitiativeTests(AgentsFixture):
    def test_starts_and_closes_while_nothing_hangs_off_it(self):
        payload = {
            "metric": "at_risk_arr",
            "metric_label": "ARR at risk",
            "dimension": "",
            "member": "",
            "member_label": "",
            "target_value": 1000.0,
            "target_by": (self.today.replace(day=1)).isoformat(),
        }
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:at_risk_arr::",
            title="Halve ARR at risk",
            rationale="r",
            payload=payload,
        )
        with patch("services.metrics.initiatives.Figures") as figures:
            figures.return_value.value_of.return_value = 2000
            action.after, action.result = initiatives.CREATE.apply(action, self.admin)
        initiative = Initiative.objects.get(pk=action.result["initiative_id"])
        self.assertEqual(initiative.status, Initiative.Status.ACTIVE)
        initiatives.CREATE.undo(action, self.admin)
        initiative.refresh_from_db()
        self.assertEqual(initiative.status, Initiative.Status.ABANDONED)

    def test_a_non_finite_target_is_refused(self):
        figures = {"cuts": []}
        ctx = Context(self.org, "ops", self.today, figures=figures)
        with patch(
            "services.metrics.proposals._validate",
            return_value={"target_value": float("nan")},
        ):
            with self.assertRaises(Invalid):
                initiatives.CREATE.validate({}, None, ctx, [])

    def test_undo_refuses_with_live_work_linked_and_a_closed_initiative(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:x::",
            title="T",
            rationale="r",
            payload={
                "metric": "at_risk_arr",
                "dimension": "",
                "member": "",
                "member_label": "",
                "target_value": 1.0,
                "target_by": self.today.isoformat(),
            },
        )
        with patch("services.metrics.initiatives.Figures") as figures:
            figures.return_value.value_of.return_value = 2000
            action.after, action.result = initiatives.CREATE.apply(action, self.admin)
        initiative = Initiative.objects.get(pk=action.result["initiative_id"])
        other = AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="task.create",
            customer=self.pizza,
            target="task:y",
            title="T",
            rationale="r",
            payload={},
            initiative=initiative,
        )
        with self.assertRaises(ChangedSince) as caught:
            initiatives.CREATE.undo(action, self.admin)
        self.assertEqual(caught.exception.detail, "Work is linked to this initiative now.")
        # Expired work does not hold it open.
        AgentAction.objects.filter(pk=other.pk).update(status="expired")
        Initiative.objects.filter(pk=initiative.pk).update(status="done")
        with self.assertRaises(ChangedSince):
            initiatives.CREATE.undo(action, self.admin)
