from django.contrib import admin
from django.utils import timezone

from .models import Campaign, CampaignSend
from .sending import resume


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ["id", "organisation", "owner", "status", "sharing", "updated_at"]
    list_filter = ["status", "sharing"]
    raw_id_fields = ["owner", "segment", "shared_with", "recipients"]


@admin.register(CampaignSend)
class CampaignSendAdmin(admin.ModelAdmin):
    """A send stuck at `sending` (the process died mid-delivery) is finished
    here: anyone it was emailing when it stopped is skipped `failed`, once it
    is 10 minutes old, and the rest are emailed."""

    list_display = ["id", "campaign", "kind", "status", "started_at", "finished_at", "migrated"]
    list_filter = ["status", "kind", "migrated"]
    raw_id_fields = ["campaign", "rule", "review", "sent_by"]
    readonly_fields = ["counts", "subject", "body"]
    actions = ["finish_selected"]

    @admin.action(description="Finish the selected sends")
    def finish_selected(self, request, queryset):
        now, finished = timezone.now(), 0
        for send in queryset.filter(status=CampaignSend.Status.SENDING).order_by("pk"):
            finished += resume(send, now=now).status == CampaignSend.Status.SENT
        self.message_user(request, f"{finished} send(s) finished.")
