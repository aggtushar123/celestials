"""A scope's figures: every metric and every cut, recomputed over the
scope's own book in one pass over the sources. Percent metrics cannot be
added up, so a team's NRR is the NRR of the team's customers, never a sum or
a mean of its members'."""

from dataclasses import dataclass

from services.customers.scoping import visible_customers
from services.metrics.registry import compute_figures
from services.metrics.signals import number


@dataclass(frozen=True)
class Figures:
    #: {metric key: number | None}
    values: dict
    #: {metric key: {dimension: [(member, label, number | None)]}}
    slices: dict
    #: Every customer id in the scope's book (archived and churned too);
    #: None for Company, which has no handovers.
    book: frozenset | None


def figures(scope):
    organisation = scope.actor.organisation
    values, slices = compute_figures(organisation, actor=scope.actor)
    book = None
    if not scope.is_company:
        book = frozenset(visible_customers(scope.actor).values_list("id", flat=True))
    return Figures(
        values={key: number(value) for key, value in values.items()},
        slices={
            key: {
                dimension: [(member, label, number(value)) for member, label, value in members]
                for dimension, members in cuts.items()
            }
            for key, cuts in slices.items()
        },
        book=book,
    )


def stored_slices(slices):
    """`Figures.slices` as a ScopeSnapshot keeps them: labels dropped, a
    member's id is what a later month finds it by."""
    return {
        key: {
            dimension: {member: value for member, _label, value in members}
            for dimension, members in cuts.items()
        }
        for key, cuts in slices.items()
    }
