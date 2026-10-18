"""0061 only loosens the parent rule and the date: every existing task keeps
its record and its date, and two records are still refused."""

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

BEFORE = [("customers", "0060_reply_draft_sending")]
AFTER = [("customers", "0061_task_todo")]


class TaskTodoMigrationTests(TransactionTestCase):
    def test_existing_tasks_keep_exactly_one_record(self):
        executor = MigrationExecutor(connection)
        executor.migrate(BEFORE)
        # Organisation's later columns are NOT NULL, so read it at its latest state.
        old_targets = BEFORE + [n for n in executor.loader.graph.leaf_nodes() if n[0] == "accounts"]
        old = executor.loader.project_state(old_targets).apps
        Organisation = old.get_model("accounts", "Organisation")
        Customer = old.get_model("customers", "Customer")
        Account = old.get_model("customers", "Account")
        Task = old.get_model("customers", "Task")
        org = Organisation.objects.create(name="Acme", currency="USD")
        pizza = Customer.objects.create(organisation=org, name="Pizza Hut")
        emea = Account.objects.create(name="Pizza EMEA")
        common = {"assignee_name": "Carl", "due_date": "2026-10-12", "priority": "high"}
        on_customer = Task.objects.create(customer=pizza, title="Call", **common)
        on_account = Task.objects.create(account=emea, title="Sync", **common)

        executor.loader.build_graph()
        executor.migrate(AFTER)
        new = executor.loader.project_state(AFTER).apps
        Task = new.get_model("customers", "Task")
        rows = {t.pk: (t.customer_id, t.account_id, str(t.due_date)) for t in Task.objects.all()}
        self.assertEqual(
            rows,
            {
                on_customer.pk: (pizza.pk, None, "2026-10-12"),
                on_account.pk: (None, emea.pk, "2026-10-12"),
            },
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Task.objects.create(customer_id=pizza.pk, account_id=emea.pk, title="Both", **common)

        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
