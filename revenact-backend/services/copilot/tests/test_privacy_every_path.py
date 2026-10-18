"""One CSM never sees another CSM's book, through any path (SOC2:AUTH-02).

Visibility is enforced separately in many places: the plain Copilot
grounding (context.build_grounding), every Ask surface's grounding
(ask.SURFACES), the plain system prompt and its agentic tools (RecordSearch,
KnowledgeBrowser over the asker's OKF bundle), the Work feed, Communications
and the customers endpoints. Each has its own tests; this one walks them all
with the same canary.

Acme has two plain CSMs (no view_all_accounts, nobody's manager): Ana owns
Secret Co, whose every record carries a distinctive value (ARR 987,654,
health 3.3, the ticket "Zebra outage XYZZY", the token XYZZY-CANARY in mail,
notes, tasks, pipeline and knowledge, the contact canary@secret.example);
Eli, an engineer, answers for it in Engineering. Bo owns Plain Ltd and
nothing else, so Bo may not open Secret Co. Every path is asked, as Bo, about
Secret Co, and must say nothing of it; the same paths as Ana show the canary,
so the suite cannot pass by showing nothing at all. No model is called.
"""

import json
import re
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.copilot import views
from services.copilot.agentic import KnowledgeBrowser, RecordSearch
from services.copilot.ask import SURFACES
from services.copilot.context import build_grounding
from services.customers.models import (
    Account,
    Contact,
    Customer,
    Email,
    Note,
    Opportunity,
    Risk,
    Task,
    Ticket,
)
from services.knowledge.models import Contribution, FunctionOwner
from services.knowledge.okf import Bundle
from services.segments.tests.fixtures import person

QUESTION = "What is going on with Secret Co? Anything about XYZZY or the Zebra outage?"

#: Text that only Secret Co's records contain.
CANARIES = ("xyzzy", "canary@secret.example", "zebra outage")
#: Secret Co's ARR in every spelling a digest uses: 987654, 987,654.00,
#: 987.7k, $988K.
ARR = re.compile(r"987,?654|\b98[78](?:\.\d+)?\s?k\b", re.IGNORECASE)
SECRET = "secret co"
HEALTH = "3.3"

TONE = "Be professional."


class PrivacyEveryPathTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        today = timezone.localdate()
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.ana = person("ana@acme.io", "Ana Owner", cls.org)
        cls.bo = person("bo@acme.io", "Bo Other", cls.org)
        cls.eli = person("eli@acme.io", "Eli Engineer", cls.org, function=User.Function.ENGINEERING)

        cls.secret = Customer.objects.create(
            organisation=cls.org,
            name="Secret Co",
            owner=cls.ana,
            arr_billed_at_account=Decimal(987_654),
            arr_billed_at_hq=Decimal(987_654),
            health_score=Decimal("3.3"),
            renewal_date=today + timedelta(days=20),
        )
        cls.plain = Customer.objects.create(
            organisation=cls.org,
            name="Plain Ltd",
            owner=cls.bo,
            arr_billed_at_account=Decimal(120_000),
            arr_billed_at_hq=Decimal(120_000),
            health_score=Decimal("7.5"),
        )
        FunctionOwner.objects.create(
            customer=cls.secret, function=User.Function.ENGINEERING, user=cls.eli
        )
        cls.secret_account = Account.objects.create(
            name="Secret EMEA", owner=cls.ana, health_score=Decimal("3.3")
        )
        cls.secret_account.customers.add(cls.secret)
        cls.plain_account = Account.objects.create(name="Plain EMEA", owner=cls.bo)
        cls.plain_account.customers.add(cls.plain)

        cls.ticket = Ticket.objects.create(
            customer=cls.secret,
            ticket_number="TKT-XYZZY",
            title="Zebra outage XYZZY",
            assignee_name="Support",
            status=Ticket.Status.OPEN,
            priority=Ticket.Priority.CRITICAL,
            opened_at=today,
        )
        Email.objects.create(
            customer=cls.secret,
            subject="XYZZY-CANARY renewal pricing",
            sender_name="Cara Canary",
            recipient_name="Ana Owner",
            body="XYZZY-CANARY: we will not renew at 987,654 without a discount.",
            sent_at=timezone.now() - timedelta(hours=2),
            direction=Email.Direction.RECEIVED,
            mailbox_owner=cls.ana,
            from_address="canary@secret.example",
            to_addresses=["ana@acme.io"],
            thread_id="thread-xyzzy",
        )
        Note.objects.create(
            customer=cls.secret,
            title="XYZZY-CANARY champion left",
            author_name="Ana Owner",
            body="XYZZY-CANARY: the champion left after the Zebra outage.",
            logged_at=today,
        )
        cls.contact = Contact.objects.create(
            customer=cls.secret, name="Cara Canary", email="canary@secret.example"
        )
        Contact.objects.create(customer=cls.plain, name="Pat Plain", email="pat@plain.example")
        Task.objects.create(
            customer=cls.secret,
            title="XYZZY-CANARY call the CFO",
            assignee_name="Ana Owner",
            assignee=cls.ana,
            due_date=today,
            priority=Task.Priority.HIGH,
        )
        Task.objects.create(
            customer=cls.secret,
            title="XYZZY-CANARY unassigned follow-up",
            assignee_name="",
            due_date=today,
            priority=Task.Priority.HIGH,
        )
        cls.opportunity = Opportunity.objects.create(
            customer=cls.secret,
            title="XYZZY-CANARY expansion",
            mrr=Decimal("4321"),
            stage=Opportunity.Stage.NEGOTIATION,
        )
        cls.risk = Risk.objects.create(
            customer=cls.secret, title="XYZZY-CANARY churn risk", mrr=Decimal("4321")
        )
        Contribution.objects.create(
            organisation=cls.org,
            customer=cls.secret,
            author=cls.eli,
            function=User.Function.ENGINEERING,
            body="XYZZY-CANARY: their SSO breaks every Monday.",
        )

    def setUp(self):
        # No path here should reach a model; if one does, it gets nothing.
        patcher = patch(
            "services.copilot.anthropic_client.get_completion",
            side_effect=AssertionError("no model call in the privacy suite"),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.ana = User.objects.get(pk=self.ana.pk)
        self.bo = User.objects.get(pk=self.bo.pk)

    # -- helpers -------------------------------------------------------------

    def assert_clean(self, text, where):
        """Nothing of Secret Co's in `text`: no canary, no ARR, and no line
        that names Secret Co carries its health."""
        if not isinstance(text, str):
            text = json.dumps(text, default=str)
        lowered = text.lower()
        for canary in CANARIES:
            self.assertNotIn(canary, lowered, f"{where} leaks {canary!r}:\n{text[:3000]}")
        self.assertIsNone(ARR.search(text), f"{where} leaks Secret Co's ARR:\n{text[:3000]}")
        for line in lowered.splitlines():
            if SECRET in line:
                self.assertNotIn(HEALTH, line, f"{where} leaks Secret Co's health: {line}")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def ask_cases(self):
        """Every Ask surface, from the pages Bo can reach and from the ones
        that name Secret Co. `True` marks a context that must be refused."""
        secret, plain = self.secret.pk, self.plain.pk
        dashboard = [
            ({"surface": "dashboard", "area": area, "view": view, "filters": {}}, False)
            for area, view in [
                ("overview", None),
                ("revenue", "forecast"),
                ("revenue", "customers"),
                ("revenue", "products"),
                ("health", "triage"),
                ("health", "divergence"),
                ("health", "movement"),
                ("health", "renewals"),
                ("health", "usage"),
                ("health", "activity"),
                ("health", "distribution"),
                ("support", "tickets"),
                ("support", "topics"),
            ]
        ]
        dashboard.append(
            (
                {
                    "surface": "dashboard",
                    "area": "health",
                    "view": "triage",
                    "filters": {},
                    "focus": {"kind": "companies", "ids": [secret]},
                },
                False,
            )
        )
        organizations = [
            ({"surface": "organizations", "view": view, "filters": {}}, False)
            for view in ("list", "board")
        ] + [
            (
                {
                    "surface": "organizations",
                    "view": "list",
                    "filters": {"search": "Secret"},
                    "focus": {"kind": "companies", "ids": [secret]},
                },
                False,
            ),
            ({"surface": "organizations", "view": "detail", "organization": plain}, False),
            ({"surface": "organizations", "view": "detail", "organization": secret}, True),
            (
                {
                    "surface": "organizations",
                    "view": "detail",
                    "organization": plain,
                    "account": self.secret_account.pk,
                },
                True,
            ),
        ]
        contacts = [
            ({"surface": "contacts", "view": "list", "filters": {}}, False),
            ({"surface": "contacts", "view": "list", "filters": {"q": "canary"}}, False),
            ({"surface": "contacts", "view": "list", "filters": {"customer": secret}}, True),
            (
                {
                    "surface": "contacts",
                    "view": "list",
                    "filters": {"account": self.secret_account.pk},
                },
                True,
            ),
            ({"surface": "contacts", "view": "person", "contact": self.contact.pk}, True),
        ]
        accounts = [
            ({"surface": "accounts", "view": view, "filters": {}}, False)
            for view in ("list", "board")
        ] + [
            ({"surface": "accounts", "view": "list", "filters": {"search": "Secret"}}, False),
            ({"surface": "accounts", "view": "detail", "account": self.plain_account.pk}, False),
            ({"surface": "accounts", "view": "list", "filters": {"organisation": secret}}, True),
            ({"surface": "accounts", "view": "detail", "account": self.secret_account.pk}, True),
        ]
        pipelines = [
            ({"surface": "pipelines", "kind": kind, "view": view, "filters": {}}, False)
            for kind in ("opportunities", "risks")
            for view in ("list", "board")
        ] + [
            (
                {
                    "surface": "pipelines",
                    "kind": "opportunities",
                    "view": "list",
                    "filters": {"organisation": str(secret)},
                },
                True,
            ),
            (
                {
                    "surface": "pipelines",
                    "kind": "opportunities",
                    "view": "list",
                    "filters": {},
                    "focus": {"kind": "opportunity", "id": self.opportunity.pk},
                },
                True,
            ),
            (
                {
                    "surface": "pipelines",
                    "kind": "risks",
                    "view": "list",
                    "filters": {},
                    "focus": {"kind": "risk", "id": self.risk.pk},
                },
                True,
            ),
        ]
        brain = [
            ({"surface": "brain", "scope": scope, "tab": tab}, False)
            for scope in ("me", "team", "company")
            for tab in ("changed", "waiting", "doing", "customers")
        ]
        return {
            "dashboard": dashboard,
            "organizations": organizations,
            "contacts": contacts,
            "accounts": accounts,
            "pipelines": pipelines,
            "brain": brain,
        }

    # -- the positive control -------------------------------------------------

    def test_the_owner_sees_the_canary_so_the_suite_is_not_vacuous(self):
        grounding = build_grounding(self.org, user=self.ana, query=QUESTION)
        self.assertIn("XYZZY-CANARY", grounding.summary)

        search = RecordSearch(self.org, self.ana)
        reply = search({"query": "XYZZY", "company": "Secret Co"})
        self.assertIn("XYZZY", json.dumps(reply))

        bundle = Bundle(self.org, self.ana, values=False)
        bundle.build()
        self.assertIn("XYZZY-CANARY", json.dumps(bundle.files))

        client = self.client_for(self.ana)
        detail = client.get(f"/api/v1/customers/{self.secret.pk}/")
        self.assertEqual(detail.status_code, 200)
        listed = client.get("/api/v1/customers/", {"search": "Secret"})
        self.assertIn("Secret Co", json.dumps(listed.json()))
        stream = client.get("/api/v1/communications/", {"needs": "false"})
        self.assertIn("XYZZY", json.dumps(stream.json()))

    # -- the plain Copilot ---------------------------------------------------

    def test_plain_grounding_and_prompt_say_nothing_of_secret_co(self):
        for query in (QUESTION, "Secret Co", "XYZZY-CANARY", "canary@secret.example"):
            grounding = build_grounding(self.org, user=self.bo, query=query)
            self.assert_clean(grounding.summary, f"build_grounding({query!r})")
            self.assert_clean(grounding.sources, f"build_grounding({query!r}).sources")
            with override_settings(COPILOT_AGENTIC=False):
                system, tools = views.plain_prompt(self.bo, grounding)
            self.assertIsNone(tools)
            self.assert_clean(system, f"plain_prompt({query!r})")

    @override_settings(COPILOT_AGENTIC=True, COPILOT_LLM_PROVIDER="gemini")
    def test_agentic_tools_say_nothing_of_secret_co(self):
        grounding = build_grounding(self.org, user=self.bo, query=QUESTION)
        system, tools = views.plain_prompt(self.bo, grounding)
        self.assert_clean(system, "agentic plain_prompt")
        search, browser = tools
        self.assertIsInstance(search, RecordSearch)
        self.assertIsInstance(browser, KnowledgeBrowser)

        for args in (
            {"query": "XYZZY", "company": "Secret Co"},
            {"query": "Zebra outage", "company": "Secret EMEA"},
            {"query": "XYZZY-CANARY"},
            {"query": "canary@secret.example"},
        ):
            reply = search(args)
            self.assertEqual(reply["results"], [], f"RecordSearch({args}) returned records")
            self.assert_clean(reply, f"RecordSearch({args})")

        top = browser({"path": ""})
        self.assertIn("content", top)
        bundle = browser._files()
        self.assertTrue(bundle.files)
        for path in bundle.files:
            self.assert_clean(bundle.files[path], f"OKF {path}")
            self.assert_clean(browser({"path": path}), f"browse_knowledge({path})")
        self.assertFalse(
            any("secret" in path.lower() for path in bundle.files),
            f"Bo's bundle has a Secret Co file: {sorted(bundle.files)}",
        )
        self.assert_clean(search.sources, "the reply's sources")

    # -- every Ask surface ---------------------------------------------------

    def test_every_ask_surface_says_nothing_of_secret_co(self):
        cases = self.ask_cases()
        self.assertEqual(set(cases), set(SURFACES), "a new Ask surface needs cases here")
        grounded = dict.fromkeys(SURFACES, 0)
        for name, surface in SURFACES.items():
            for raw, must_refuse in cases[name]:
                with self.subTest(surface=name, context=raw):
                    checked = surface.serializer(data=raw, context={"user": self.bo})
                    valid = checked.is_valid()
                    if must_refuse:
                        self.assertFalse(valid, f"{name} accepted a context naming Secret Co")
                        continue
                    if not valid:
                        # A scope Bo may not use (the Brain's Company) is
                        # refused before anything is read: nothing to leak.
                        self.assertEqual(name, "brain", checked.errors)
                        continue
                    ask = checked.validated_data
                    focus = ask.get("focus")
                    if isinstance(focus, dict) and focus.get("kind") == "companies":
                        self.assertNotIn(self.secret.pk, focus["ids"])
                    grounding = surface.ground(self.bo, ask, QUESTION)
                    self.assert_clean(grounding.summary, f"{name} {raw}")
                    self.assert_clean(grounding.sources, f"{name} {raw} sources")
                    self.assertNotIn(self.secret.pk, grounding.customer_ids or [])
                    self.assert_clean(
                        surface.system_prompt(TONE, grounding.summary), f"{name} prompt"
                    )
                    grounded[name] += 1
        self.assertTrue(all(grounded.values()), f"a surface was never grounded for Bo: {grounded}")

    # -- Work and Communications ---------------------------------------------

    def test_work_feed_says_nothing_of_secret_co(self):
        client = self.client_for(self.bo)
        feed = client.get("/api/v1/work/feed/")
        self.assertEqual(feed.status_code, 200)
        self.assert_clean(feed.json(), "work feed")
        for url in ("/api/v1/work/feed/team/", "/api/v1/work/feed/count/", "/api/v1/work/queues/"):
            response = client.get(url)
            self.assert_clean(response.content.decode(), url)

    def test_communications_say_nothing_of_secret_co(self):
        client = self.client_for(self.bo)
        for params in ({}, {"needs": "false"}, {"scope": "team"}, {"q": "xyzzy"}):
            response = client.get("/api/v1/communications/", params)
            self.assertEqual(response.status_code, 200)
            self.assert_clean(response.json(), f"communications {params}")
        stats = client.get("/api/v1/communications/stats/")
        self.assert_clean(stats.content.decode(), "communications stats")

    # -- the customers endpoints ---------------------------------------------

    def test_customers_endpoints_hide_secret_co(self):
        client = self.client_for(self.bo)
        for params in ({}, {"search": "Secret"}, {"search": str(self.secret.pk)}):
            listed = client.get("/api/v1/customers/", params)
            self.assertEqual(listed.status_code, 200)
            body = json.dumps(listed.json())
            self.assertNotIn("Secret Co", body)
            self.assert_clean(body, f"customers list {params}")

        contacts = client.get("/api/v1/contacts/", {"search": "canary"})
        self.assert_clean(contacts.content.decode(), "contacts search")

        pk, account = self.secret.pk, self.secret_account.pk
        detail = client.get(f"/api/v1/customers/{pk}/")
        self.assertIn(detail.status_code, (403, 404))
        children = [
            f"{child}/"
            for child in (
                "accounts",
                "activities",
                "emails",
                "tasks",
                "notes",
                "files",
                "calls",
                "tickets",
                "calendar-events",
                "contacts",
                "opportunities",
                "risks",
                "surveys",
                "canvases",
                "headlines",
            )
        ] + [f"accounts/{account}/"]
        for child in children:
            url = f"/api/v1/customers/{pk}/{child}"
            response = client.get(url)
            self.assertIn(response.status_code, (403, 404), f"{url} -> {response.status_code}")
            self.assert_clean(response.content.decode(), url)
