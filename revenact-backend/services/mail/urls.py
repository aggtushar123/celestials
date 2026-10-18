from django.urls import path

from . import draft_views, views

urlpatterns = [
    path("mail/connection/", views.MyMailboxView.as_view(), name="mailbox"),
    path("mail/connect/<str:provider_key>/", views.ConnectView.as_view(), name="mailbox-connect"),
    path(
        "mail/oauth/<str:provider_key>/callback/",
        views.OAuthCallbackView.as_view(),
        name="mailbox-oauth-callback",
    ),
    path("mail/sync/", views.SyncNowView.as_view(), name="mailbox-sync"),
    path("mail/messages/", views.MailMessageListView.as_view(), name="mail-messages"),
    path("mail/messages/summary/", views.MailSummaryView.as_view(), name="mail-summary"),
    path("mail/messages/<int:pk>/", views.MailMessageDetailView.as_view(), name="mail-message"),
    path("mail/messages/<int:pk>/reply/", views.MailReplyView.as_view(), name="mail-reply"),
    path("mail/messages/<int:pk>/share/", views.MailMessageShareView.as_view(), name="mail-share"),
    path("mail/messages/<int:pk>/thread/", views.MailThreadView.as_view(), name="mail-thread"),
    path("mail/threads/", views.MailThreadListView.as_view(), name="mail-threads"),
    path("mail/actions/", views.MailActionsView.as_view(), name="mail-actions"),
    path("mail/labels/", views.MailLabelListView.as_view(), name="mail-labels"),
    path("mail/compose/", draft_views.MailComposeView.as_view(), name="mail-compose"),
    path("mail/drafts/", draft_views.MailDraftListView.as_view(), name="mail-drafts"),
    path(
        "mail/drafts/discard/",
        draft_views.MailDraftDiscardView.as_view(),
        name="mail-drafts-discard",
    ),
    path("mail/drafts/<int:pk>/", draft_views.MailDraftView.as_view(), name="mail-draft"),
    path(
        "mail/drafts/<int:pk>/attachments/",
        draft_views.MailDraftAttachmentsView.as_view(),
        name="mail-draft-attachments",
    ),
    path(
        "mail/drafts/<int:pk>/attachments/<int:attachment_id>/",
        draft_views.MailDraftAttachmentView.as_view(),
        name="mail-draft-attachment",
    ),
    path(
        "mail/drafts/<int:pk>/send/",
        draft_views.MailDraftSendView.as_view(),
        name="mail-draft-send",
    ),
    path(
        "mail/drafts/<int:pk>/confirm-sent/",
        draft_views.MailDraftConfirmSentView.as_view(),
        name="mail-draft-confirm-sent",
    ),
    path(
        "mail/drafts/<int:pk>/reopen/",
        draft_views.MailDraftReopenView.as_view(),
        name="mail-draft-reopen",
    ),
    path(
        "mail/attachments/<int:pk>/download/",
        views.MailAttachmentDownloadView.as_view(),
        name="mail-attachment-download",
    ),
    path("mail/gmail/search/", draft_views.GmailSearchView.as_view(), name="mail-gmail-search"),
    path(
        "mail/gmail/search/open/",
        draft_views.GmailSearchOpenView.as_view(),
        name="mail-gmail-search-open",
    ),
    path("mail/google/push/", views.GmailPushView.as_view(), name="mail-google-push"),
    path(
        "customers/<int:customer_id>/emails/send/",
        views.CustomerComposeView.as_view(),
        name="customer-email-send",
    ),
    path(
        "customers/<int:customer_id>/accounts/<int:account_id>/emails/send/",
        views.AccountComposeView.as_view(),
        name="account-email-send",
    ),
]
