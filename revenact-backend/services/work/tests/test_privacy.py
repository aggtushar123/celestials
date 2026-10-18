"""Counted, not named (spec §4): for a member, a manager, a view-all reader,
a Leadership reader and someone from another workspace, no Work response
names a task or record they cannot read. Carl's "West handover" sits on
Dana's Taco West: Dana reads it (she made it) and so does Alice (view-all
reads every task on records it opens, owner decision 2026-10-07); Carl and
Mona cannot open Taco West, Lee (Leadership) cannot open it either, and Gus
is in another workspace."""

import json

from services.accounts.models import User
from services.work.tests.fixtures import WorkFixture

SECRET = ("West handover", "Taco West")


class PrivacyTests(WorkFixture):
    def bodies(self, reader):
        urls = [
            "/api/v1/work/feed/",
            f"/api/v1/work/tasks/?assignee={self.csm.pk}",
            f"/api/v1/work/tasks/?assignee={self.csm.pk}&state=overdue",
        ]
        for scope in ("me", "team", "company"):
            urls.append(f"/api/v1/work/team/?scope={scope}")
        for scope in ("team", "company"):
            urls.append(f"/api/v1/work/feed/team/?scope={scope}")
        for url in urls:
            response = self.get(reader, url)
            if response.status_code == 200:
                yield url, json.dumps(response.data)
            else:
                self.assertEqual(response.status_code, 403, (url, response.data))

    def test_nobody_but_its_reader_sees_the_handover_named(self):
        for reader in (self.csm, self.mona, self.lee, self.stranger):
            for url, text in self.bodies(reader):
                for secret in SECRET:
                    with self.subTest(reader=reader.name, url=url, secret=secret):
                        self.assertNotIn(secret, text)
            with self.subTest(reader=reader.name, detail=True):
                self.assertEqual(
                    self.get(reader, f"/api/v1/tasks/{self.handed.pk}/").status_code, 404
                )

    def test_the_ones_who_read_it_do(self):
        body = self.ok(self.other, f"/api/v1/work/tasks/?assignee={self.csm.pk}")
        self.assertEqual([row["title"] for row in body["tasks"]], ["West handover"])
        self.assertEqual(self.get(self.other, f"/api/v1/tasks/{self.handed.pk}/").status_code, 200)
        body = self.ok(self.admin, f"/api/v1/work/tasks/?assignee={self.csm.pk}&state=overdue")
        self.assertIn("West handover", [row["title"] for row in body["tasks"]])
        self.assertEqual(self.get(self.admin, f"/api/v1/tasks/{self.handed.pk}/").status_code, 200)

    def test_another_workspace_sees_nothing_of_this_one(self):
        for url, text in self.bodies(self.stranger):
            with self.subTest(url=url):
                self.assertNotIn("Pizza Hut", text)
                self.assertNotIn("Carl CSM", text)
        self.assertEqual(
            self.get(self.stranger, f"/api/v1/tasks/{self.overdue.pk}/").status_code, 404
        )
        self.assertEqual(
            self.get(
                self.stranger, f"/api/v1/work/assignees/?customer={self.pizza.pk}"
            ).status_code,
            404,
        )


class DigestPrivacyTests(WorkFixture):
    def test_each_reader_sees_only_what_they_open(self):
        from services.work.digest import contents

        # Alice opens every record, so a task assigned to her is named in her digest.
        self.handed.assignee = self.admin
        self.handed.save()
        alice = contents(User.objects.get(pk=self.admin.pk), today=self.today)
        self.assertIn("West handover", alice[1])
        carl = contents(User.objects.get(pk=self.csm.pk), today=self.today)
        self.assertNotIn("West handover", carl[1])
        self.assertIsNone(contents(User.objects.get(pk=self.stranger.pk), today=self.today))
