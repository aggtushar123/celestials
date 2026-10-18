"""Mounted at /api/v1/email-agent/."""

from django.urls import path

from . import views

urlpatterns = [
    path("proposals/<int:pk>/", views.ProposalView.as_view(), name="email-agent-proposal"),
    path("proposals/<int:pk>/book/", views.ProposalBookView.as_view(), name="email-agent-book"),
    path(
        "proposals/<int:pk>/dismiss/",
        views.ProposalDismissView.as_view(),
        name="email-agent-dismiss",
    ),
    path("tasks/<int:task_id>/undo/", views.TaskUndoView.as_view(), name="email-agent-undo"),
    path(
        "suggestions/<int:pk>/<str:verb>/",
        views.SuggestionDecideView.as_view(),
        name="email-agent-suggestion",
    ),
]
