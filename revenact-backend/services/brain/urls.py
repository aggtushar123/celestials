from django.urls import path

from . import views

urlpatterns = [
    path("scopes/", views.ScopesView.as_view(), name="brain-scopes"),
    path("changed/", views.ChangedView.as_view(), name="brain-changed"),
    path("brief/", views.BriefView.as_view(), name="brain-brief"),
    path(
        "explanations/<str:metric>/",
        views.ExplanationView.as_view(),
        name="brain-explanation",
    ),
    path("doing/", views.DoingView.as_view(), name="brain-doing"),
    path("initiatives/", views.InitiativeCreateView.as_view(), name="brain-initiatives"),
    path("initiatives/<int:pk>/", views.InitiativeDetailView.as_view(), name="brain-initiative"),
    path("customers/", views.CustomersView.as_view(), name="brain-customers"),
    path("graph/", views.GraphView.as_view(), name="brain-graph"),
]
