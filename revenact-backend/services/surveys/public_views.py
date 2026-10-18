"""The one-time survey link (spec §1.4): no sign-in. The link's secret is
the credential: it is looked up by its SHA-256 only, and every bad link
(unknown, expired, answered, failed) reads the same 404. Nothing about the
person or any other answer is returned."""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from core.throttling import SurveyLinkThrottle

from .models import SurveyInvite
from .questions import question_for
from .scores import record_answer
from .serializers import AnswerSerializer
from .tokens import hash_token

EXPIRED = {"detail": "This link has expired."}
#: A real token is 43 characters; anything far longer is not worth hashing.
MAX_TOKEN_LENGTH = 100


def _live(invites, token, now):
    """The pending, unexpired invite whose token this is, or None."""
    if len(token) > MAX_TOKEN_LENGTH:
        return None
    return invites.filter(
        token_hash=hash_token(token), status=SurveyInvite.Status.PENDING, expires_at__gt=now
    ).first()


class SurveyLinkView(APIView):
    """GET/POST /api/v1/public/surveys/<token>/. GET returns `{survey_type,
    question, intro, organisation_name}`. POST takes `{score, comment?}` and
    answers 204."""

    # SOC2:AUTH-02 public by design: the link's secret is the credential, looked up by
    # hash only, one answer, 14 days, one 404 body for every bad link
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SurveyLinkThrottle]  # SOC2:AUTH-06

    def get(self, request, token):
        invites = SurveyInvite.objects.select_related("send__organisation")
        invite = _live(invites, token, timezone.now())
        if invite is None:
            return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
        send = invite.send
        return Response(
            {
                "survey_type": send.survey_type,
                "question": question_for(send.survey_type, send.organisation.name),
                "intro": send.intro,
                "organisation_name": send.organisation.name,
            }
        )

    def post(self, request, token):
        now = timezone.now()
        with transaction.atomic():
            # Locked, and re-read as pending under the lock: a second answer,
            # even one racing this one, finds nothing and gets the same 404.
            invites = SurveyInvite.objects.select_for_update(of=("self",)).select_related(
                "send__organisation"
            )
            invite = _live(invites, token, now)
            if invite is None:
                return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
            serializer = AnswerSerializer(
                data=request.data, context={"survey_type": invite.send.survey_type}
            )
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            record_answer(invite, data["score"], data["comment"], now=now)
            audit.record(  # SOC2:LOG-01
                "survey.answered",
                # public: the token is the only credential, never request.user
                anonymous=True,
                request=request,
                organisation=invite.send.organisation,
                target=invite,
                metadata={"send": invite.send_id},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
