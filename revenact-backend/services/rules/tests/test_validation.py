"""What a rule may say: the trigger's own fields, one to three actions, each
checked against the segment's kind, with the 400 at the field named. A
segment must be the owner's own; a rule lent to the test endpoint too."""

from types import SimpleNamespace
from unittest.mock import patch

from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from services.accounts.models import User
from services.rules import validation as say
from services.rules.serializers import (
    NO_TEAMMATES,
    TOO_MANY_SHARED,
    RuleTestSerializer,
    RuleWriteSerializer,
)
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, SURVEY, TASK, RuleFixture
from services.surveys.serializers import NO_ROLES


class Validation(RuleFixture):
    serializer = RuleWriteSerializer

    def check(self, *, user=None, instance=None, **body):
        """(validated data or None, errors) for a create, or for a PATCH of
        `instance` with only `body`."""
        if instance is None:
            body = {
                "name": "Watch",
                "segment": self.book.pk,
                "trigger": "entered",
                "actions": [NOTIFY_ME],
                **body,
            }
        serializer = self.serializer(
            instance,
            data=body,
            partial=instance is not None,
            context={"request": SimpleNamespace(user=user or self.csm)},
        )
        valid = serializer.is_valid()
        return (serializer.validated_data if valid else None), serializer.errors

    def crossing(self, **fields):
        return {
            "trigger": "crossed",
            "score": "csat",
            "direction": "below",
            "threshold": 60,
            **fields,
        }


class TriggerTests(Validation):
    def test_a_simple_rule_is_valid_and_normalised(self):
        data, errors = self.check(score="csat", cadence="weekly", weekday=2)
        self.assertEqual(errors, {})
        self.assertEqual(
            {key: data[key] for key in say.TRIGGER_FIELDS},
            {
                "trigger": "entered",
                "score": "",
                "direction": "",
                "threshold": None,
                "cadence": "",
                "weekday": None,
            },
        )
        self.assertEqual((data["segment"], data["actions"]), (self.book, [NOTIFY_ME]))

    def test_crossed_needs_a_score_a_direction_and_a_threshold(self):
        _data, errors = self.check(trigger="crossed")
        self.assertEqual(
            errors,
            {
                "score": [say.CHOOSE_SCORE],
                "direction": [say.CHOOSE_DIRECTION],
                "threshold": [say.CHOOSE_THRESHOLD],
            },
        )

    def test_each_score_has_its_range(self):
        cases = [
            ("csat", 0, True),
            ("csat", 100, True),
            ("csat", 101, False),
            ("ces", -1, False),
            ("nps", -100, True),
            ("nps", -101, False),
            ("health", 10, True),
            ("health", "10.5", False),
        ]
        for score, threshold, ok in cases:
            with self.subTest(score=score, threshold=threshold):
                _data, errors = self.check(**self.crossing(score=score, threshold=threshold))
                expected = {} if ok else {"threshold": [say.threshold_range(score)]}
                self.assertEqual(errors, expected)

    def test_contacts_have_no_scores(self):
        people = self.pinned("contact", [self.ann], name="People")
        _data, errors = self.check(segment=people.pk, **self.crossing())
        self.assertEqual(errors, {"trigger": [say.NO_CONTACT_SCORES]})

    def test_accounts_have_no_ces(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        _data, errors = self.check(segment=accounts.pk, **self.crossing(score="ces"))
        self.assertEqual(errors, {"score": [say.NO_ACCOUNT_CES]})
        _data, errors = self.check(segment=accounts.pk, **self.crossing(score="nps", threshold=0))
        self.assertEqual(errors, {})

    def test_weekly_needs_a_weekday_and_monthly_drops_it(self):
        _data, errors = self.check(trigger="schedule", cadence="weekly")
        self.assertEqual(errors, {"weekday": [say.CHOOSE_WEEKDAY]})
        _data, errors = self.check(trigger="schedule", cadence="weekly", weekday=7)
        self.assertEqual(errors, {"weekday": [say.CHOOSE_WEEKDAY]})
        _data, errors = self.check(trigger="schedule")
        self.assertEqual(errors, {"cadence": [say.CHOOSE_CADENCE]})
        data, _errors = self.check(trigger="schedule", cadence="monthly", weekday=3)
        self.assertEqual((data["cadence"], data["weekday"]), ("monthly", None))

    def test_the_cooldown_is_1_to_365_days(self):
        for days, ok in ((0, False), (1, True), (365, True), (366, False)):
            with self.subTest(days=days):
                _data, errors = self.check(cooldown_days=days)
                self.assertEqual("cooldown_days" in errors, not ok)

    def test_a_segment_is_required(self):
        _data, errors = self.check(segment=None)
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})

    def test_the_segment_must_be_the_owners_own(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        with self.assertRaises(PermissionDenied):
            self.check(segment=danas.pk)
        private = self.pinned("customer", [self.taco], owner=self.other, name="Private")
        with self.assertRaises(Http404):
            self.check(segment=private.pk)

    def test_a_name_is_at_most_120_characters(self):
        _data, errors = self.check(name="x" * 121)
        self.assertIn("name", errors)


class ActionTests(Validation):
    def actions(self, *actions, segment=None):
        extra = {} if segment is None else {"segment": segment.pk}
        return self.check(actions=list(actions), **extra)

    def test_one_to_three_actions(self):
        for actions in ([], [NOTIFY_ME, TASK, LIFECYCLE, SURVEY], "notify", {"action": "notify"}):
            with self.subTest(actions=actions):
                _data, errors = self.check(actions=actions)
                self.assertEqual(errors, {"actions": [say.ACTION_COUNT]})

    def test_all_four_together_minus_one_are_fine(self):
        data, errors = self.actions(TASK, LIFECYCLE, SURVEY)
        self.assertEqual(errors, {})
        self.assertEqual(data["actions"], [TASK, LIFECYCLE, SURVEY])

    def test_each_action_once(self):
        _data, errors = self.actions(NOTIFY_ME, NOTIFY_ME)
        self.assertEqual(errors, {"actions": [{}, {"action": [say.ONE_OF_EACH]}]})

    def test_errors_point_at_the_action_and_its_field(self):
        _data, errors = self.actions(NOTIFY_ME, {**TASK, "title": "  "})
        self.assertEqual(errors, {"actions": [{}, {"title": [say.NO_TITLE]}]})
        _data, errors = self.actions({"action": "email"}, ["notify"])
        self.assertEqual(
            errors,
            {"actions": [{"action": [say.CHOOSE_ACTION]}, {"action": [say.CHOOSE_ACTION]}]},
        )

    def test_unknown_keys_are_dropped_and_text_trimmed(self):
        data, _errors = self.actions({**TASK, "title": "  Call them ", "colour": "red"})
        self.assertEqual(data["actions"], [TASK])

    def test_notify_settings(self):
        cases = [
            ({"to": "everyone"}, {"to": [say.CHOOSE_RECIPIENTS]}),
            ({"message": "x" * 281}, {"message": [say.LONG_MESSAGE]}),
            ({"to": "people", "people": []}, {"people": [say.NO_PEOPLE]}),
            ({"to": "people", "people": ["3"]}, {"people": [say.NO_PEOPLE]}),
            ({"to": "people", "people": list(range(1, 52))}, {"people": [say.TOO_MANY_PEOPLE]}),
            ({"to": "people", "people": [self.stranger.pk]}, {"people": [say.UNKNOWN_PEOPLE]}),
        ]
        for change, error in cases:
            with self.subTest(change=change):
                _data, errors = self.actions({**NOTIFY_ME, **change})
                self.assertEqual(errors, {"actions": [error]})

    def test_notify_people_are_active_teammates_once_each(self):
        data, _errors = self.actions(
            {**NOTIFY_ME, "to": "people", "people": [self.other.pk, self.other.pk]}
        )
        self.assertEqual(data["actions"][0]["people"], [self.other.pk])
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        _data, errors = self.actions({**NOTIFY_ME, "to": "people", "people": [self.other.pk]})
        self.assertEqual(errors, {"actions": [{"people": [say.UNKNOWN_PEOPLE]}]})

    def test_people_are_kept_only_for_people(self):
        data, _errors = self.actions({**NOTIFY_ME, "people": [self.other.pk]})
        self.assertEqual(data["actions"][0]["people"], [])

    def test_task_settings(self):
        cases = [
            ({"title": "x" * 201}, {"title": [say.LONG_TITLE]}),
            ({"title": None}, {"title": [say.NO_TITLE]}),
            ({"assignee": "dana"}, {"assignee": [say.CHOOSE_ASSIGNEE]}),
            ({"due_in_days": 91}, {"due_in_days": [say.DUE_RANGE]}),
            ({"due_in_days": -1}, {"due_in_days": [say.DUE_RANGE]}),
            ({"due_in_days": True}, {"due_in_days": [say.DUE_RANGE]}),
        ]
        for change, error in cases:
            with self.subTest(change=change):
                _data, errors = self.actions({**TASK, **change})
                self.assertEqual(errors, {"actions": [error]})

    def test_a_task_defaults_to_the_record_owner_in_a_week(self):
        data, _errors = self.actions({"action": "task", "title": "Call them"})
        self.assertEqual(
            data["actions"],
            [
                {
                    "action": "task",
                    "title": "Call them",
                    "assignee": "record_owner",
                    "due_in_days": 7,
                }
            ],
        )

    def test_lifecycle_settings(self):
        _data, errors = self.actions({**LIFECYCLE, "stage": "dormant"})
        self.assertEqual(errors, {"actions": [{"stage": [say.CHOOSE_STAGE]}]})
        people = self.pinned("contact", [self.ann], name="People")
        _data, errors = self.actions(LIFECYCLE, segment=people)
        self.assertEqual(errors, {"actions": [{"action": [say.NO_CONTACT_LIFECYCLE]}]})

    def test_survey_settings(self):
        cases = [
            ({"survey_type": "poll"}, {"survey_type": [say.CHOOSE_SURVEY_TYPE]}),
            ({"subject": ""}, {"subject": [say.NO_SUBJECT]}),
            ({"subject": "x" * 121}, {"subject": [say.LONG_SUBJECT]}),
            ({"intro": "x" * 501}, {"intro": [say.LONG_INTRO]}),
            ({"roles": ["boss"]}, {"roles": [say.CHOOSE_ROLES]}),
            ({"roles": []}, {"roles": [NO_ROLES]}),
            ({"without_review": "yes"}, {"without_review": [say.YES_OR_NO]}),
        ]
        for change, error in cases:
            with self.subTest(change=change):
                _data, errors = self.actions({**SURVEY, **change})
                self.assertEqual(errors, {"actions": [error]})

    def test_a_survey_defaults_to_review_and_a_contact_segment_needs_no_roles(self):
        bare = {"action": "survey", "survey_type": "csat", "subject": "Hi", "roles": ["champion"]}
        data, _errors = self.actions(bare)
        self.assertEqual(
            data["actions"],
            [{**bare, "intro": "", "without_review": False}],
        )
        people = self.pinned("contact", [self.ann], name="People")
        data, _errors = self.actions(SURVEY, segment=people)
        self.assertEqual(data["actions"][0]["roles"], [])


class EditTests(Validation):
    def test_an_edit_checks_the_merged_rule(self):
        rule = self.make_rule(**self.crossing())
        _data, errors = self.check(instance=rule, threshold=101)
        self.assertEqual(errors, {"threshold": [say.threshold_range("csat")]})
        people = self.pinned("contact", [self.ann], name="People")
        _data, errors = self.check(instance=rule, segment=people.pk)
        self.assertEqual(errors, {"trigger": [say.NO_CONTACT_SCORES]})

    def test_a_rename_leaves_the_trigger_and_actions_alone(self):
        data, errors = self.check(instance=self.make_rule(), name="Renamed")
        self.assertEqual((errors, dict(data)), ({}, {"name": "Renamed"}))

    def test_a_rule_without_its_segment_may_be_renamed_but_not_turned_on(self):
        rule = self.make_rule(is_active=False)
        rule.segment = None
        _data, errors = self.check(instance=rule, name="Renamed")
        self.assertEqual(errors, {})
        _data, errors = self.check(instance=rule, is_active=True)
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})

    def test_an_active_rule_whose_segment_was_deleted_may_still_be_renamed(self):
        # before tonight's step pauses it, the rule is still on with no segment
        rule = self.make_rule(is_active=True)
        rule.segment = None
        data, errors = self.check(instance=rule, name="Renamed")
        self.assertEqual((errors, dict(data)), ({}, {"name": "Renamed"}))
        _data, errors = self.check(instance=rule, trigger="left")
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})
        _data, errors = self.check(instance=rule, segment=None)
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})

    def test_turning_on_a_rule_with_no_segment_is_refused(self):
        rule = self.make_rule(is_active=False)
        rule.segment = None
        _data, errors = self.check(instance=rule, is_active=True, name="Back")
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})

    def test_sharing_with_more_than_the_limit_is_refused_by_a_named_message(self):
        self.assertEqual(TOO_MANY_SHARED, "Share with at most 50 teammates.")
        with patch("services.rules.serializers.MAX_SHARED", 1):
            _data, errors = self.check(sharing="people", shared_with=[self.admin.pk, self.other.pk])
        self.assertEqual(errors, {"shared_with": [TOO_MANY_SHARED]})

    def test_sharing_by_name_needs_teammates_and_workspace_clears_them(self):
        _data, errors = self.check(sharing="people", shared_with=[])
        self.assertEqual(errors, {"shared_with": [NO_TEAMMATES]})
        data, _errors = self.check(sharing="workspace", shared_with=[self.other.pk])
        self.assertEqual(data["shared_with"], [])
        _data, errors = self.check(sharing="people", shared_with=[self.stranger.pk])
        self.assertIn("shared_with", errors)


class TestSerializerTests(Validation):
    serializer = RuleTestSerializer

    def test_a_name_is_not_needed(self):
        data, errors = self.check(name="")
        self.assertEqual((errors, data["name"]), ({}, ""))

    def test_a_saved_rule_of_the_callers_lends_itself(self):
        rule = self.make_rule()
        data, _errors = self.check(rule=rule.pk)
        self.assertEqual(data["rule"], rule)

    def test_anyone_elses_rule_is_403_or_404(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, name="Dana's")
        shared = self.make_rule(owner=self.other, segment=danas, sharing="workspace")
        with self.assertRaises(PermissionDenied):
            self.check(rule=shared.pk)
        private = self.make_rule(owner=self.other, segment=danas)
        with self.assertRaises(Http404):
            self.check(rule=private.pk)
