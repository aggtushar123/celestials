"""A workspace for the account team and department heads (Slack
escalations D2). Fake people and companies; nothing leaves the test."""

from rest_framework.test import APIClient, APITestCase

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer


class HeadsFixture(APITestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Alfiee QA")
        self.alice = self.person(
            "alice@alfiee.example", "Alice Admin", User.Function.LEADERSHIP, User.Role.ADMIN
        )
        self.faiz = self.person("faiz@alfiee.example", "Faiz Jamal", User.Function.CS)
        self.carl = self.person("carl@alfiee.example", "Carl CSM", User.Function.CS)
        self.jesh = self.person("jesh@alfiee.example", "Jesh Sanghvi", User.Function.ENGINEERING)
        self.erin = self.person("erin@alfiee.example", "Erin Engineer", User.Function.ENGINEERING)
        self.elsewhere = Organisation.objects.create(name="Elsewhere")
        self.zed = User.objects.create_user(
            email="zed@elsewhere.example",
            password="x",
            name="Zed Outsider",
            organisation=self.elsewhere,
            role=User.Role.ADMIN,
            function=User.Function.ENGINEERING,
        )
        self.globex = Customer.objects.create(
            organisation=self.org, name="Globex (QA)", owner=self.faiz
        )
        self.initech = Customer.objects.create(
            organisation=self.org, name="Initech (QA)", owner=self.carl
        )

    def person(self, email, name, function, role=User.Role.CSM):
        return User.objects.create_user(
            email=email,
            password="x",
            name=name,
            organisation=self.org,
            role=role,
            function=function,
        )

    def account(self, name, *parents, owner=None):
        made = Account.objects.create(name=name, owner=owner)
        made.customers.set(parents)
        return made

    @staticmethod
    def as_(user):
        api = APIClient()
        api.force_authenticate(user)
        return api

    @staticmethod
    def fresh(record):
        """The record read again: no related row cached (for query pins)."""
        return type(record).objects.get(pk=record.pk)
