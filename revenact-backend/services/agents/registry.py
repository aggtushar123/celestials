"""Every action kind an agent may take (spec §1.3), in the contract's
order."""

from .actions import (
    campaign_sends,
    campaigns,
    canvases,
    diagnose,
    drafts,
    initiatives,
    jira_comments,
    jira_issues,
    mail_compose,
    mail_replies,
    mail_send_draft,
    notes,
    plan_starts,
    record_surveys,
    records,
    sales_report,
    scenario_runs,
    scenarios,
    segment_pins,
    segments,
    slack_replies,
    surveys,
    tasks,
    templates,
)

REGISTRY = {
    spec.key: spec
    for spec in (
        records.LIFECYCLE,
        records.OWNER,
        records.ATTRIBUTE,
        tasks.CREATE,
        tasks.REASSIGN,
        tasks.REDATE,
        tasks.COMPLETE,
        tasks.SNOOZE,
        notes.CREATE,
        drafts.REPLY,
        plan_starts.START,
        segments.CREATE,
        scenarios.CREATE,
        campaigns.CREATE,
        canvases.CREATE,
        templates.WRITE,
        initiatives.CREATE,
        surveys.SEND,
        campaign_sends.SEND,
        mail_replies.SEND_REPLY,
        slack_replies.REPLY,
        jira_issues.CREATE,
        jira_issues.ASSIGN,
        jira_comments.COMMENT,
        record_surveys.RECORD,
        segment_pins.PIN,
        scenario_runs.RUN,
        diagnose.DIAGNOSE,
        mail_compose.COMPOSE,
        mail_send_draft.SEND_DRAFT,
        sales_report.REPORT,
    )
}


def spec(kind):
    return REGISTRY[kind]


def kinds_for(agent):
    return [key for key, kind in REGISTRY.items() if agent in kind.agents]
