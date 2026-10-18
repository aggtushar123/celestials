from django.urls import path

from . import slack_views, unmatched_views, views

urlpatterns = [
    path("todos/", views.TodoCreateView.as_view(), name="work-todos"),
    path("feed/", views.FeedView.as_view(), name="work-feed"),
    path("feed/count/", views.FeedCountView.as_view(), name="work-feed-count"),
    path("feed/team/", views.TeamQueueView.as_view(), name="work-feed-team"),
    path("unmatched/", unmatched_views.UnmatchedListView.as_view(), name="work-unmatched"),
    path(
        "unmatched/<int:pk>/match/",
        unmatched_views.UnmatchedMatchView.as_view(),
        name="work-unmatched-match",
    ),
    path(
        "unmatched/<int:pk>/dismiss/",
        unmatched_views.UnmatchedDismissView.as_view(),
        name="work-unmatched-dismiss",
    ),
    path(
        "slack-messages/<int:pk>/",
        slack_views.SlackMessageView.as_view(),
        name="work-slack-message",
    ),
    path(
        "slack-messages/<int:pk>/jira/",
        slack_views.SlackMessageJiraView.as_view(),
        name="work-slack-message-jira",
    ),
    path(
        "slack-messages/<int:pk>/reply/",
        slack_views.SlackMessageReplyView.as_view(),
        name="work-slack-message-reply",
    ),
    path("queues/", views.QueuesView.as_view(), name="work-queues"),
    path("tasks/", views.TaskDrillView.as_view(), name="work-tasks"),
    path("assignees/", views.AssigneesView.as_view(), name="work-assignees"),
    path("team/", views.TeamView.as_view(), name="work-team"),
    path("recommendations/", views.RecommendationListView.as_view(), name="work-recommendations"),
    path(
        "recommendations/refresh/",
        views.RecommendationRefreshView.as_view(),
        name="work-recommendations-refresh",
    ),
    path(
        "recommendations/<int:pk>/assign/",
        views.RecommendationAssignView.as_view(),
        name="work-recommendation-assign",
    ),
    path(
        "recommendations/<int:pk>/dismiss/",
        views.RecommendationDismissView.as_view(),
        name="work-recommendation-dismiss",
    ),
    path("settings/", views.WorkSettingsView.as_view(), name="work-settings"),
]
