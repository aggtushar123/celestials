from django.apps import AppConfig


class EmailAgentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.emailagent"
    label = "emailagent"
    verbose_name = "Email agent"
