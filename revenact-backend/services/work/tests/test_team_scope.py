"""The Team queue's scope (delivery 2 contract §1.1): team needs reports,
company needs view-all or Leadership, the default is the widest, and `me`
is refused. Its people are the scope's members other than the reader."""

from services.accounts.models import User
from services.brain.scope import ScopeNotAllowed
from services.work.team_scope import TeamScopeUnknown, named, people, resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamScopeTests(FeedFixture):
    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def test_the_default_is_the_widest_team_scope(self):
        self.assertEqual(resolve_team(self.fresh(self.mona), None).key, "team")
        self.assertEqual(resolve_team(self.fresh(self.admin), None).key, "company")
        self.assertEqual(resolve_team(self.fresh(self.lee), None).key, "company")

    def test_a_reader_with_neither_is_refused(self):
        for reader in (self.csm, self.other):
            with self.subTest(reader=reader.name), self.assertRaises(ScopeNotAllowed):
                resolve_team(self.fresh(reader), None)

    def test_me_and_unknown_keys_are_not_team_scopes(self):
        for key in ("me", "", "everyone"):
            with self.subTest(key=key), self.assertRaises(TeamScopeUnknown) as caught:
                resolve_team(self.fresh(self.mona), key)
            self.assertEqual(caught.exception.detail, "Choose team or company.")
            self.assertEqual(caught.exception.code, "SCOPE_UNKNOWN")

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        with self.assertRaises(ScopeNotAllowed):
            resolve_team(self.fresh(self.mona), "company")
        with self.assertRaises(ScopeNotAllowed):
            resolve_team(self.fresh(self.admin), "team")

    def test_people_are_the_scopes_members_but_the_reader(self):
        mona = self.fresh(self.mona)
        self.assertEqual(
            sorted(row["id"] for row in people(mona, resolve_team(mona, "team"))), [self.csm.pk]
        )
        admin = self.fresh(self.admin)
        company = sorted(row["id"] for row in people(admin, resolve_team(admin, "company")))
        self.assertNotIn(self.admin.pk, company)
        self.assertNotIn(self.stranger.pk, company)
        self.assertEqual(company, sorted([self.lee.pk, self.mona.pk, self.csm.pk, self.other.pk]))

    def test_rest_of_company_leaves_out_the_readers_reports(self):
        from services.work.team_scope import near

        User.objects.filter(pk=self.other.pk).update(reports_to=self.admin)
        admin = self.fresh(self.admin)
        scope = resolve_team(admin, "company")
        self.assertEqual(sorted(near(admin, scope)), sorted([self.admin.pk, self.other.pk]))
        self.assertNotIn(self.other.pk, [row["id"] for row in people(admin, scope)])

    def test_named(self):
        self.assertEqual(named(self.csm), {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertIsNone(named(None))
