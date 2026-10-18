from django.apps import AppConfig


class CalendarConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.calendar"
    label = "calendar_sync"
    verbose_name = "Google Calendar"
