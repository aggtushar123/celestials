"""`readable_send_ids` is `readable_sends` as `id IN` subqueries with no
DISTINCT (Brain delivery 4 Contract note 4)."""

from services.surveys.access import readable_send_ids, readable_sends
from services.surveys.models import SurveySend
from services.surveys.tests.fixtures import SurveyFixture


class ReadableSendIdsTests(SurveyFixture):
    def test_the_same_sends_as_readable_sends_without_distinct(self):
        self.make_send(owner=self.csm)
        self.make_send(owner=self.csm, sharing=SurveySend.Sharing.WORKSPACE)
        self.make_send(owner=self.other)
        shared = self.make_send(owner=self.other, sharing=SurveySend.Sharing.PEOPLE)
        shared.shared_with.add(self.csm)
        elsewhere = self.make_send(owner=self.other, sharing=SurveySend.Sharing.PEOPLE)
        elsewhere.shared_with.add(self.admin)
        for user in (self.csm, self.other, self.admin, self.stranger):
            with self.subTest(user=user.name):
                ids = set(
                    SurveySend.objects.filter(id__in=readable_send_ids(user)).values_list(
                        "id", flat=True
                    )
                )
                self.assertEqual(ids, set(readable_sends(user).values_list("id", flat=True)))
        sql = str(SurveySend.objects.filter(id__in=readable_send_ids(self.csm)).query)
        self.assertNotIn("DISTINCT", sql.upper())
