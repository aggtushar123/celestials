from django.urls import path

from .public_views import SurveyLinkView

urlpatterns = [
    path("<str:token>/", SurveyLinkView.as_view(), name="survey-link"),
]
