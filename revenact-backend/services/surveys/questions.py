"""The one question each survey type asks, its scale, and its bands.

The wording is the standard one for the type, with the asking workspace's
name in it; the builder writes only the subject and an intro line (spec
Decisions, "Content")."""

NPS, CSAT, CES = "nps", "csat", "ces"

SCALES = {NPS: (0, 10), CSAT: (1, 5), CES: (1, 7)}

QUESTIONS = {
    NPS: "How likely are you to recommend {name} to a friend or colleague?",
    CSAT: "How satisfied are you with {name}?",
    CES: "How easy is it to get what you need from {name}?",
}

#: Low, middle and high band names, per type.
BANDS = {
    NPS: ("detractors", "passives", "promoters"),
    CSAT: ("low", "mid", "high"),
    CES: ("low", "mid", "high"),
}
#: The highest score in the low band (an NPS detractor).
LOW = {NPS: 6, CSAT: 2, CES: 3}
#: The lowest score in the high band (what the figure counts as a yes).
HIGH = {NPS: 9, CSAT: 4, CES: 5}


def question_for(survey_type, organisation_name):
    return QUESTIONS[survey_type].format(name=organisation_name)


def band_of(survey_type, score):
    low, middle, high = BANDS[survey_type]
    if score <= LOW[survey_type]:
        return low
    if score >= HIGH[survey_type]:
        return high
    return middle
