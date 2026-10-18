from django.urls import path

from . import views

urlpatterns = [
    path("", views.PlanListCreateView.as_view(), name="plan-list"),
    path("templates/", views.TemplateListCreateView.as_view(), name="plan-template-list"),
    path("templates/<int:pk>/", views.TemplateDetailView.as_view(), name="plan-template-detail"),
    path("<int:pk>/", views.PlanDetailView.as_view(), name="plan-detail"),
    path("<int:pk>/start/", views.PlanStartView.as_view(), name="plan-start"),
    path(
        "<int:pk>/save-as-template/",
        views.SaveAsTemplateView.as_view(),
        name="plan-save-as-template",
    ),
    path("<int:pk>/milestones/", views.MilestoneCreateView.as_view(), name="plan-milestones"),
    path(
        "<int:pk>/milestones/reorder/",
        views.MilestoneReorderView.as_view(),
        name="plan-milestones-reorder",
    ),
    path(
        "<int:pk>/milestones/<int:mid>/",
        views.MilestoneDetailView.as_view(),
        name="plan-milestone-detail",
    ),
    path("<int:pk>/tasks/", views.PlanTaskCreateView.as_view(), name="plan-tasks"),
    path("<int:pk>/tasks/<int:tid>/", views.PlanTaskDetailView.as_view(), name="plan-task-detail"),
]
