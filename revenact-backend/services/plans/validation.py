"""What a plan or a template may say (spec §1.1, §1.4), and the exact UI
copy of every refusal: the frontend shows these words as they are.

Each check raises a DRF `ValidationError` keyed by the field at fault. A
template's (or a plan's) milestones are checked one by one, and the errors
are a list aligned with them (`{}` for a good one), each milestone's task
errors aligned under its `tasks`, so a 400 points at the exact field. Text
is trimmed and unknown keys are dropped."""

from datetime import date, timedelta

from rest_framework.exceptions import ValidationError

from services.accounts.models import User
from services.customers.models import Task
from services.customers.scoping import can_open

from .models import (
    MAX_DESCRIPTION,
    MAX_MILESTONES,
    MAX_NAME,
    MAX_OFFSET,
    MAX_OWNED_TEMPLATES,
    MAX_SHARED,
    MAX_TASK_TITLE,
    MAX_TASKS,
    PlanTemplate,
)

CHOOSE_NAME = "Give it a name."
LONG_NAME = f"Keep the name to {MAX_NAME} characters."
LONG_DESCRIPTION = f"Keep the description to {MAX_DESCRIPTION} characters."
CHOOSE_KIND = "Choose a kind."
CHOOSE_SHARING = "Choose who can see it."
NO_TEAMMATES = "Choose at least one teammate."
TOO_MANY_SHARED = f"Share with at most {MAX_SHARED} teammates."
TEMPLATE_LIMIT = f"You can own at most {MAX_OWNED_TEMPLATES} templates."
MILESTONE_COUNT = f"Choose 1 to {MAX_MILESTONES} milestones."
TOO_MANY_MILESTONES = f"A plan holds at most {MAX_MILESTONES} milestones."
LAST_MILESTONE = "A plan needs at least one milestone."
TOO_MANY_TASKS = f"Keep it to {MAX_TASKS} tasks in all."
CHOOSE_TASKS = "List the milestone's tasks."
NO_TITLE = "Give the task a title."
LONG_TITLE = f"Keep the title to {MAX_TASK_TITLE} characters."
CHOOSE_PRIORITY = "Choose high, medium or low."
CHOOSE_TASK_STATUS = "Choose pending, in progress or completed."
OFFSET_RANGE = f"Choose 0 to {MAX_OFFSET} days."
CHOOSE_ROLE = "Choose the plan's owner or the record's owner."
CHOOSE_TEMPLATE = "Choose a template you can use."
CHOOSE_RECORD = "Choose an organisation or an account."
CANT_OPEN_ORGANISATION = "Choose an organisation you can open."
CANT_OPEN_ACCOUNT = "Choose an account you can open."
CANT_OPEN = "They can't open this record."
CHOOSE_OWNER = "Choose who owns the plan."
CHOOSE_ASSIGNEE = "Choose who does it."
CHOOSE_DATE = "Choose a date."
DATE_RANGE = "Choose a date from the start date to a year after it."
CHOOSE_MILESTONE = "Choose a milestone in this plan."
REORDER = "List every milestone once."
YES_OR_NO = "Must be true or false."
CHOOSE_STATUS = "Choose on track, at risk, cancelled or done."
DONE_NEEDS_MILESTONES = "Mark every milestone done first."
PLAN_FINISHED = "This plan is finished; only its tasks can change."
PLAN_OPEN = "This record already has an open plan from this template."
HAS_DONE_WORK = "Cancel it instead: some of its work is done."
MILESTONE_HAS_DONE_WORK = "Some of its work is done; mark it done instead."
SEND_AN_OBJECT = "Send the fields as one object."


def integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def task_count(milestones):
    return sum(len(milestone["tasks"]) for milestone in milestones)


def _text(item, key, limit, too_long, missing):
    """`item[key]`, required, trimmed, at most `limit` characters."""
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({key: [missing]})
    value = value.strip()
    if len(value) > limit:
        raise ValidationError({key: [too_long]})
    return value


def _offset(item):
    value = item.get("offset_days")
    if not integer(value) or not 0 <= value <= MAX_OFFSET:
        raise ValidationError({"offset_days": [OFFSET_RANGE]})
    return value


def _priority(item):
    priority = item.get("priority")
    if priority not in Task.Priority.values:
        raise ValidationError({"priority": [CHOOSE_PRIORITY]})
    return priority


def _aligned(items, clean):
    """`clean` each item (a non-object reads as `{}`); the errors are a list
    aligned with the items, `{}` for a good one."""
    cleaned, errors = [], []
    for item in items:
        try:
            cleaned.append(clean(item if isinstance(item, dict) else {}))
            errors.append({})
        except ValidationError as exc:
            errors.append(exc.detail)
    return cleaned, errors


def _tasks(item, clean):
    tasks = item.get("tasks", [])
    if not isinstance(tasks, list):
        raise ValidationError({"tasks": [CHOOSE_TASKS]})
    if len(tasks) > MAX_TASKS:
        raise ValidationError({"tasks": [TOO_MANY_TASKS]})
    cleaned, errors = _aligned(tasks, clean)
    if any(errors):
        raise ValidationError({"tasks": errors})
    return cleaned


def _milestones(value, clean):
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_MILESTONES:
        raise ValidationError({"milestones": [MILESTONE_COUNT]})
    cleaned, errors = _aligned(value, clean)
    if any(errors):
        raise ValidationError({"milestones": errors})
    if task_count(cleaned) > MAX_TASKS:
        raise ValidationError({"milestones": [TOO_MANY_TASKS]})
    return cleaned


def _template_task(item):
    title = _text(item, "title", MAX_TASK_TITLE, LONG_TITLE, NO_TITLE)
    priority = _priority(item)
    offset = _offset(item)
    role = item.get("assignee_role", PlanTemplate.AssigneeRole.RECORD_OWNER)
    if role not in PlanTemplate.AssigneeRole.values:
        raise ValidationError({"assignee_role": [CHOOSE_ROLE]})
    return {"title": title, "priority": priority, "offset_days": offset, "assignee_role": role}


def _template_milestone(item):
    name = _text(item, "name", MAX_NAME, LONG_NAME, CHOOSE_NAME)
    offset = _offset(item)
    return {"name": name, "offset_days": offset, "tasks": _tasks(item, _template_task)}


def clean_template_milestones(value):
    """A template's 1-12 milestones, at most 50 tasks in all, normalised:
    `assignee_role` defaults to `record_owner`."""
    return _milestones(value, _template_milestone)


def in_range(day, start_date):
    """A plan's dates lie from its start to a year after it."""
    return start_date <= day <= start_date + timedelta(days=MAX_OFFSET)


def parse_date(value):
    """A `YYYY-MM-DD` string (or a date) as a date; None for anything else."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _date(item, start_date):
    day = parse_date(item.get("due_date"))
    if day is None:
        raise ValidationError({"due_date": [CHOOSE_DATE]})
    if not in_range(day, start_date):
        raise ValidationError({"due_date": [DATE_RANGE]})
    return day


def assignable(organisation_id, pk, record, field):
    """The active member `pk` of the workspace who may open `record`; else a
    refusal at `field` ("They can't open this record.")."""
    if not integer(pk):
        raise ValidationError({field: [CHOOSE_OWNER if field == "owner" else CHOOSE_ASSIGNEE]})
    user = User.objects.filter(pk=pk, organisation_id=organisation_id, is_active=True).first()
    # SOC2:AUTH-02 a plan's owner and assignees are teammates who can open its record
    if user is None or not can_open(user, record):
        raise ValidationError({field: [CANT_OPEN]})
    return user


def clean_plan_milestones(value, *, start_date, organisation_id, record):
    """The New plan modal's edited copy: 1-12 milestones `{name, due_date,
    tasks: [{title, priority, due_date, assignee}]}`, at most 50 tasks, every
    date from the start to a year after it, every assignee someone who can
    open the record. Returns the same shape with dates and `User`s."""
    people = {}

    def assignee(pk):
        if integer(pk) and pk in people:
            return people[pk]
        user = assignable(organisation_id, pk, record, "assignee")
        people[pk] = user
        return user

    def task(item):
        return {
            "title": _text(item, "title", MAX_TASK_TITLE, LONG_TITLE, NO_TITLE),
            "priority": _priority(item),
            "due_date": _date(item, start_date),
            "assignee": assignee(item.get("assignee")),
        }

    def milestone(item):
        return {
            "name": _text(item, "name", MAX_NAME, LONG_NAME, CHOOSE_NAME),
            "due_date": _date(item, start_date),
            "tasks": _tasks(item, task),
        }

    return _milestones(value, milestone)
