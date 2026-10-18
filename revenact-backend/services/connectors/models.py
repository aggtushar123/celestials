from django.db import models

from services.accounts.models import Organisation, User
from services.mail import crypto


class Connector(models.Model):
    """One external system an organisation has connected — the Zendesk
    its support team lives in, the Jira its engineers file bugs into.

    Backs the "Tickets By Origin" chart on the Ticket Overview
    dashboard, and exists so a ticket can say where it came from
    (`customers.Ticket.connector`) rather than the dashboard grouping
    on free text.

    # Scope: empty means everywhere

    A connector with no linked `customers` and no linked `accounts`
    covers the **whole organisation**. Linking any narrows it to
    exactly those — so Apple can be on Zendesk while Kraft Heinz is on
    Jira, and an org-wide Slack connector needs no links at all.

    Empty-means-everything rather than requiring every customer to be
    listed: an admin shouldn't have to enumerate fifteen companies to
    say "all of them", and a new customer added tomorrow would silently
    fall outside an enumerated connector without anyone noticing. It's
    also the convention `Account.customers` already uses for "no
    restriction". The cost is that "covers nothing" is inexpressible —
    but that's what `is_enabled` is for, and a connector covering
    nothing would have no reason to exist.

    # Ticket sources and departments

    A ticket provider (Zendesk, Jira, Slack, Freshdesk, or any other
    system through the inbound webhook) is a live connection: an admin
    connects it with the organisation's own credentials (encrypted at
    rest, see `set_credentials`), the scheduler pulls new and changed
    tickets every few minutes (`sync.py`), and each ticket is filed on
    the customer or account its requester belongs to.

    Every ticket connector belongs to a **department** (`User.Function`):
    the Zendesk the support team lives in is Customer Success's, the Jira
    project is Engineering's. Tickets synced through it are stamped with
    that department, and only that department's people — and Leadership —
    can read them (services/customers/personal.py:visible_tickets). A
    connector with no department is everyone's."""

    class Provider(models.TextChoices):
        """The systems the product knows how to attribute a record to.

        Matches the vendor list the Integrations page already
        advertises (react-ts-app's pages/integrations/Integrations.tsx)
        so the two can't drift into naming the same tool differently.
        A closed set rather than free text, same reasoning as
        `Headline.DataSource`: an open field would let a connector
        claim to be a system this product has never heard of, and the
        origin chart would group on typos."""

        ZENDESK = "zendesk", "Zendesk"
        JIRA = "jira", "Jira Software"
        FRESHDESK = "freshdesk", "Freshdesk"
        WEBHOOK = "webhook", "Any other system (webhook)"
        INTERCOM = "intercom", "Intercom"
        SALESFORCE = "salesforce", "Salesforce"
        HUBSPOT = "hubspot", "HubSpot"
        SLACK = "slack", "Slack"
        GMAIL = "gmail", "Gmail"
        MS_TEAMS = "ms_teams", "Microsoft Teams"
        # Added when Call arrived: a recorded call has to be able to say which
        # meeting platform it came from, and Zoom was already advertised on the
        # Integrations page this list mirrors. tl;dv and Gong — what the
        # CallSense mock names — are deliberately absent, because that page
        # doesn't offer them and this list follows it rather than leading it.
        ZOOM = "zoom", "Zoom"
        GITHUB = "github", "GitHub"
        FIGMA = "figma", "Figma"

    class Status(models.TextChoices):
        NOT_CONNECTED = "not_connected", "Not connected"
        CONNECTED = "connected", "Connected"
        ERROR = "error", "Needs attention"

    organisation = models.ForeignKey(
        Organisation, related_name="connectors", on_delete=models.CASCADE
    )
    provider = models.CharField(max_length=32, choices=Provider.choices)
    department = models.CharField(
        max_length=16,
        choices=User.Function.choices,
        blank=True,
        default="",
        help_text="Whose tickets these are. Blank means the whole company may read them.",
    )
    #: Fernet-encrypted JSON: an API token, a bot token, or the webhook's
    #: shared secret. Restricted; never serialised.
    credentials = models.TextField(blank=True, default="")
    #: Non-secret setup: a Zendesk subdomain, a Jira site and project, a
    #: Slack channel.
    config = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NOT_CONNECTED)
    error = models.CharField(max_length=255, blank=True, default="")
    sync_cursor = models.CharField(max_length=512, blank=True, default="")
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_sync_note = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text='What the last pass did, e.g. "3 new, 2 updated, 1 without a matching account".',
    )
    #: What the tool says Revenact may do (agent bundles D3 §1.1): Slack's bot
    #: scopes, Jira's project permissions found by the last check.
    granted_scopes = models.JSONField(default=list, blank=True)
    #: "Allow agents to act" (D3-9): an admin's switch; Can act also needs the grant.
    agents_can_act = models.BooleanField(default=False)
    agents_allowed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    agents_allowed_at = models.DateTimeField(null=True, blank=True)
    name = models.CharField(
        max_length=100,
        help_text='Distinguishes two of the same provider, e.g. "Zendesk (EU)" '
        'alongside "Zendesk (US)".',
    )
    is_enabled = models.BooleanField(
        default=True,
        help_text="A disabled connector keeps its tickets and its history — it "
        "just stops being offered as somewhere new records can come from.",
    )
    customers = models.ManyToManyField(
        "customers.Customer",
        related_name="connectors",
        blank=True,
        help_text="Leave empty to cover every customer in the organisation.",
    )
    accounts = models.ManyToManyField(
        "customers.Account",
        related_name="connectors",
        blank=True,
        help_text="Leave empty to cover every account in the organisation.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["provider", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "provider", "name"],
                name="unique_connector_name_per_provider_per_organisation",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.get_provider_display()})"

    # Credentials never leave this pair of methods in clear.
    def set_credentials(self, data: dict):
        import json

        # SOC2:DATA-02 vendor tokens encrypted at rest
        self.credentials = crypto.encrypt(json.dumps(data)) if data else ""

    def get_credentials(self) -> dict:
        import json

        return json.loads(crypto.decrypt(self.credentials)) if self.credentials else {}

    @property
    def has_credentials(self) -> bool:
        return bool(self.credentials)

    @property
    def is_organisation_wide(self) -> bool:
        """True when nothing is linked — see this model's own docstring
        on why empty means everywhere."""
        return not self.customers.exists() and not self.accounts.exists()

    def covers(self, *, customer=None, account=None) -> bool:
        """Whether this connector applies to one Customer or Account.

        An account is covered by a connector linked to it *or* to one
        of its parent customers: connecting Zendesk to "Apple Inc"
        should cover Apple's regional accounts without naming each one,
        the same direction of travel record visibility already uses
        (services/customers/scoping.py). The reverse doesn't hold —
        linking one division doesn't put the parent company on
        Zendesk, because the other divisions may well be elsewhere."""

        if self.is_organisation_wide:
            return True
        if customer is not None:
            return self.customers.filter(pk=customer.pk).exists()
        if account is not None:
            return (
                self.accounts.filter(pk=account.pk).exists()
                or self.customers.filter(accounts=account).exists()
            )
        return False


class JiraLink(models.Model):
    """A person's own Atlassian account (agent bundles round 2 D2 contract
    §1.1): the Jira steps they run act as them on the sites it covers. One
    per person; one person per Atlassian account in a workspace (R2D2-3).
    Its tokens are theirs, encrypted at rest; only they read the link."""

    class Status(models.TextChoices):
        LINKED = "linked", "Linked"
        LOST = "lost", "Stopped working"

    organisation = models.ForeignKey(
        Organisation, related_name="jira_links", on_delete=models.CASCADE
    )
    user = models.OneToOneField(User, related_name="jira_link", on_delete=models.CASCADE)
    account_id = models.CharField(max_length=128)
    name = models.CharField(max_length=150)
    email = models.CharField(max_length=254, blank=True, default="")
    #: Fernet-encrypted JSON {access_token, refresh_token, expires_at}. Restricted;
    #: never serialised, logged or audited.
    credentials = models.TextField()
    #: Jira-scoped accessible resources: [{cloud_id, url, name}].
    sites = models.JSONField(default=list, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.LINKED)
    linked_at = models.DateTimeField(auto_now_add=True)
    refreshed_at = models.DateTimeField(null=True, blank=True)
    lost_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "account_id"],
                name="unique_jira_account_per_organisation",
            )
        ]

    def __str__(self):
        return f"{self.name} (Jira link)"

    # Credentials never leave this pair of methods in clear.
    def set_credentials(self, data: dict):
        import json

        # SOC2:DATA-02 a person's Atlassian tokens encrypted at rest
        self.credentials = crypto.encrypt(json.dumps(data))

    def get_credentials(self) -> dict:
        import json

        return json.loads(crypto.decrypt(self.credentials)) if self.credentials else {}


class SlackLink(models.Model):
    """A person's own Slack account (Connections page, 2026-10-16 spec §3
    Slack): the Slack replies their steps post go out as them, and the
    messages they write in synced channels are theirs. Mirrors JiraLink.
    User scopes only (`chat:write`, `users:read`): never a DM scope. One per
    person; one person per Slack account in a workspace. Its token is
    theirs, encrypted at rest; only they read the link."""

    class Status(models.TextChoices):
        LINKED = "linked", "Linked"
        LOST = "lost", "Stopped working"

    organisation = models.ForeignKey(
        Organisation, related_name="slack_links", on_delete=models.CASCADE
    )
    user = models.OneToOneField(User, related_name="slack_link", on_delete=models.CASCADE)
    team_id = models.CharField(max_length=32)
    slack_user_id = models.CharField(max_length=32)
    name = models.CharField(max_length=150)
    #: Fernet-encrypted JSON {access_token}. Restricted; never serialised,
    #: logged or audited.
    credentials = models.TextField()
    scopes = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.LINKED)
    linked_at = models.DateTimeField(auto_now_add=True)
    lost_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "slack_user_id"],
                name="unique_slack_user_per_organisation",
            )
        ]

    def __str__(self):
        return f"{self.name} (Slack link)"

    # Credentials never leave this pair of methods in clear.
    def set_credentials(self, data: dict):
        import json

        # SOC2:DATA-02 a person's Slack token encrypted at rest
        self.credentials = crypto.encrypt(json.dumps(data))

    def get_credentials(self) -> dict:
        import json

        return json.loads(crypto.decrypt(self.credentials)) if self.credentials else {}


class SlackChannel(models.Model):
    """One channel of a Slack connection (Slack escalations D3, contract
    §1.1, SC3-2): every public channel of the connection's Slack workspace,
    made by the listing, a channel_created event or the first message event
    from it, plus a connection's earlier private channel. An admin includes
    or excludes it and may set it to one customer or account (SC3-8). The
    catch-up's watermark and walk (SC3-6), the threads events missed (SC3-26)
    and the last event (SC3-30) live here. No message text is stored here."""

    MAX_MISSED = 50

    connector = models.ForeignKey(
        Connector, related_name="slack_channels", on_delete=models.CASCADE
    )
    channel_id = models.CharField(max_length=32)
    name = models.CharField(max_length=80, blank=True, default="")
    is_private = models.BooleanField(default=False)
    external_shared = models.BooleanField(default=False)
    is_member = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    included = models.BooleanField(default=True)
    chosen_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    chosen_at = models.DateTimeField(null=True, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    account = models.ForeignKey(
        "customers.Account", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    join_error = models.CharField(max_length=64, blank=True, default="")
    read_error = models.CharField(max_length=64, blank=True, default="")
    last_message_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    walk_before = models.CharField(max_length=32, blank=True, default="")
    walk_from = models.DateTimeField(null=True, blank=True)
    asked_at = models.DateTimeField(null=True, blank=True)
    missed = models.JSONField(default=list, blank=True)
    event_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["connector", "channel_id"], name="slack_channel_once"),
            models.CheckConstraint(
                condition=models.Q(customer__isnull=True) | models.Q(account__isnull=True),
                name="slack_channel_one_record",
            ),
        ]

    def __str__(self):
        return f"Slack channel {self.pk}"  # never the name in an audit row

    @property
    def record(self):
        return self.account if self.account_id is not None else self.customer


class SlackTagCheck(models.Model):
    """One synced Slack message that tags colleagues, waiting for the
    per-minute tick to ask whether it asks them to do something (channel tag
    to-dos, owner 2026-10-18; services/connectors/slack_tag_checks.py). Ids
    and the message's ts only: its text stays on the conversation. A row
    lives only until the tick has handled it (SOC2:DATA-06: purged once
    handled, expired after an hour)."""

    class State(models.TextChoices):
        PENDING = "pending", "Pending"
        CLAIMED = "claimed", "Claimed"

    connector = models.ForeignKey(Connector, related_name="tag_checks", on_delete=models.CASCADE)
    conversation = models.ForeignKey(
        "customers.SlackConversation", related_name="tag_checks", on_delete=models.CASCADE
    )
    channel = models.CharField(max_length=32)
    message_ts = models.CharField(max_length=32)
    #: The member who wrote the message: the to-dos are from them.
    author = models.ForeignKey(User, related_name="+", on_delete=models.CASCADE)
    state = models.CharField(max_length=8, choices=State.choices, default=State.PENDING)
    #: Model calls that failed: one retry on a later tick, then it is dropped.
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["connector", "channel", "message_ts"], name="slack_tag_check_once"
            )
        ]
        indexes = [models.Index(fields=["created_at"], name="slack_tag_check_age")]

    def __str__(self):
        return f"Slack tag check {self.pk}"  # never the message


class UnmatchedItem(models.Model):
    """A Slack message or Jira issue that matched no customer (agent bundles
    round 2 D3, contract §1.1, R2D3-2): kept minimised for its department's
    people to match or dismiss, deleted 30 days after it was last seen. No
    model reads it: it has no SignalThread until someone matches it."""

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        DISMISSED = "dismissed", "Dismissed"

    organisation = models.ForeignKey(
        Organisation, related_name="unmatched_items", on_delete=models.CASCADE
    )
    connector = models.ForeignKey(
        Connector, related_name="unmatched_items", on_delete=models.CASCADE
    )
    provider = models.CharField(max_length=16)
    department = models.CharField(max_length=16, blank=True, default="")
    external_id = models.CharField(max_length=128)
    number = models.CharField(max_length=32)
    title = models.CharField(max_length=255, blank=True, default="")
    #: SOC2:DATA-06 at most 2,000 characters of the item's text (R2D3-3);
    #: blanked on dismiss, never logged, never audited.
    excerpt = models.TextField(blank=True, default="")
    #: Slack escalations D1 (SE1-9): the records the message names, when it
    #: names more than one: [{"type": "customer" | "account", "id": n}], at most 5.
    candidates = models.JSONField(default=list, blank=True)
    requester_name = models.CharField(max_length=150, blank=True, default="")
    requester_email = models.CharField(max_length=254, blank=True, default="")
    url = models.CharField(max_length=500, blank=True, default="")
    priority = models.CharField(max_length=8, default="medium")
    opened_on = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.WAITING)
    first_seen_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    dismissed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["connector", "external_id"], name="unmatched_item_once")
        ]
        indexes = [
            models.Index(
                fields=["organisation", "department", "status", "last_seen_at"],
                name="unmatched_item_queue",
            )
        ]

    def __str__(self):
        # Never the text or the sender: an audit row may record this.
        return f"Unmatched item {self.pk}"
