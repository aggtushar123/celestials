"""The assignee picker (Work round §1.5): every member active for work
(`standing`) of the
workspace and whether they can open the record. One `can_open` per member;
a workspace's members are few (the query ceiling is pinned in
tests/test_assignees.py)."""

from services.accounts.models import User
from services.customers.scoping import can_open

from .standing import working_q


def build(reader, record):
    members = (
        # SOC2:AUTH-02 a suspended or revoked member is not offered work
        User.objects.filter(
            working_q(reader.organisation_id), organisation_id=reader.organisation_id
        )
        .select_related("organisation")
        .order_by("name", "id")
    )
    return {
        "people": [
            {
                "id": member.pk,
                "name": member.name,
                "function": member.function,
                # SOC2:AUTH-02 only people who can open the record may be given its work
                "can_open": can_open(member, record),
            }
            for member in members
        ]
    }
