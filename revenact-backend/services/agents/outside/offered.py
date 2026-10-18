"""Which outside kinds a context may offer the model (agent bundles D3
contract D3-18): a reply where the thread has a customer's email, a Slack
reply on a Slack conversation whose connector is usable, Jira wherever the workspace has a Jira
connector, a Jira comment only on a conversation. Read only or not: a proposal for a
read-only tool shows disabled (spec §7.4)."""

from services.metrics.models import AgentAction

K = AgentAction.Kind


def offered(ctx):
    kinds = set()
    if ctx.thread_email is not None:
        kinds.add(K.MAIL_SEND_REPLY)
    slack = ctx.thread_slack
    if slack is not None and slack["usable"]:
        kinds.add(K.SLACK_REPLY)
    if ctx.jira_connector is not None:
        kinds |= {K.JIRA_CREATE, K.JIRA_ASSIGN}
        if ctx.thread_id is not None:
            # R2D1-2: a comment answers a conversation, never the nightly pass.
            kinds.add(K.JIRA_COMMENT)
    return kinds
