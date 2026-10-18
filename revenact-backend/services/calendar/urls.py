"""Mounted at /api/v1/calendar/."""

from django.urls import path

from . import views

urlpatterns = [
    path("meetings/", views.MyMeetingsView.as_view(), name="calendar-meetings"),
    path(
        "customers/<int:customer_id>/meetings/",
        views.CustomerMeetingsView.as_view(),
        name="calendar-customer-meetings",
    ),
    path("status/", views.CalendarStatusView.as_view(), name="calendar-status"),
]
