"""What the brain's agents may do — the catalogue.

Every model call in the product goes through one function under one
purpose, and every purpose is one skill: a fixed job with a fixed reach.
This module writes those jobs down in one place, beside the figures that
show how each has actually been used this month — so management can read
what the agents are allowed to do, what they read, what they may never do,
and what each has produced, without reading a prompt.

The catalogue is code, not a table: a skill's reach is set by its prompt
and its view, and this is the one place that description lives. Adding a
purpose without describing it here fails a test.
"""

from dataclasses import asdict, dataclass

from django.db.models import Count, Q

from services.customers.models import Headline
from services.metrics.models import AgentAction, Brief, Explanation

from . import usage
from .models import Message, ModelCall


@dataclass(frozen=True)
class Skill:
    purpose: str
    name: str
    summary: str
    #: What the agent is given. Nothing it is not given can reach it.
    reads: tuple
    #: What it may do with that.
    may: tuple
    #: What it may never do, whatever it is asked.
    never: tuple
    trigger: str
    gate: str
    #: Where in the product it shows.
    surface: str


SKILLS = (
    Skill(
        "copilot",
        "Copilot chat",
        "Answers a person's question about their own book, citing the records it drew on.",
        (
            "The asker's own book: customers, health, renewals, tickets, recent activity",
            "The records retrieval finds for the question",
            "The conversation so far, and who said what in a shared session",
        ),
        ("Answer in prose", "Quote the records it used as sources on the reply"),
        ("Change a record", "Send anything to a customer", "See accounts outside the asker's book"),
        "A person sends a message",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/copilot",
    ),
    Skill(
        "dashboard",
        "Ask Revenact on the Dashboard",
        "Answers a question about what the dashboard shows, from the same figures and "
        "the records behind them.",
        (
            "The figures on the asker's screen, recomputed for its area, view and filters",
            "The records retrieval finds for the companies asked about, under the asker's "
            "own visibility",
            "The conversation so far",
        ),
        ("Answer in prose", "Quote the records it used as sources on the reply"),
        (
            "Change a record",
            "Send anything to a customer",
            "See accounts outside the asker's filtered book",
            "Take figures from the client",
        ),
        "A person asks from the Dashboard's Ask rail",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/dashboard",
    ),
    Skill(
        "organizations",
        "Ask Revenact on Organizations",
        "Answers a question about the accounts in view on Organizations, from the same list "
        "and the records behind it.",
        (
            "The asker's list recomputed for its view and filters: the summary tiles, the "
            "sections, the ten riskiest accounts and the renewals due within 90 days",
            "On one organisation's page: its portfolio row, what needs attention, its story "
            "counts and its story items from the last 30 days (at most 25), narrowed by the "
            "account chip, each under its own record rule",
            "The records retrieval finds for the companies asked about, under the asker's "
            "own visibility",
            "The conversation so far",
        ),
        ("Answer in prose", "Quote the records it used as sources on the reply"),
        (
            "Change a record",
            "Send anything to a customer",
            "See accounts outside the asker's filtered book",
            "Take figures from the client",
        ),
        "A person asks from the Organizations page's Ask rail",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/organizations",
    ),
    Skill(
        "contacts",
        "Ask Revenact on Contacts",
        "Answers a question about the people on the Contacts page, or one person, from the "
        "same list or profile and the records behind it.",
        (
            "On the list: the asker's filtered contacts recomputed with the page's code, the "
            "summary line and at most 50 people",
            "On one person: their profile, their sentiment, and their calls, emails and tickets "
            "(the newest 20 of each) under each record's own rule",
            "Why a sentiment: only the records the asker may read, weighted by kind and recency",
            "The conversation so far",
        ),
        ("Answer in prose",),
        (
            "Change a record",
            "Send anything to a customer",
            "See people or records outside the asker's visibility",
            "Count or describe records the asker cannot open",
            "Take figures from the client",
        ),
        "A person asks from the Contacts page's Ask rail",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/contacts",
    ),
    Skill(
        "accounts",
        "Ask Revenact on Accounts",
        "Answers a question about the accounts in view on Accounts, or one account, from the "
        "same list, Board or account page and the records behind it.",
        (
            "On the list or the Board: the asker's accounts recomputed with the portfolio's "
            "code for the page's filters — the summary tiles, the sections, the ten riskiest "
            "accounts and the renewals due within 90 days",
            "On one account's page: its portfolio row, what needs attention, its story counts "
            "and its story items from the last 30 days (at most 25), and the story item asked "
            "about, each under its own record rule",
            "The records retrieval finds for the question on that account, under the asker's "
            "own visibility",
            "The conversation so far",
        ),
        ("Answer in prose", "Quote the records it used as sources on the reply"),
        (
            "Change a record",
            "Send anything to a customer",
            "See accounts or records outside the asker's visibility",
            "Quote the AI pulse reason or anything counted under another person's rules",
            "Take figures from the client",
        ),
        "A person asks from the Accounts list, Board or an account's page Ask rail",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/accounts",
    ),
    Skill(
        "pipelines",
        "Ask Revenact on Pipelines",
        "Answers a question about the opportunities or risks in view on Pipelines, from the "
        "same List or Board.",
        (
            "The asker's opportunities or risks recomputed with the Pipelines book's code for "
            "the page's kind and filters — the summary tiles over every stage, the sections, "
            "the ten largest items listed, what is overdue and what closes or is due within 90 "
            "days (at most 25 each)",
            "The item asked about, read again under the same two rules",
            "The conversation so far",
        ),
        ("Answer in prose", "Name the items it drew on by their title"),
        (
            "Change a record",
            "Send anything to a customer",
            "See opportunities, risks, organisations or accounts outside the asker's visibility",
            "Read another department's opportunities or risks unless the asker may",
            "Take figures from the client",
        ),
        "A person asks from the Pipelines List or Board Ask rail",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/pipelines",
    ),
    Skill(
        "brain",
        "Ask on the Brain",
        "Answers a question about one Brain tab — What changed, Waiting on you, What's being "
        "done or Customers — for the scope the asker is on: Me, My team or Company.",
        (
            "The tab the asker is on, rebuilt with the Brain page's own code for their scope: "
            "only what they may open is named, the rest is counted",
            "One line for each of the other three tabs",
            "The scope's latest brief, when the asker may read it",
            "The conversation so far",
        ),
        ("Answer in prose", "Name customers only as the tab names them"),
        (
            "Change a record",
            "Send anything to a customer",
            "Use a scope the asker may not use",
            "Name or count a record outside the asker's visibility",
            "Take figures from the client",
        ),
        "A person asks from the Ask rail on one of the four Brain tabs",
        "Any signed-in user, while the organisation's AI agent is enabled",
        "/brain",
    ),
    Skill(
        "headlines",
        "Account headlines",
        "Summarises one account's last three months of real activity into headlines.",
        (
            "The account's emails, calls, tickets, notes and activity for 90 days",
            "At most 25 recent records per source",
        ),
        ("Write headline rows for the account's Headlines card",),
        ("Change a record", "Invent an event the records do not show"),
        "A person asks for headlines on an account",
        "Any user who can see the account",
        "/dashboard (account Headlines card)",
    ),
    Skill(
        "classification",
        "Interaction classifier",
        "Tags emails, calls and tickets with area, category, subcategory and sentiment.",
        (
            "The text of each unclassified email, call or ticket",
            "The organisation's taxonomy of areas, categories and subcategories",
        ),
        ("Write the four tags on each record", "Leave a record unplaced when unsure"),
        (
            "Overwrite a tag a person corrected",
            "Use a category or subcategory outside the taxonomy",
        ),
        "The classify_interactions job",
        "Scheduled; corrections outrank it",
        "/dashboard/ai-trending",
    ),
    Skill(
        "brief",
        "Management brief",
        "Writes the organisation's brief from the metric layer.",
        (
            "Every headline metric, its value and its move since the month-end",
            "What moved materially, and the top cuts",
        ),
        ("Write a headline, a body and 2-4 things to watch", "Keep its evidence beside the text"),
        ("Read individual records or name customers", "Recommend an action"),
        "A manager asks for a brief",
        "view_all_accounts",
        "/brain/dashboard",
    ),
    Skill(
        "proposals",
        "Ops agent",
        "Proposes the next actions from the figures, into the review queue.",
        (
            "The metric layer, the signals, the cuts",
            "The accounts carrying the downside, with owner and renewal",
            "The team, and the decisions already open",
        ),
        ("Propose a task on an account", "Propose an initiative on a number"),
        (
            "Run anything without approval",
            "Send emails or campaigns, or change a price",
            "Name an account, person or metric it was not given",
        ),
        "A manager asks the agent",
        "view_all_accounts; approval executes through the same paths a person uses",
        "/brain/review",
    ),
    Skill(
        "agent_cs",
        "CS agent",
        "Proposes bundles of steps on the CS book, for a person to run.",
        (
            "The Customer Success book: records, owners, health, renewals, tasks, notes",
            "The team and the decisions already open",
        ),
        ("Propose a lifecycle, owner or attribute change, a task, or a note on a record",),
        (
            "Send anything to a customer",
            "Act outside the kinds this agent is allowed",
            "Name a record, person or metric it was not given",
        ),
        "The nightly pass, or an admin's Run now",
        "view_all_accounts; each action is decided by the record's owner, their chain or view-all",
        "/work?queue=history",
    ),
    Skill(
        "agent_sales",
        "Sales agent",
        "Proposes bundles of steps on the sales book, for a person to run.",
        (
            "The Sales book: records, owners, renewals, open tasks and recent notes",
            "The team and the decisions already open",
        ),
        ("Propose a lifecycle, owner or attribute change, a task, or a note on a record",),
        (
            "Send anything to a customer",
            "Act outside the kinds this agent is allowed",
            "Name a record, person or metric it was not given",
        ),
        "The nightly pass, or an admin's Run now",
        "view_all_accounts; each action is decided by the record's owner, their chain or view-all",
        "/work?queue=history",
    ),
    Skill(
        "agent_ops",
        "Ops agent (actions)",
        "Proposes bundles of steps across every live record and the workspace figures.",
        (
            "Every live record and the metric layer, the signals and the cuts",
            "The team and the decisions already open",
        ),
        ("Propose record actions, tasks, notes and initiatives",),
        (
            "Send anything to a customer",
            "Act outside the kinds this agent is allowed",
            "Name a record, person or metric it was not given",
        ),
        "The nightly pass, or an admin's Run now",
        "view_all_accounts; each action is decided by the record's owner, their chain or view-all",
        "/work?queue=history",
    ),
    Skill(
        "facilitator",
        "Session facilitator",
        "Writes what the people in a live session decided, into the review queue.",
        (
            "The session's transcript, with each human turn's author",
            "Who took part, and who handed off to whom",
            "The same figures the Ops agent sees",
        ),
        ("Propose a task or an initiative that the people agreed to",),
        (
            "Record an idea nobody took up as a decision",
            "Run anything without approval",
            "Send anything to a customer",
        ),
        "A participant presses Capture decisions",
        "Any accepted participant of the session; approval stays with the review queue",
        "/copilot (live session)",
    ),
    Skill(
        "explain",
        "Metric explanations",
        "Says why one metric is where it is, in two to four sentences.",
        (
            "The metric's definition, its value now and at the month-end",
            "Every cut of it, with each member's own move",
            "The accounts carrying the downside, and open decisions on the number",
        ),
        ("Explain the level or the move, citing the figures",),
        ("Give advice", "Invent a figure, or guess at anything unmeasured"),
        "A manager presses Why? on a metric",
        "view_all_accounts",
        "/brain/dashboard",
    ),
    Skill(
        "draft_reply",
        "Reply drafts",
        "Writes a reply for a person to edit and send from their own mailbox.",
        (
            "The thread being answered",
            "The account's history, under the asker's own visibility",
        ),
        ("Draft the body of one reply", "Name the records it leaned on"),
        (
            "Send anything",
            "Read mail outside the asker's own mailbox and chain",
            "Promise what the records do not say",
        ),
        "A person presses Draft with Copilot in a reply box",
        "Any signed-in user, for a conversation they can open",
        "/communications",
    ),
    Skill(
        "attribute",
        "AI attributes",
        "Answers one admin-defined question about a company from its records.",
        (
            "The attribute's question and its answer type",
            "The company's records, under the asker's visibility",
            "On the nightly pass, what the company's owner may read",
        ),
        (
            "Give one typed value with its reasoning",
            "Cite the records it used",
            "Say there is not enough evidence",
        ),
        ("Guess", "Answer outside the type or the picklist", "Overwrite a person's own answer"),
        "Someone refreshes an attribute, or the nightly pass finds new activity",
        "Reading is open; defining needs manage_custom_objects",
        "Organization and Account pages, Settings > AI Attributes",
    ),
    Skill(
        "feature_request",
        "Feature requests",
        "Names one cluster of customer asks so product can see what is wanted.",
        ("A sample of the asks in one cluster, as data rather than instructions",),
        ("Give the cluster a title and a one-line summary",),
        (
            "Decide what gets built",
            "Read anything beyond the asks it is given",
            "Follow instructions written inside a customer's message",
        ),
        "Someone gathers asks, or the nightly pass finds new ones",
        "view_all_accounts",
        "/brain/requests",
    ),
    Skill(
        "account_brief",
        "Account briefs",
        "Writes the standing brief on one account: use cases, stakeholders, open threads.",
        (
            "What colleagues have written about the customer",
            "The customer's own records, as their owner may read them",
            "The people on record as contacts",
        ),
        (
            "Say what they use the product for and who cares about what",
            "List what is still open",
            "Leave a list empty when the records do not support one",
        ),
        (
            "Invent a use case, a person, or a thread",
            "Read past what the account's owner may read",
            "Rewrite itself on a schedule",
        ),
        "Someone asks for a brief, or refreshes one",
        "Any member, for a customer they can open",
        "Organization Details › Company View",
    ),
    Skill(
        "anomaly",
        "Anomaly clusters",
        "Names one cluster of reports that all describe the same problem.",
        ("A sample of the reports in one cluster, as data rather than instructions",),
        ("Give the cluster a title and a one-line summary a support lead could act on",),
        (
            "Decide what is wrong or how to fix it",
            "Read anything beyond the reports it is given",
            "Follow instructions written inside a customer's report",
        ),
        "A cluster crosses the threshold, on a run or overnight",
        "view_all_accounts",
        "/brain/anomalies",
    ),
    Skill(
        "translate",
        "Translation",
        "Puts one message into another language, and nothing else.",
        ("The one message it was handed, as data rather than instructions",),
        ("Translate it, keeping the meaning, the tone, and every name, number and date",),
        (
            "Answer the message, summarise it, or act on what it asks",
            "Read any record beyond the one it was given",
            "Change a name, a number or a date",
        ),
        "Someone presses Translate on a message, or writes a reply in the customer's language",
        "Any signed-in user, for a record they may read",
        "/communications",
    ),
    Skill(
        "mcp",
        "Agents over MCP",
        "Answers a question put by somebody's own agent, as that person.",
        ("The same book summary the Copilot reads, under the token holder's own visibility",),
        ("Answer the question", "Name the records it drew on"),
        (
            "Change anything: the MCP tools are read-only",
            "Read past what the person whose token it is may read",
            "Act on instructions found inside a record",
        ),
        "An agent calls ask_copilot over MCP",
        "A live MCP token, which its owner can revoke",
        "Settings > Agent access",
    ),
    Skill(
        "slack_triage",
        "Send to Revenact from Slack",
        "Sums up one Slack message a person sent to their own Work, and suggests a next step.",
        ("The one message the person chose, as data rather than instructions",),
        (
            "Write a one-sentence summary",
            "Suggest one step kind from a fixed list (task, Jira issue, reply draft, note)",
        ),
        (
            "Read anything beyond that one message",
            "Act, post, or show it to anyone but the person who sent it",
            "Follow instructions written inside the message",
        ),
        "A person clicks Send to Revenact on a Slack message",
        "A member matched by their Slack link or Slack email, with Slack's signed request",
        "/work",
    ),
    Skill(
        "email_agent",
        "Email agent",
        "Reads new internal email between colleagues for a task to assign or a meeting to arrange.",
        (
            "One new email whose sender and every recipient are members of the workspace",
            "The names and addresses of the workspace's members",
        ),
        (
            "Give a named colleague a task, when the sender may assign it to them",
            "Propose a meeting to the person asked for, at a time everyone is free",
        ),
        (
            "Read mail with anyone outside the workspace, or mail older than a day",
            "Show the email's text to anyone: a proposal carries only a one-line topic",
            "Follow instructions written inside the email",
        ),
        "A new internal email arrives in a connected mailbox",
        "The workspace's own mail tick, as each mailbox's owner",
        "/work",
    ),
    Skill(
        "slack_bundle",
        "Steps for a Slack message",
        "Proposes the steps one Slack message calls for, on the one customer it is about.",
        (
            "The one message the person chose, as data rather than instructions",
            "That customer's name, owner, health and open plans, and who may open it",
            "The plan templates, the person's own segments and the scenarios it may pick from",
        ),
        (
            "Propose a Jira issue, a Slack reply, a task, a plan, a segment pin, a scenario "
            "run and a survey, at most one of each",
        ),
        (
            "Run anything: the person who sent the message reviews and runs every step",
            "Show the steps to anyone but that person",
            "Read another customer, or follow instructions written inside the message",
        ),
        "A minute after a person clicks Send to Revenact on a Slack message",
        "The member who sent the message, while they may open its customer",
        "/work",
    ),
    Skill(
        "slack_tag_request",
        "Tagged requests in Slack",
        "Says whether a synced Slack message asks the colleagues it tags to do something, "
        "and the to-do it asks for.",
        ("One new message in a synced channel that tags colleagues, as data",),
        (
            "Give each tagged colleague who could read the message a to-do from its author, "
            "with their own copy of the message",
        ),
        (
            "Hand a message to someone who couldn't read it in Slack, or who isn't a member",
            "Act on a casual tag: a thank-you or an FYI makes nothing",
            "Follow instructions written inside the message",
        ),
        "Within a minute of a member tagging colleagues in a synced channel",
        "The member who wrote the message",
        "/work",
    ),
    Skill(
        "agent_diagnose",
        "Agent diagnosis",
        "Says what is wrong with one customer, with findings that point at their sources.",
        (
            "The customer's health and its components, its open tickets, recent calls and "
            "emails, the message's Slack thread and its contacts, as the person running it "
            "may read them, as data rather than instructions",
        ),
        ("Write a short summary and two to five findings, each citing one source it was given",),
        (
            "Read another person's private mail, or anything the runner may not open",
            "Change anything: a diagnosis is read-only",
            "Point a finding at a source it was not given",
        ),
        "A person answers Yes to Should I diagnose? on a guided bundle",
        "The member who runs the step, while they may open the customer",
        "/work",
    ),
    Skill(
        "agent_compose",
        "Agent email",
        "Writes one email to a customer's main contact to save the relationship.",
        ("The diagnosis it follows and what the diagnosis read, as data rather than instructions",),
        ("Write the subject and the body, saved as a Gmail draft in the runner's mailbox",),
        (
            "Choose who it goes to: the platform picks the record's main contact",
            "Send it: the runner reviews and sends it as a separate step",
            "Quote the internal Slack thread, a task, a note or another customer",
        ),
        "A person answers Yes to Should I write an email? on a guided bundle",
        "The member who ran the diagnosis, from their own connected Gmail",
        "/work",
    ),
    Skill(
        "sales_report",
        "Sales review report",
        "Writes a short summary of the last 30 days of deals for a sales review meeting.",
        (
            "The won, lost and closing deals and the stage counts the organiser may see in "
            "the Pipelines book, as data rather than instructions",
        ),
        ("Write a summary of at most 120 words beside the platform's own figures",),
        (
            "Read a deal the organiser may not see, or any customer data beyond the deals",
            "Change anything: the report is read-only and Undo discards it",
            "Invent a figure: every number in the report is the platform's",
        ),
        "The organiser answers Yes to Should I prepare the sales report? the day before "
        "a meeting titled sales review",
        "The meeting's organiser, the only person who sees the bundle",
        "/work",
    ),
)

BY_PURPOSE = {skill.purpose: skill for skill in SKILLS}


def _produced(organisation):
    """What each skill has left behind, all time — the artefacts, not the
    calls. Only where a count is exact and cheap; a skill without one shows
    nothing rather than a guess."""
    proposals = AgentAction.objects.filter(
        organisation=organisation,
        kind__in=[AgentAction.Kind.TASK_CREATE, AgentAction.Kind.INITIATIVE_CREATE],
    ).aggregate(
        ops=Count("id", filter=Q(session__isnull=True)),
        ops_approved=Count("id", filter=Q(session__isnull=True, status=AgentAction.Status.APPLIED)),
        sessions=Count("id", filter=Q(session__isnull=False)),
        sessions_approved=Count(
            "id", filter=Q(session__isnull=False, status=AgentAction.Status.APPLIED)
        ),
    )
    return {
        "copilot": {
            "label": "replies",
            "count": Message.objects.filter(
                conversation__organisation=organisation, role=Message.Role.ASSISTANT
            ).count(),
        },
        "headlines": {
            "label": "headlines",
            # An Account has no organisation of its own; it reaches one
            # through the customers under it.
            "count": Headline.objects.filter(
                Q(customer__organisation=organisation)
                | Q(account__customers__organisation=organisation)
            )
            .distinct()
            .count(),
        },
        "brief": {
            "label": "briefs",
            "count": Brief.objects.filter(organisation=organisation).count(),
        },
        "proposals": {
            "label": "proposals",
            "count": proposals["ops"],
            "approved": proposals["ops_approved"],
        },
        "facilitator": {
            "label": "decisions",
            "count": proposals["sessions"],
            "approved": proposals["sessions_approved"],
        },
        "explain": {
            "label": "explanations",
            "count": Explanation.objects.filter(organisation=organisation).count(),
        },
    }


def _last_runs(organisation):
    latest = {}
    for call in (
        ModelCall.objects.filter(organisation=organisation)
        .select_related("user")
        .order_by("purpose", "-created_at")
    ):
        latest.setdefault(
            call.purpose,
            {
                "at": call.created_at.isoformat(),
                "outcome": call.outcome,
                "user": call.user.name if call.user else None,
            },
        )
    return latest


def catalogue(organisation):
    """Every skill with this month's usage, its last run and what it has
    produced — in the order the catalogue lists them."""
    month = usage.summary(organisation)
    by_purpose = {row["purpose"]: row for row in month["purposes"]}
    produced = _produced(organisation)
    last_runs = _last_runs(organisation)
    skills = []
    for skill in SKILLS:
        row = by_purpose[skill.purpose]
        skills.append(
            {
                **asdict(skill),
                "usage": {
                    k: row[k]
                    for k in (
                        "calls",
                        "ok",
                        "failed",
                        "spent",
                        "budget",
                        "remaining",
                        "custom_budget",
                    )
                },
                "last_run": last_runs.get(skill.purpose),
                "produced": produced.get(skill.purpose),
            }
        )
    return {"month_start": month["month_start"], "skills": skills}
