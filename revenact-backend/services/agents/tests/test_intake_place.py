"""Placing a thread's answer (agent bundles D2 contract §2.3, D2-14 to
D2-17, D2-19): a new message bundle, routed and titled; an untouched
waiting bundle's steps replaced and re-dated; superseded when nothing is
left to propose; a person's edits and the steps they name kept on a
refresh, renumbered; never a step that applies on its own."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from core.models import AuditEvent
from services.agents import intake_bundles
from services.agents.models import AgentBundle, AgentPolicy
from services.agents.policy import policy_for
from services.agents.prompt import ThreadAnswer
from services.agents.tests.bundle_fixtures import note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.metrics.models import AgentAction


class PlaceTests(IntakeFixture):
    def setUp(self):
        self.ticket, self.thread = self.ticket_thread(self.pizza)
        self.ctx, self.route = self.thread_ctx(self.thread)
        self.line = self.thread_line(self.ctx, "ticket ")

    def note_item(self, title="Login loop after reset", body="Customer locked out since Monday."):
        return {
            "kind": "note.create",
            "record": self.ctx.thread_ref,
            "title": f"Log: {title}",
            "rationale": "Locked out.",
            "evidence": [self.line],
            "payload": {"title": title, "body": body},
        }

    def draft_item(self):
        return {
            "kind": "draft.reply",
            "record": self.ctx.thread_ref,
            "title": "Reply to Ann",
            "rationale": "She waits.",
            "evidence": [self.line],
            "payload": {"ticket_id": self.ticket.pk, "body": "Hi Ann, we're on it."},
        }

    def place(self, *items, title="Pizza Hut: login loop", reason="They are locked out.", **kwargs):
        return intake_bundles.place(
            self.org,
            self.thread,
            self.route,
            "cs",
            ThreadAnswer(title, reason, list(items)),
            self.ctx,
            policy_for(self.org),
            timezone.now(),
            **kwargs,
        )

    def test_a_new_message_bundle_routed_and_titled(self):
        placed = self.place(self.note_item(), self.draft_item())
        bundle = placed.bundle
        self.assertTrue(placed.made)
        self.assertEqual(
            (bundle.source, bundle.thread_id, bundle.routed_to, bundle.routed_user_id),
            ("thread", self.thread.pk, "owner", self.csm.pk),
        )
        self.assertEqual(
            (bundle.title, bundle.reason), ("Pizza Hut: login loop", "They are locked out.")
        )
        self.assertEqual(
            list(bundle.steps.order_by("position").values_list("kind", "position", "status")),
            [("note.create", 1, "proposed"), ("draft.reply", 2, "proposed")],
        )

    def test_no_title_falls_back_to_the_first_step(self):
        bundle = self.place(self.note_item(), self.draft_item(), title="").bundle
        self.assertEqual(bundle.title, "Log: Login loop after reset, and 1 more")

    def test_nothing_to_do_makes_nothing(self):
        placed = self.place()
        self.assertIsNone(placed.bundle)
        self.assertFalse(AgentBundle.objects.exists())

    def test_an_untouched_bundle_is_replaced_and_redated(self):
        old = self.place(self.note_item()).bundle
        AgentBundle.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=3))
        placed = self.place(self.draft_item(), title="Pizza Hut: still locked out", into=old)
        bundle = placed.bundle
        self.assertEqual(
            (bundle.pk, placed.refreshed, placed.removed, placed.added), (old.pk, True, 1, 1)
        )
        self.assertEqual(list(bundle.steps.values_list("kind", "position")), [("draft.reply", 1)])
        self.assertGreater(bundle.created_at, timezone.now() - timedelta(minutes=1))
        self.assertIsNotNone(bundle.refreshed_at)
        self.assertEqual(bundle.title, "Pizza Hut: still locked out")

    def test_nothing_left_supersedes_an_untouched_bundle(self):
        old = self.place(self.note_item()).bundle
        placed = self.place(into=old)
        old.refresh_from_db()
        self.assertTrue(placed.superseded)
        self.assertEqual(
            (old.status, list(old.steps.values_list("expired_reason", flat=True))),
            ("superseded", ["replaced"]),
        )
        # The audit counts what stayed: the rolled-back renumbering removed nothing.
        event = AuditEvent.objects.filter(action="agent_bundle.refreshed").latest("id")
        self.assertEqual(
            event.metadata,
            {"by_run": True, "removed": 0, "kept": 0, "added": 0, "superseded": True},
        )
        self.assertEqual((placed.removed, placed.result.proposed), (0, 0))

    def test_an_edited_bundle_is_not_the_runs_to_replace(self):
        old = self.place(self.note_item()).bundle
        AgentBundle.objects.filter(pk=old.pk).update(edited_at=timezone.now())
        with self.assertRaises(intake_bundles.Changed):
            self.place(self.draft_item(), into=old)

    def test_a_refresh_keeps_the_edits_and_what_they_name(self):
        bundle = self.message_bundle(
            self.thread,
            note("Drop me", "Unedited."),
            (
                "task.create",
                {
                    "title": "Fix it",
                    "assignee_id": self.csm.pk,
                    "due_date": str(self.today),
                    "priority": "high",
                },
            ),
            note("Summary", "See {{step 2.task_url}}"),
        )
        one, two, three = bundle.steps.order_by("position")
        AgentAction.objects.filter(pk=three.pk).update(edited_at=timezone.now())
        keep = intake_bundles.keep_set(list(bundle.steps.order_by("position")))
        self.assertEqual([s.pk for s in keep], [two.pk, three.pk])
        bundle.refresh_from_db()
        placed = self.place(
            self.note_item(), into=bundle, keep=keep, expect=bundle.updated_at, by=self.csm
        )
        rows = list(
            placed.bundle.steps.order_by("position").values_list("pk", "position", "payload")
        )
        self.assertEqual([(pk, pos) for pk, pos, _ in rows][:2], [(two.pk, 1), (three.pk, 2)])
        self.assertEqual(rows[1][2]["body"], "See {{step 1.task_url}}")
        self.assertEqual((rows[2][1], placed.removed, placed.kept, placed.added), (3, 1, 2, 1))
        self.assertFalse(AgentAction.objects.filter(pk=one.pk).exists())
        self.assertFalse(placed.bundle.has_newer_message)

    def test_new_items_land_after_a_decided_step(self):
        # The Never sweep expires a step and leaves the bundle waiting.
        bundle = self.message_bundle(
            self.thread, ("record.lifecycle", {"stage": "renewal"}), note("Keep", "Mine.")
        )
        gone, mine = bundle.steps.order_by("position")
        AgentAction.objects.filter(pk=gone.pk).update(status="expired", expired_reason="never")
        AgentAction.objects.filter(pk=mine.pk).update(edited_at=timezone.now())
        keep = intake_bundles.keep_set(list(bundle.steps.order_by("position")))
        bundle.refresh_from_db()
        placed = self.place(
            self.note_item("First new"),
            self.note_item("Second new"),
            into=bundle,
            keep=keep,
            expect=bundle.updated_at,
            by=self.csm,
        )
        self.assertEqual((placed.added, placed.result.dropped, placed.kept), (2, 0, 1))
        rows = dict(placed.bundle.steps.values_list("pk", "position"))
        self.assertEqual(len(set(rows.values())), len(rows))
        self.assertEqual((rows[mine.pk], rows[gone.pk]), (1, 2))
        self.assertEqual(sorted(rows.values()), [1, 2, 3, 4])

    def test_a_refresh_refuses_a_bundle_changed_since_it_was_read(self):
        bundle = self.place(self.note_item()).bundle
        seen = bundle.updated_at
        AgentBundle.objects.filter(pk=bundle.pk).update(updated_at=seen + timedelta(seconds=1))
        with self.assertRaises(intake_bundles.Changed):
            self.place(self.draft_item(), into=bundle, expect=seen, by=self.csm)

    def test_flag_newer_and_the_waiting_bundle(self):
        bundle = self.place(self.note_item()).bundle
        self.assertEqual(intake_bundles.waiting_bundle(self.thread), bundle)
        intake_bundles.flag_newer(bundle)
        bundle.refresh_from_db()
        self.assertTrue(bundle.has_newer_message)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            created_at=timezone.now() - timedelta(days=15)
        )
        self.assertIsNone(intake_bundles.waiting_bundle(self.thread))

    def test_a_message_step_never_applies_on_its_own(self):
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": {"note.create": "auto"}}}
        )
        placed = self.place(self.note_item())
        self.assertEqual(list(placed.bundle.steps.values_list("status", flat=True)), ["proposed"])

    def test_a_workspace_level_item_never_lands_in_a_message_bundle(self):
        stray = {
            "kind": "initiative.create",
            "record": None,
            "title": "Start an initiative",
            "rationale": "Because.",
            "evidence": [self.line],
            "payload": {},
        }
        elsewhere = dict(self.note_item(), record="customer:%d" % self.taco.pk)
        with patch.object(intake_bundles, "_consider") as consider:
            placed = self.place(stray, elsewhere)
        consider.assert_not_called()
        self.assertEqual((placed.bundle, placed.result.dropped), (None, 2))
        self.assertFalse(AgentBundle.objects.exists())


class RenumberTests(IntakeFixture):
    def test_only_waiting_steps_are_removed_and_decided_ones_follow_the_kept(self):
        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note("One", "A"), note("Two", "B"), note("Three", "C"))
        first, second, third = bundle.steps.order_by("position")
        AgentAction.objects.filter(pk=second.pk).update(status="applied")
        removed, last = intake_bundles._renumber(bundle, [third])
        self.assertEqual((removed, last), (1, 2))
        self.assertFalse(AgentAction.objects.filter(pk=first.pk).exists())
        self.assertEqual(
            dict(bundle.steps.values_list("pk", "position")), {second.pk: 2, third.pk: 1}
        )
