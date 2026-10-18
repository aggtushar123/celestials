from django.urls import path

from . import views

urlpatterns = [
    path("", views.RuleListCreateView.as_view(), name="rule-list"),
    path("test/", views.RuleTestView.as_view(), name="rule-test"),
    path("reviews/", views.ReviewListView.as_view(), name="rule-review-list"),
    path(
        "reviews/<int:pk>/approve/",
        views.ReviewApproveView.as_view(),
        name="rule-review-approve",
    ),
    path("reviews/<int:pk>/skip/", views.ReviewSkipView.as_view(), name="rule-review-skip"),
    path("<int:pk>/", views.RuleDetailView.as_view(), name="rule-detail"),
    path("<int:pk>/runs/", views.RuleRunsView.as_view(), name="rule-runs"),
    path(
        "<int:pk>/runs/<int:run_id>/",
        views.RuleRunDetailView.as_view(),
        name="rule-run-detail",
    ),
]
