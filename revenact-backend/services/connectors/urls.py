from django.urls import path

from . import (
    link_views,
    slack_channel_views,
    slack_events_views,
    slack_interactivity_views,
    slack_link_views,
    views,
)

urlpatterns = [
    path("", views.ConnectorListCreateView.as_view(), name="connector-list-create"),
    path(
        "oauth/<str:provider_key>/callback/",
        views.ConnectorOAuthCallbackView.as_view(),
        name="connector-oauth-callback",
    ),
    path("jira-link/", link_views.JiraLinkView.as_view(), name="jira-link"),
    path(
        "jira-link/callback/",
        link_views.JiraLinkCallbackView.as_view(),
        name="jira-link-callback",
    ),
    path("slack-link/", slack_link_views.SlackLinkView.as_view(), name="slack-link"),
    path(
        "slack-link/callback/",
        slack_link_views.SlackLinkCallbackView.as_view(),
        name="slack-link-callback",
    ),
    path(
        "slack/interactivity/",
        slack_interactivity_views.SlackInteractivityView.as_view(),
        name="slack-interactivity",
    ),
    path(
        "slack/events/",
        slack_events_views.SlackEventsView.as_view(),
        name="slack-events",
    ),
    path(
        "<int:pk>/slack-channels/",
        slack_channel_views.SlackChannelListView.as_view(),
        name="connector-slack-channels",
    ),
    path(
        "<int:pk>/slack-channels/<str:channel_id>/",
        slack_channel_views.SlackChannelDetailView.as_view(),
        name="connector-slack-channel",
    ),
    path("<int:pk>/", views.ConnectorDetailView.as_view(), name="connector-detail"),
    path("<int:pk>/connect/", views.ConnectorConnectView.as_view(), name="connector-connect"),
    path("<int:pk>/agents/", views.ConnectorAgentsView.as_view(), name="connector-agents"),
    path(
        "<int:pk>/credentials/",
        views.ConnectorCredentialsView.as_view(),
        name="connector-credentials",
    ),
    path("<int:pk>/sync/", views.ConnectorSyncView.as_view(), name="connector-sync"),
    path("<int:pk>/inbound/", views.ConnectorInboundView.as_view(), name="connector-inbound"),
]
