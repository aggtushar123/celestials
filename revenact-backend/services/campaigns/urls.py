from django.urls import path

from . import public_views, views

urlpatterns = [
    path(
        "unsubscribe/<str:token>/",
        public_views.UnsubscribeView.as_view(),
        name="campaign-unsubscribe",
    ),
    path("", views.CampaignListCreateView.as_view(), name="campaign-list"),
    path("<int:pk>/", views.CampaignDetailView.as_view(), name="campaign-detail"),
    path("<int:pk>/audience/", views.CampaignAudienceView.as_view(), name="campaign-audience"),
    path("<int:pk>/preview/", views.CampaignPreviewView.as_view(), name="campaign-preview"),
    path("<int:pk>/sends/", views.CampaignSendsView.as_view(), name="campaign-sends"),
    path(
        "<int:pk>/sends/<int:send_id>/",
        views.CampaignSendDetailView.as_view(),
        name="campaign-send-detail",
    ),
    path(
        "<int:pk>/sends/<int:send_id>/deliveries/",
        views.CampaignDeliveriesView.as_view(),
        name="campaign-send-deliveries",
    ),
]
