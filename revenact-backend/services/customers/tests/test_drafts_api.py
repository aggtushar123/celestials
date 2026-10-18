"""/api/v1/communications/drafts/ (contract): the reader's own drafts,
newest first, at most 100; one draft for whoever may read it; every write
the owner's, with the contract's codes and sentences, audited."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.agents.tests.drafts_fixtures import draft, inbound, mailbox, share, ticket
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import ReplyDraft

URL = "/api/v1/communications/drafts/"


class DraftsApiFixture(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.connection = mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.issue = ticket(cls.pizza)

    def get(self, user, url=URL, params=None):
        return self.client_for(user).get(url, params or {})


class DraftReadTests(DraftsApiFixture):
    def test_the_list_is_the_readers_own_open_drafts_newest_first(self):
        older = draft(self.mail, self.csm)
        newer = draft(self.issue, self.csm)
        draft(
            inbound(self.pizza, self.csm, thread="t2", message_id="<m2@x.com>"),
            self.csm,
            status="sent",
        )
        response = self.get(self.csm)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([d["id"] for d in response.data["results"]], [newer.pk, older.pk])
        # The list is the reader's own: Mona's is empty.
        self.assertEqual(self.get(self.mona).data, {"results": []})

    def test_filters_and_bad_filters(self):
        mine = draft(self.mail, self.csm)
        sent = draft(self.issue, self.csm, status="sent")
        self.assertEqual(
            [d["id"] for d in self.get(self.csm, params={"channel": "email"}).data["results"]],
            [mine.pk],
        )
        self.assertEqual(
            [d["id"] for d in self.get(self.csm, params={"status": "sent"}).data["results"]],
            [sent.pk],
        )
        response = self.get(self.csm, params={"channel": "fax", "status": "gone"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {"channel": ["Choose email or ticket."], "status": ["Choose open or sent."]},
        )

    def test_one_draft_for_whoever_may_read_it(self):
        mine = draft(self.mail, self.csm)
        url = f"{URL}{mine.pk}/"
        self.assertEqual(self.get(self.csm, url).data["id"], mine.pk)
        # Mail is owner-only (2026-10-17): Carl's manager doesn't read it...
        for outsider in (self.mona, self.admin, self.other, self.stranger):
            self.assertEqual(self.get(outsider, url).status_code, 404, outsider.name)
        # ...nor once Carl adds the email to Revenact: his unsent reply stays his.
        share(self.mail)
        self.assertEqual(self.get(self.mona, url).status_code, 404)

    def test_the_list_query_count_does_not_grow(self):
        draft(self.mail, self.csm)

        def count():
            with CaptureQueriesContext(connection) as queries:
                response = self.get(self.csm)
            self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in queries).upper())
            return len(queries), len(response.data["results"])

        few = count()
        for i in range(4):
            source = inbound(self.dough, self.csm, thread=f"t{i + 5}", message_id=f"<n{i}@x.com>")
            draft(source, self.csm)
        many = count()
        self.assertEqual((few[0], few[1], many[1]), (many[0], 1, 5))
        self.assertEqual(ReplyDraft.objects.count(), 5)


class DraftWriteTests(DraftsApiFixture):
    def events(self, action):
        return list(AuditEvent.objects.filter(action=action).values_list("target_id", "metadata"))

    def test_the_owner_edits_it(self):
        mine = draft(self.mail, self.csm)
        response = self.client_for(self.csm).patch(
            f"{URL}{mine.pk}/", {"body": "Hi Ann, call me.", "subject": "Re: Terms"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["body"], response.data["edited"]), ("Hi Ann, call me.", True)
        )
        self.assertEqual(
            self.events("reply_draft.edited"), [(str(mine.pk), {"fields": ["body", "subject"]})]
        )

    def test_recipients_are_fixed(self):
        mine = draft(self.mail, self.csm)
        response = self.client_for(self.csm).patch(
            f"{URL}{mine.pk}/", {"to": [["Eve", "eve@evil.io"]]}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["to"], [["Ann Lee", "ann@x.com"]])
        self.assertEqual(response.data["sent_by"], None)
        self.assertFalse(self.events("reply_draft.edited"))

    def test_patch_errors_in_order(self):
        mine = draft(self.mail, self.csm)
        url = f"{URL}{mine.pk}/"
        for outsider in (self.other, self.mona):  # mail is owner-only (2026-10-17)
            response = self.client_for(outsider).patch(url, {"body": "x"}, format="json")
            self.assertEqual(response.status_code, 404)
        share(self.mail)  # a shared conversation, a draft still Carl's alone
        self.assertEqual(
            self.client_for(self.mona).patch(url, {"body": "x"}, format="json").status_code, 404
        )
        # A ticket's draft is read by the ticket's department: Mona (CS) reads
        # Carl's on a CS ticket, and may not change it.
        theirs = draft(self.issue, self.csm)
        response = self.client_for(self.mona).patch(
            f"{URL}{theirs.pk}/", {"body": "x"}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"code": "NOT_YOURS", "detail": "Only Carl CSM can change this draft."}),
        )
        response = self.client_for(self.csm).patch(url, {"body": ""}, format="json")
        self.assertEqual(
            (response.status_code, response.data), (400, {"body": ["Write the reply."]})
        )
        ReplyDraft.objects.filter(pk=mine.pk).update(status="sent")
        response = self.client_for(self.csm).patch(url, {"body": ""}, format="json")
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "ALREADY_SENT", "detail": "This draft has been sent."}),
        )

    def test_the_owner_discards_it(self):
        mine = draft(self.mail, self.csm)
        url = f"{URL}{mine.pk}/"
        self.assertEqual(self.client_for(self.mona).delete(url).status_code, 404)
        share(self.mail)  # a shared conversation, a draft still Carl's alone
        self.assertEqual(self.client_for(self.mona).delete(url).status_code, 404)
        self.assertEqual(self.client_for(self.csm).delete(url).status_code, 204)
        self.assertFalse(ReplyDraft.objects.filter(pk=mine.pk).exists())
        self.assertEqual(self.events("reply_draft.discarded"), [(str(mine.pk), {})])
        sent = draft(self.issue, self.csm, status="sent")
        response = self.client_for(self.csm).delete(f"{URL}{sent.pk}/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))

    def test_a_ticket_draft_is_marked_sent(self):
        mine = draft(self.issue, self.csm)
        url = f"{URL}{mine.pk}/mark-sent/"
        response = self.client_for(self.mona).post(url)
        self.assertEqual((response.status_code, response.data["code"]), (403, "NOT_YOURS"))
        response = self.client_for(self.csm).post(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "sent")
        self.assertEqual(response.data["sent_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertFalse(response.data["can_edit"])
        self.assertEqual(self.events("reply_draft.marked_sent"), [(str(mine.pk), {})])
        again = self.client_for(self.csm).post(url)
        self.assertEqual((again.status_code, again.data["code"]), (409, "ALREADY_SENT"))

    def test_an_email_draft_is_not_marked_sent(self):
        mine = draft(self.mail, self.csm)
        response = self.client_for(self.csm).post(f"{URL}{mine.pk}/mark-sent/")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"code": "WRONG_CHANNEL", "detail": "Send an email draft instead."}),
        )
