"""The one question per type, its scale, its bands, and the figures the
scores are made of."""

from decimal import Decimal

from django.test import SimpleTestCase

from services.surveys.questions import SCALES, band_of, question_for
from services.surveys.scores import bands, figure, percent, whole_percent


class QuestionTests(SimpleTestCase):
    def test_each_type_asks_its_standard_question_with_the_workspace_name(self):
        self.assertEqual(
            question_for("nps", "Acme Inc"),
            "How likely are you to recommend Acme Inc to a friend or colleague?",
        )
        self.assertEqual(question_for("csat", "Acme Inc"), "How satisfied are you with Acme Inc?")
        self.assertEqual(
            question_for("ces", "Acme Inc"), "How easy is it to get what you need from Acme Inc?"
        )

    def test_a_name_with_braces_is_only_text(self):
        self.assertEqual(question_for("csat", "{x}"), "How satisfied are you with {x}?")

    def test_the_scales(self):
        self.assertEqual(SCALES, {"nps": (0, 10), "csat": (1, 5), "ces": (1, 7)})

    def test_the_band_edges(self):
        nps = [band_of("nps", score) for score in (0, 6, 7, 8, 9, 10)]
        self.assertEqual(
            nps, ["detractors", "detractors", "passives", "passives", "promoters", "promoters"]
        )
        self.assertEqual(
            [band_of("csat", s) for s in (1, 2, 3, 4, 5)], ["low"] * 2 + ["mid"] + ["high"] * 2
        )
        self.assertEqual(
            [band_of("ces", s) for s in (1, 3, 4, 5, 7)], ["low", "low", "mid", "high", "high"]
        )


class FigureTests(SimpleTestCase):
    def test_nps_is_promoters_minus_detractors(self):
        self.assertEqual(figure("nps", [10, 9, 8, 0]), Decimal("25.00"))
        self.assertEqual(figure("nps", [9, 9, 6]), Decimal("33.33"))
        self.assertEqual(figure("nps", [0, 3]), Decimal("-100.00"))

    def test_csat_is_the_share_answering_4_or_5(self):
        self.assertEqual(figure("csat", [5, 4, 3, 1]), Decimal("50.00"))
        self.assertEqual(figure("csat", [5, 4, 1]), Decimal("66.67"))

    def test_ces_is_the_share_answering_5_to_7(self):
        self.assertEqual(figure("ces", [7, 5, 4, 1]), Decimal("50.00"))
        self.assertEqual(figure("ces", [5, 6, 7]), Decimal("100.00"))

    def test_no_answers_is_no_figure(self):
        self.assertIsNone(figure("nps", []))

    def test_rounding_is_half_up(self):
        self.assertEqual(percent(2, 3), Decimal("66.67"))
        self.assertEqual(
            [whole_percent(*share) for share in ((1, 3), (2, 3), (1, 200), (-1, 200), (-1, 3))],
            [33, 67, 1, -1, -33],
        )

    def test_bands_count_every_answer(self):
        self.assertEqual(
            bands("nps", [10, 7, 0, 6]), {"detractors": 2, "passives": 1, "promoters": 1}
        )
        self.assertEqual(bands("ces", []), {"low": 0, "mid": 0, "high": 0})
