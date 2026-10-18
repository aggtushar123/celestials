"""What's being done: BrainFixture's people and book, plus makers for
initiatives (this task), plans and rules (later tasks). Carl (CSM) reports
to Mona; Dana is nobody's; Alice has view_all_accounts; Lee reads Company
through Leadership only."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from services.accounts.models import User
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.metrics.models import Initiative
from services.plans.models import Milestone, Plan
from services.rules.models import Rule, RuleRun, RuleRunRecord, empty_skips


class DoingFixture(BrainFixture):
    def initiative(
        self,
        owner=None,
        *,
        cut=None,
        metric="at_risk_arr",
        status="active",
        closed_days_ago=None,
        target_in=60,
        title="Halve ARR at risk",
        organisation=None,
        baseline_scope="company",
        created_by=None,
    ):
        """An initiative made row by row. `cut` is the person whose owner cut
        it tracks; without one it is on the whole company. `organisation`
        defaults to Acme; pass `self.other_org` for a cross-tenant case.
        `baseline_scope` "book" is a Brain-started one's starting line, read
        as `created_by`."""
        closed_at = None
        if closed_days_ago is not None:
            closed_at = timezone.now() - timedelta(days=closed_days_ago)
        return Initiative.objects.create(
            organisation=organisation or self.org,
            title=title,
            hypothesis="If we act, then the number moves.",
            metric=metric,
            dimension="owner" if cut else "",
            member=str(cut.pk) if cut else "",
            member_label=cut.name if cut else "",
            target_value=Decimal("0"),
            target_by=self.today + timedelta(days=target_in),
            owner=owner,
            status=status,
            baseline_value=Decimal("1000"),
            baseline_as_of=self.today,
            baseline_scope=baseline_scope,
            created_by=created_by,
            closed_at=closed_at,
        )

    def reader_and_scope(self, user, key):
        """A fresh reader (no memoised org chart) and their scope."""
        reader = User.objects.get(pk=user.pk)
        return reader, resolve(reader, key)

    def plan(
        self,
        record,
        *,
        owner=None,
        status="on_track",
        figures=None,
        milestones=(False, False),
        target_in=30,
        name="Renewal save play",
    ):
        """A plan made row by row on `record` (a Customer or an Account),
        owned by the record's owner unless told otherwise; `milestones` says
        which are done; `figures` is its `start_figures` (None: an old plan)."""
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        plan = Plan.objects.create(
            organisation=self.org,
            name=name,
            kind="save",
            owner=owner or record.owner or self.admin,
            start_date=self.today,
            target_date=self.today + timedelta(days=target_in),
            status=status,
            start_figures=figures,
            **on,
        )
        for position, done in enumerate(milestones):
            Milestone.objects.create(
                plan=plan,
                name=f"Step {position + 1}",
                position=position,
                due_date=self.today + timedelta(days=7 * (position + 1)),
                done_at=timezone.now() if done else None,
            )
        return plan

    def rule(
        self,
        owner,
        *,
        name="Detractor follow-up",
        sharing="private",
        segment=None,
        is_active=True,
        paused_reason="",
    ):
        return Rule.objects.create(
            organisation=self.org,
            owner=owner,
            name=name,
            trigger="entered",
            sharing=sharing,
            segment=segment,
            is_active=is_active,
            paused_reason=paused_reason,
        )

    def night(self, rule, *, fired=0, matched=0, skipped=None, days_ago=0, records=()):
        """A night of `rule`; each of `records` (Customers or Accounts) fired."""
        run = RuleRun.objects.create(
            rule=rule,
            run_on=self.today - timedelta(days=days_ago),
            matched=matched,
            fired=fired,
            skipped=skipped or empty_skips(),
            started_at=timezone.now(),
        )
        for record in records:
            RuleRunRecord.objects.create(
                run=run,
                record_kind="customer" if isinstance(record, Customer) else "account",
                record_id=record.pk,
                outcome=RuleRunRecord.Outcome.FIRED,
            )
        return run
