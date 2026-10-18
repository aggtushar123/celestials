from django.http import Http404

from services.plans import drafting
from services.plans.tests.fixtures import PlanFixture


class StartFromDraftGoneTests(PlanFixture):
    def test_a_missing_plan_is_a_404(self):
        with self.assertRaises(Http404):
            drafting.start_from_draft(0, actor=self.mona, today=self.today)
