"""A scope's book as `id IN` filters (Brain delivery 4 Decision 1): the
same customers and accounts `ScopeActor` reads, and nothing for Company."""

from services.brain import book
from services.brain.tests.customers_fixtures import CustomersFixture
from services.customers.models import Account, Customer
from services.customers.scoping import visible_accounts, visible_customers
from services.requests.models import RequestEvidence


def ids(rows):
    return set(rows.values_list("id", flat=True))


class BookTests(CustomersFixture):
    def test_me_is_the_readers_customers_and_accounts(self):
        _reader, scope = self.reader_and_scope(self.csm, "me")
        self.assertEqual(
            ids(Customer.objects.filter(id__in=book.customers(scope))),
            {self.pizza.id, self.dough.id},
        )
        self.assertEqual(
            ids(Account.objects.filter(id__in=book.accounts(scope))),
            {self.emea.id, self.east.id},
        )

    def test_the_book_is_the_one_scope_actor_reads(self):
        for user, key in ((self.csm, "me"), (self.mona, "team"), (self.mona, "me")):
            _reader, scope = self.reader_and_scope(user, key)
            with self.subTest(user=user.name, key=key):
                self.assertEqual(
                    ids(Customer.objects.filter(id__in=book.customers(scope))),
                    ids(visible_customers(scope.actor)),
                )
                self.assertEqual(
                    ids(Account.objects.filter(id__in=book.accounts(scope))),
                    ids(visible_accounts(scope.actor)),
                )

    def test_company_and_no_scope_are_the_whole_organisation(self):
        _reader, company = self.reader_and_scope(self.admin, "company")
        for scope in (company, None):
            self.assertIsNone(book.customers(scope))
            self.assertIsNone(book.accounts(scope))
            self.assertIsNone(book.q(scope))

    def test_the_filter_carries_no_distinct(self):
        _reader, scope = self.reader_and_scope(self.mona, "team")
        sql = str(RequestEvidence.objects.filter(book.q(scope)).query)
        self.assertNotIn("DISTINCT", sql.upper())
