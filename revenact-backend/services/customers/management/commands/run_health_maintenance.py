"""The scheduled half of account health: recalculate scores, record history.

Two things drift without anyone touching a Customer row:

- `health_score` depends on days-since-last-touch and open ticket count, so it
  goes stale on its own — an activity logged, a ticket opened, or simply a week
  passing all change the answer.
- `HealthSnapshot` is what the Movement tab charts, and nothing writes one
  except the demo seed. Without this, history stops accruing the moment the
  seeded backfill runs out.

**This is the entry point to schedule**, not celery: there is no task queue in
this project, and adding one to run a daily command would be a large piece of
infrastructure for a job that cron does. Safe to run as often as you like —
recalculation is idempotent, and the snapshot writes at most one row per
customer per month.

    # daily, a little after midnight
    5 0 * * *  cd /srv/revenact && venv/bin/python manage.py run_health_maintenance

Usage:
    python manage.py run_health_maintenance
    python manage.py run_health_maintenance --org-email alice@acme.io
    python manage.py run_health_maintenance --dry-run
"""

import time
from datetime import date

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.customers.models import Customer, HealthSnapshot, with_health_inputs


def last_completed_month_end(today=None):
    """The last day of the month before `today`'s.

    Snapshots are monthly because that is what the flow chart's columns are —
    a daily row would give it 365 of them, and the months would stop lining up
    across accounts.
    """
    today = today or timezone.localdate()
    first_of_this_month = date(today.year, today.month, 1)
    return first_of_this_month - timezone.timedelta(days=1)


class Command(BaseCommand):
    help = "Recalculate health scores and record the monthly health snapshot."

    def add_arguments(self, parser):
        parser.add_argument(
            "--org-email",
            help="Limit to one tenant, by any user's email in it. Default: every customer.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen without writing anything.",
        )

    def handle(self, *args, **options):
        queryset = Customer.objects.all()
        organisation = None

        if options["org_email"]:
            try:
                user = User.objects.get(email=options["org_email"])
            except User.DoesNotExist as exc:
                raise CommandError(f"No user with email {options['org_email']!r}.") from exc
            if user.organisation is None:
                raise CommandError(f"{user.email} has no organisation.")
            organisation = user.organisation
            queryset = queryset.filter(organisation=organisation)

        # Sentiment first: anything logged since yesterday — synced mail that
        # could not be classified at the time, tickets, calls — gets its tags
        # before the pulse and health read them. A missing model key is
        # reported, not fatal: the scores still run on what is classified.
        classify_args = ["classify_interactions"]
        if options["org_email"]:
            classify_args += ["--org-email", options["org_email"]]
        if options["dry_run"]:
            classify_args += ["--dry-run"]
        try:
            call_command(*classify_args, stdout=self.stdout)
        except CommandError as exc:
            self.stdout.write(self.style.WARNING(f"classification skipped: {exc}"))

        # Then the people: every contact's sentiment re-read from their
        # classified calls, emails and tickets, before the scores read it.
        if not options["dry_run"]:
            from services.customers.contact_sentiment import recompute_all

            changed = recompute_all(organisation)
            self.stdout.write(self.style.SUCCESS(f"recomputed sentiment for {changed} contact(s)"))

        # The management brief, where a schedule says it goes. Posts what
        # exists rather than generating: a schedule never quietly spends a
        # model call (services.metrics.delivery).
        if not options["dry_run"]:
            from services.metrics.delivery import send_due

            try:
                posted = send_due()
                self.stdout.write(self.style.SUCCESS(f"posted {posted} brief(s) to Slack"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"brief delivery skipped: {exc}"))

        # What suddenly started going wrong: clusters of the same report
        # across several companies (services.anomalies).
        if not options["dry_run"]:
            from services.anomalies.detect import detect_nightly

            try:
                found = detect_nightly(organisation)
                self.stdout.write(self.style.SUCCESS(f"found {found} anomaly cluster(s)"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"anomaly detection skipped: {exc}"))

        # SOC2:DATA-04 stored embeddings nobody has used for a while go
        # (services.copilot.embeddings); whole-deployment, not per workspace.
        if not options["dry_run"] and organisation is None:
            from services.copilot.embeddings import prune_unused

            pruned = prune_unused()
            self.stdout.write(self.style.SUCCESS(f"pruned {pruned} unused embedding(s)"))

        # Questions nobody answered become the company's problem rather
        # than a reminder's: gaps are what the Company View shows as
        # "what we cannot answer".
        if not options["dry_run"]:
            from services.knowledge.gaps import raise_from_stale_questions

            try:
                raised = raise_from_stale_questions(organisation)
                self.stdout.write(self.style.SUCCESS(f"raised {raised} knowledge gap(s)"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"knowledge gaps skipped: {exc}"))

        # Feature requests: file the asks the classifier tagged since the last
        # pass, naming new ones. Budget or a missing key ends it quietly.
        if not options["dry_run"]:
            from services.requests.gather import gather_nightly

            # Never fatal: the scores, snapshots and nudges below must run
            # even when the embedding model or the API is having a bad night.
            try:
                named = gather_nightly(organisation)
                self.stdout.write(self.style.SUCCESS(f"named {named} new feature request(s)"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"feature requests skipped: {exc}"))

        # AI attributes marked nightly, for companies with classified activity
        # newer than their last answer. Budget or a missing key ends the pass
        # quietly inside refresh_nightly; the scores below never wait on it.
        if not options["dry_run"]:
            from services.attributes.fill import refresh_nightly

            filled = refresh_nightly(organisation)
            self.stdout.write(self.style.SUCCESS(f"filled {filled} AI attribute value(s)"))

        # Scores first: the snapshot should record the freshly computed value,
        # not yesterday's.
        recalculate_args = ["recalculate_health"]
        if options["org_email"]:
            recalculate_args += ["--org-email", options["org_email"]]
        if options["dry_run"]:
            recalculate_args += ["--dry-run"]
        call_command(*recalculate_args, stdout=self.stdout)

        captured_on = last_completed_month_end()
        written, already_had = self._capture(queryset, captured_on, options["dry_run"])

        verb = "would record" if options["dry_run"] else "recorded"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {written} snapshot(s) for {captured_on}; "
                f"{already_had} customer(s) already had one."
            )
        )

        # Today's account pulse becomes one more history dot per account, once
        # a day (pulse.py; the tables draw `pulse` as the trend).
        dots, dots_had = self._record_pulses(queryset, options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(f"{verb} {dots} pulse dot(s); {dots_had} already had today's.")
        )

        # Survey scores: a record whose answers have just aged past 90 days
        # gets its rolling NPS/CSAT/CES again, before the segments that read
        # those scores (services.surveys.scores.refresh_aged).
        if not options["dry_run"]:
            from services.surveys.scores import refresh_aged

            try:
                refreshed = refresh_aged(organisation, now=timezone.now())
                self.stdout.write(
                    self.style.SUCCESS(f"refreshed survey scores on {refreshed} record(s)")
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"survey scores skipped: {exc}"))

        # Segments: who entered and who left, as each owner sees their book,
        # after the scores and pulses the rules read are fresh. Once per date
        # per segment, so a re-run is a no-op (services.segments.nightly).
        if not options["dry_run"]:
            from services.segments.nightly import evaluate_nightly

            try:
                night = evaluate_nightly(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"evaluated {night.evaluated} segment(s): {night.changes} change(s), "
                        f"{night.alerts} alert(s), {night.paused} paused, {night.failed} failed"
                    )
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"segments skipped: {exc}"))

        # Plans: at risk when a milestone is overdue, done when every
        # milestone is, before the rules so a rule sees tonight's plan
        # status. A plan only ever moves forward, so a re-run is a no-op
        # (services.plans.nightly).
        if not options["dry_run"]:
            from services.plans import nightly as plans_nightly

            try:
                night = plans_nightly.refresh_plans(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"refreshed plans: {night.at_risk} at risk, {night.done} done, "
                        f"{night.failed} failed"
                    )
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(self.style.WARNING(f"plans skipped: {type(exc).__name__}"))

        # Agents: each function's agent reads its book and proposes, or on
        # Auto applies, actions before Recommended routes them tonight
        # (services.agents.run; spec Decision 9). Never fatal.
        if not options["dry_run"]:
            from services.agents import run as agents_run

            try:
                night = agents_run.run_all(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"agents proposed {night.proposed} action(s); applied {night.applied}"
                    )
                )
                for failure in night.failed:
                    self.stdout.write(self.style.WARNING(f"agent pass failed: {failure}"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(self.style.WARNING(f"agents skipped: {type(exc).__name__}"))

        # Recommended work: today's signals become recommendations in the
        # right person's queue, after the scores, tickets and plans they read
        # are fresh and before the rules run. Rules only, no model call; each
        # source and each workspace fails on its own (services.work.recommend).
        if not options["dry_run"]:
            from services.work import recommend

            try:
                night = recommend.refresh_all(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"recommended {night.created} task(s): {night.updated} refreshed, "
                        f"{night.expired} expired, {night.notified} told, "
                        f"{len(night.failed)} failure(s)"
                    )
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(
                    self.style.WARNING(f"recommendations skipped: {type(exc).__name__}")
                )

        # Tracking that pushes: overdue tasks remind their assignees and
        # escalate once to a manager, on each workspace's working days
        # (services.work.tracking). Never fatal.
        if not options["dry_run"]:
            from services.work import tracking

            try:
                night = tracking.run_all(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"nudged {night.nudged} overdue task(s); escalated {night.escalated}"
                    )
                )
                for failure in night.failed:
                    self.stdout.write(self.style.WARNING(f"task tracking failed: {failure}"))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(
                    self.style.WARNING(f"task tracking skipped: {type(exc).__name__}")
                )

        # Rules: "when → then" on each owner's own segments, run as the
        # owner, after the segments' entries and exits and the scores they
        # read are fresh. Once per rule per night (services.rules.nightly).
        if not options["dry_run"]:
            from services.rules.nightly import evaluate_rules

            try:
                night = evaluate_rules(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"ran {night.ran} rule(s): {night.fired} record(s) fired, "
                        f"{night.reviews} review(s), {night.campaign_sends} campaign send(s), "
                        f"{night.survey_sends} survey send(s), "
                        f"{night.paused} paused, "
                        f"{night.expired} expired, {night.failed} failed"
                    )
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(self.style.WARNING(f"rules skipped: {type(exc).__name__}"))

        # Personal mail kept after a Google disconnect, once its 30 days are
        # up (services.mail.prune). Here, before the loops below reuse the
        # name `organisation`. Never fatal.
        from services.mail.prune import prune as prune_mailboxes

        try:
            gone = prune_mailboxes(organisation, now=timezone.now(), dry_run=options["dry_run"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"{'would delete' if options['dry_run'] else 'deleted'} "
                    f"{gone} disconnected mailbox(es)."
                )
            )
        except Exception as exc:  # noqa: BLE001 - reported, never fatal
            # the class name only: an exception's text can quote a row's values
            self.stdout.write(self.style.WARNING(f"mailbox prune skipped: {type(exc).__name__}"))

        # The metric layer's month-end, after the health scores it reads are
        # fresh. Same job because it is the same kind of work — free,
        # idempotent, one row per period — and one cron entry is easier to
        # keep running than two.
        from services.metrics.recording import record_period_end

        organisations = Organisation.objects.filter(
            pk__in=queryset.values_list("organisation_id", flat=True).distinct()
        )
        metric_rows, metrics_had = 0, 0
        for organisation in organisations:
            rows, had = record_period_end(organisation, captured_on, dry_run=options["dry_run"])
            metric_rows += rows
            metrics_had += had
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {metric_rows} metric snapshot(s) for {captured_on} across "
                f"{organisations.count()} organisation(s); {metrics_had} already recorded."
            )
        )

        # The Brain's scopes, after the metric month-end: Me for every member
        # who owns customers, My team for every manager, each recomputed over
        # that book (services.brain.history). Kept, not overwritten, like the
        # rows above; one organisation's failure never stops the job.
        from services.brain.history import record_month_end

        started = time.monotonic()
        scope_rows, scopes_had = 0, 0
        for organisation in organisations:
            try:
                rows, had = record_month_end(organisation, captured_on, dry_run=options["dry_run"])
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(
                    self.style.WARNING(
                        f"scope snapshots skipped for organisation {organisation.pk}: "
                        f"{type(exc).__name__}"
                    )
                )
                continue
            scope_rows += rows
            scopes_had += had
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {scope_rows} scope snapshot(s) for {captured_on} across "
                f"{organisations.count()} organisation(s); {scopes_had} already recorded "
                f"({time.monotonic() - started:.1f}s)."
            )
        )

        # Questions that have waited too long — the person asked is reminded,
        # at most once a day (services.knowledge.aging). Same cron entry.
        from services.knowledge.aging import nudge

        nudged = sum(len(nudge(o, dry_run=options["dry_run"])) for o in organisations)
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would remind' if options['dry_run'] else 'reminded'} {nudged} "
                "assignee(s) of stale questions."
            )
        )

        # Snoozes nobody will look at again — expired over a month ago.
        # `until=null` (Done) is permanent and untouched; a snooze expired
        # more recently already shows its item again on its own, so this is
        # table hygiene, not a visibility rule (services.attention.snooze).
        from services.attention.snooze import prune_expired

        pruned = prune_expired(now=timezone.now(), dry_run=options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would clear' if options['dry_run'] else 'cleared'} {pruned} expired snooze(s)."
            )
        )

        # Daily-digest claims over 30 days old: each only guards its own
        # day, so nothing reads them again (services.work.digest).
        from services.work.digest import prune_sent

        pruned = prune_sent(now=timezone.now(), dry_run=options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would clear' if options['dry_run'] else 'cleared'} {pruned} old digest send(s)."
            )
        )

        # The mail outbox's sent and failed rows once nothing reads them
        # (services.mail.prune.prune_outbox). SOC2:DATA-04
        from services.mail.prune import prune_outbox

        pruned = prune_outbox(now=timezone.now(), dry_run=options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would clear' if options['dry_run'] else 'cleared'} "
                f"{pruned} old mail outbox row(s)."
            )
        )

        # Sent Gmail drafts once their week is up (services.mail.prune.prune_drafts). SOC2:DATA-04
        from services.mail.prune import prune_drafts

        pruned = prune_drafts(now=timezone.now(), dry_run=options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would clear' if options['dry_run'] else 'cleared'} {pruned} sent mail draft(s)."
            )
        )

    def _capture(self, queryset, captured_on, dry_run):
        """Record one snapshot per customer for `captured_on`, skipping any that
        already have one.

        Skipped rather than overwritten: that row is a record of how the month
        *ended*. Re-running a week later and upserting it would quietly replace
        it with the following month's values, and the history would drift
        forwards every time the job ran.
        """
        existing = set(
            HealthSnapshot.objects.filter(
                customer__in=queryset, captured_on=captured_on
            ).values_list("customer_id", flat=True)
        )

        written, already_had = 0, 0
        to_create = []

        for customer in with_health_inputs(queryset):
            if customer.pk in existing:
                already_had += 1
                continue
            written += 1
            if not dry_run:
                to_create.append(
                    HealthSnapshot(
                        customer=customer,
                        captured_on=captured_on,
                        health_score=customer.health_score,
                        csm_pulse_score=customer.csm_pulse_score,
                        ai_pulse_value=customer.ai_pulse_value,
                    )
                )

        if to_create:
            # One statement for the whole book; the partial unique constraint
            # still guards against a concurrent run inserting the same rows.
            HealthSnapshot.objects.bulk_create(to_create, ignore_conflicts=True)

        return written, already_had

    def _record_pulses(self, customers, dry_run):
        """Append today's computed pulse category to each organisation's and
        each of its accounts' `pulse` history (last ten kept), once per day."""
        from django.utils import timezone

        from services.customers.models import (
            Account,
            Customer,
            with_customer_pulse_inputs,
            with_health_inputs,
            with_pulse_inputs,
        )

        today = timezone.localdate()
        written, already_had = 0, 0
        batches = (
            (Customer, with_customer_pulse_inputs(with_health_inputs(customers))),
            (
                Account,
                with_pulse_inputs(Account.objects.filter(customers__in=customers).distinct()),
            ),
        )
        for model, rows in batches:
            for row in rows:
                if row.pulse_recorded_on == today:
                    already_had += 1
                    continue
                written += 1
                if dry_run:
                    continue
                history = list(row.pulse or [])[-9:] + [row.account_pulse(today).category]
                model.objects.filter(pk=row.pk).update(pulse=history, pulse_recorded_on=today)
        return written, already_had
