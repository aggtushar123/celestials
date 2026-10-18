"""Delivery 1 follow-ups (agent bundles D2 contract D2-29, D2-31): a new
survey or campaign send step starts as "Save as draft only", so it is
undoable until a person turns the switch off; a campaign step's body may be
as long as the campaign page allows."""

from services.agents import evidence, prompt
from services.agents.actions import campaign_sends, campaigns, surveys
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import MAX_BODY


class SendDefaultsTests(AgentsFixture):
    def ctx(self):
        return evidence.build(self.org, "ops", today=self.today)

    def test_a_new_survey_send_starts_as_a_draft(self):
        clean = surveys.validate(
            {
                "name": "Q4 NPS",
                "survey_type": "nps",
                "subject": "Two minutes?",
                "intro": "",
                "segment": definition(),
                "roles": ["champion"],
            },
            None,
            self.ctx(),
            [],
        )
        self.assertIs(clean["draft_only"], True)

    def test_a_new_campaign_send_starts_as_a_draft(self):
        clean = campaign_sends.validate(
            {
                "name": "Check-in",
                "segment": definition(),
                "roles": ["champion"],
                "subject": "Hello",
                "body": "Hi {first_name}",
            },
            None,
            self.ctx(),
            [],
        )
        self.assertIs(clean["draft_only"], True)

    def test_a_campaign_body_may_be_as_long_as_the_campaign_page_allows(self):
        self.assertEqual((campaigns.BODY_LIMIT, MAX_BODY), (5000, 5000))
        body = "Hi {first_name}. " + "x" * 4900
        clean = campaigns.validate(
            {
                "name": "Long",
                "segment": definition(),
                "roles": ["champion"],
                "subject": "Hello",
                "body": body,
            },
            None,
            self.ctx(),
            [],
        )
        self.assertEqual(clean["body"], body)
        self.assertIn("at most 5000 characters", prompt.PAYLOADS["campaign.create"])
        self.assertIn("at most 5000 characters", prompt.PAYLOADS["campaign.send"])
