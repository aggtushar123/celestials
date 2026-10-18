"""The figures on a send: sent, answered, rate, the type's figure and its
bands (spec §1.6). The owner's cover every invite, since the audience was
resolved from their own view. Anyone else's cover only the people they may
open, so a shared send never leaks a figure about people the reader cannot
see. A failed invite was never sent and is not counted."""

from services.customers.scoping import visible_children_q

from .models import SurveyInvite
from .scores import bands, whole_figure, whole_percent


def rate(answered, sent):
    return whole_percent(answered, sent) if sent else None


def summary_invites(send, viewer):
    invites = send.invites.exclude(status=SurveyInvite.Status.FAILED)
    if send.owner_id == viewer.pk:
        return invites
    # SOC2:AUTH-02 a shared reader's figures cover only people they may open
    return invites.filter(visible_children_q(viewer))


def send_summary(send, viewer):
    rows = list(summary_invites(send, viewer).values_list("status", "score"))
    scores = [score for status, score in rows if status == SurveyInvite.Status.ANSWERED]
    return {
        "sent": len(rows),
        "answered": len(scores),
        "rate": rate(len(scores), len(rows)),
        "figure": whole_figure(send.survey_type, scores),
        "bands": bands(send.survey_type, scores),
    }
