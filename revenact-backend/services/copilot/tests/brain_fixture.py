"""The Brain Ask tests' world: BrainFixture's people and book (Carl owns
Pizza Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona, who owns
Soup Co; Dana owns Taco Bell and Taco West; Loose Ltd is nobody's; Alice is
an admin in Leadership who sees everything; Lee reads Company through
Leadership only and can open only Loose Ltd), with the makers for every Brain
tab: asks, anomalies, surveys and contacts (CustomersFixture), waiting items
(WaitingFixture), initiatives, plans and rules (DoingFixture)."""

from rest_framework.test import APIClient

from services.accounts.models import User
from services.brain.tests.customers_fixtures import CustomersFixture
from services.brain.tests.doing_fixtures import DoingFixture
from services.brain.tests.waiting_fixtures import WaitingFixture

URL = "/api/v1/copilot/messages/"


class BrainAskFixture(CustomersFixture, WaitingFixture, DoingFixture):
    @staticmethod
    def ask_context(scope="me", tab="changed"):
        return {"surface": "brain", "scope": scope, "tab": tab}

    def ground(self, user, scope="me", tab="changed", question="Why did these numbers move?"):
        """The grounding as SendMessageView builds it, for a fresh reader
        (no memoised org chart)."""
        from services.copilot.brain_grounding import build_brain_grounding

        reader = User.objects.get(pk=user.pk)
        return build_brain_grounding(
            reader, self.ask_context(scope, tab), question, today=self.today
        )

    def post_ask(self, user, context, content="Why did these numbers move?", **extra):
        api = APIClient()
        api.force_authenticate(User.objects.get(pk=user.pk))
        return api.post(URL, {"content": content, "context": context, **extra}, format="json")
