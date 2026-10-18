from django.urls import path

from . import bundle_views, outside_views, views

urlpatterns = [
    path("settings/", views.AgentSettingsView.as_view(), name="agent-settings"),
    path("actions/", views.ActionListView.as_view(), name="agent-actions"),
    path("actions/<int:pk>/", views.ActionDetailView.as_view(), name="agent-action"),
    path(
        "actions/<int:pk>/<str:decision>/",
        views.ActionDecisionView.as_view(),
        name="agent-action-decision",
    ),
    path("bundles/history/", bundle_views.BundleHistoryView.as_view(), name="agent-bundle-history"),
    path("bundles/<int:pk>/", bundle_views.BundleDetailView.as_view(), name="agent-bundle"),
    path("bundles/<int:pk>/run/", bundle_views.BundleRunView.as_view(), name="agent-bundle-run"),
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/",
        bundle_views.BundleStepView.as_view(),
        name="agent-bundle-step",
    ),
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/retry/",
        bundle_views.BundleRetryView.as_view(),
        name="agent-bundle-retry",
    ),
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/run/",
        bundle_views.BundleStepRunView.as_view(),
        name="agent-bundle-step-run",
    ),
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/report/",
        bundle_views.SalesReportView.as_view(),
        name="agent-bundle-step-report",
    ),
    path(
        "bundles/<int:pk>/stop/",
        bundle_views.BundleStopView.as_view(),
        name="agent-bundle-stop",
    ),
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/options/<str:name>/",
        outside_views.StepOptionsView.as_view(),
        name="agent-bundle-step-options",
    ),
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/jira-project/",
        outside_views.StepJiraProjectView.as_view(),
        name="agent-bundle-step-jira-project",
    ),
    path(
        "bundles/<int:pk>/reject/",
        bundle_views.BundleRejectView.as_view(),
        name="agent-bundle-reject",
    ),
    path(
        "bundles/<int:pk>/refresh/",
        bundle_views.BundleRefreshView.as_view(),
        name="agent-bundle-refresh",
    ),
    path(
        "bundles/<int:pk>/handler/",
        bundle_views.BundleHandlerView.as_view(),
        name="agent-bundle-handler",
    ),
    path("<str:kind>/run/", views.AgentRunView.as_view(), name="agent-run"),
]
