from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("internal/tick/<slug:task>/", views.TickView.as_view(), name="internal-tick"),
]
