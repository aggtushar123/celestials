from django.urls import path

from . import views

urlpatterns = [
    path("", views.SendListCreateView.as_view(), name="survey-send-list"),
    path("audience/", views.SendAudienceView.as_view(), name="survey-send-audience"),
    path("<int:pk>/", views.SendDetailView.as_view(), name="survey-send-detail"),
    path("<int:pk>/send/", views.SendNowView.as_view(), name="survey-send-now"),
    path("<int:pk>/answers/", views.SendAnswersView.as_view(), name="survey-send-answers"),
    path("<int:pk>/pending/", views.SendPendingView.as_view(), name="survey-send-pending"),
]
