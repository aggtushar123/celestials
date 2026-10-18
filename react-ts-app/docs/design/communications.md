---
description: Product design specification for the Communications page — the queue of what is waiting on you.
---

# Communications

**Status:** specification, approved direction, not yet built.
**Author:** product. **Date:** 2026-09-18.
**Visual:** https://claude.ai/artifact/ULEdBczx75XzdaL35VdcWz (four artboards; the
main screen is interactive).

Communications is the last top-level item in the sidebar with no page behind it.
Today it renders "Under Construction". This specifies what should be there.

Related: [UI/UX Design](../03-ui-ux-design.md), [App Flow](../04-app-flow.md),
[Backend Schema](../../../revenact-backend/docs/product/05-backend-schema.md).

---

## 1. The decision

**Communications is the queue of things where a person is waiting on you.**

Not a mail client, and not a feed. One list, sorted by how long each thing has
waited, mixing four channels that all mean the same thing to the person reading
it: someone asked, and you have not answered.

| Channel | What it means |
|---|---|
| Email | A customer wrote and no reply has gone back |
| Question | A colleague @mentioned you and the question is still open |
| Ticket | A ticket in your department is open |
| Call | A call you hosted has no summary, so nothing from it reached the record |

The insight behind the page: Revenact answers *"how is this account doing"* on
eight dashboards and two detail pages. Nothing answers *"what needs me right
now"*. Every activity feed in the product is scoped to one customer, so the only
way to find an unanswered email today is to open accounts one at a time and
guess.

## 2. Why this and not the alternatives

Two other readings were considered and rejected.

**A cross-account activity stream.** A firehose of everything that happened,
newest first. Rejected because it tells you what occurred, not what to do, and
because AI Trending Topics already merges the same three record types across the
book with richer filters. Two screens over one dataset, neither of them a queue.
The stream survives as the page's secondary tab, where browsing is the point.

**A full email client.** Rejected on scope and on honesty: mail sync
deliberately stores only messages whose counterpart is a known contact or
account domain, so a mailbox view would be visibly missing most of the mailbox.
Competing with a tool the user already has open all day is a bad trade.

## 3. What this page must not become

- **Not a second health dashboard.** "This account has gone quiet for 34 days"
  is analysis and belongs in Activity Tracking, where it already is. This page
  only shows items where a specific counterpart is waiting.
- **Not a task manager.** Tasks have an owner, a due date and a page.
- **Not a notification log.** The bell already covers events. This covers debts.
- **No new inbox state in v1.** No archive, no snooze, no "mark done". Every row
  disappears because the underlying thing changed: a reply was sent, a question
  answered, a ticket closed, a summary written. A queue you can dismiss without
  acting becomes a lie within a week.

## 4. The three questions the page answers, and the three controls

| Question | Control | Default |
|---|---|---|
| Whose? | Scope select: Mine / Mine and my team | Mine |
| What kind? | Four bucket tiles, click to filter, click again to clear | No filter |
| Waiting, or everything? | Segmented control: Needs you / Everything | Needs you |

Three controls, three distinct questions. Nothing else on the toolbar except
search and a sort toggle.

## 5. Layout

Two-pane, list on the left and detail on the right. Both patterns already exist
in the product: the tiles repeat the Health Triage tiles, and the pane repeats
the activity feed's email thread panel.

```
Sidebar │ Navbar
        ├──────────────────────────────────────────────────────────────┐
        │ Communications                    [Mine ▾]  [+ Compose]      │
        │ Six things are waiting on you. The oldest has waited 9 days.  │
        ├──────────────────────────────────────────────────────────────┤
        │ (Needs you | Everything)  [search]        [Filters] [Oldest]  │
        ├──────────────────────────────────────────────────────────────┤
        │ ┌Replies owed┐┌Questions┐┌Open tickets┐┌Calls to wrap up┐     │
        │ │     2      ││    2    ││     1      ││       1        │     │
        │ └────────────┘└─────────┘└────────────┘└────────────────┘     │
        ├───────────────────────────┬──────────────────────────────────┤
        │ queue, 468px              │ detail                           │
        │                           │  subject                         │
        │  ● ✉ Dana Whitfield  9d   │  who · role / Account    [9 days]│
        │      Pizza Hut            │  ┌ health │ ARR │ renews │ owner ┐│
        │      Re: renewal terms    │  └──────────────────────────────┘│
        │      "We would need…"     │  3 earlier messages              │
        │ ─────────────────────     │  ┌ their message ───────────────┐│
        │  ● @ Mei Tanaka      4d   │  └──────────────────────────────┘│
        │ ─────────────────────     │  ┌ Reply ───────────────────────┐│
        │    ◎ Zendesk #4182   3d   │  │ [Draft with Copilot] [Send]  ││
        └───────────────────────────┴──────────────────────────────────┘
```

The subtitle states the count and the worst case in one sentence. It is the only
prose on the page and it is the thing a person reads first.

## 6. Row anatomy

```
  ●   ✉    Dana Whitfield  Pizza Hut                          9d
           Re: revised renewal terms                      waiting
           "We would need the revised terms before the…"
  │   │    │               │                                  │
  │   │    │               └ account, 11px muted               └ the number
  │   │    └ who, 13px, heavier when unread                      that decides
  │   └ channel icon, 22px tile, neutral                         what you do
  └ unread dot, accent, 6px
```

| Element | Rule |
|---|---|
| Unread dot | Accent, shown only when unread |
| Channel icon | Lucide, 13px in a 22px neutral tile. Mail, at-sign, life-buoy, phone |
| Who | The person, or the ticket reference. Weight 900 unread, 700 read |
| Account | Always present. This is a work queue, never a personal one |
| Subject | One line, truncated |
| Snippet | One line, muted. For a call, what is missing rather than a quote |
| Waiting | DM Mono, tabular, right aligned. **Amber at 3 days, red at 7** |
| Selected | Accent-dim background plus a 3px accent left edge |

The waiting number is the loudest thing in the row on purpose. It is the only
value that changes which item a person picks.

## 7. The detail pane

Header: subject, then the person with their contact role, then the account as a
link, then a waiting chip coloured on the same 3 and 7 day thresholds.

**Then the account context strip, and this is the point of the whole page:**

```
┌ HEALTH ┬ ARR ─────┬ RENEWS IN ┬ OWNER ┬─────────────┐
│  5.2   │ $128.4K  │    34d    │ Carl  │ Open account │
└────────┴──────────┴───────────┴───────┴─────────────┘
```

Four numbers, coloured by the same semantics used everywhere else, sitting
between the message and the reply box. Nobody answers a question about renewal
terms without seeing that the renewal is 34 days away and health is 5.2. A mail
client cannot do this. It is the reason the reply happens here rather than in
Gmail.

Reply behaviour per channel, each reusing a path that already exists:

| Channel | Action | Existing path |
|---|---|---|
| Email | Reply from your connected mailbox | `POST /customers/<id>/emails/send/` |
| Question | Answer, stored as a contribution | `POST /questions/<id>/answer/` |
| Ticket | Comment, posted back to the source | Connector, or link out by `external_url` |
| Call | Write or generate the summary | The CallSense summarise path |

"Draft with Copilot" sits beside every composer. The Copilot already has
retrieval over this account.

## 8. States

| State | Design |
|---|---|
| Cleared | Not a blank. A green check, "You are clear", and what you actually did: "You answered six things today and the oldest sat for two hours." Offers Everything and My team |
| No mailbox connected | The three buckets that work still show real counts. Replies owed shows a dash on a dashed border, with a card explaining that only mail with people at your accounts is stored, and a Connect button to Integrations |
| Loading | Skeleton matching the real layout: four tiles, then rows with an icon block and two lines. Never a spinner |
| Error | "Could not load your queue. Nothing is shown rather than part of it, so you do not act on half a picture." Plus Try again. Same wording discipline as the Health dashboard |
| Partial failure | A distinct amber band: mailbox last synced four hours ago, replies owed may be stale, the other three counts are current. Never silently wrong |
| No search match | Names what was searched and offers to search Everything instead |

## 9. Visibility

The page introduces no new access rules. It composes the ones that exist, which
is why "Mine and my team" is a toggle rather than a feature.

| Channel | Rule | Defined in |
|---|---|---|
| Email | Mailbox owner and their management chain | `services/mail/visibility.py` |
| Question | Assignee | `services/knowledge` |
| Ticket | Own department plus undeparted; Leadership sees all | `services/customers/personal.py` |
| Call | The customers and accounts you can see | `services/customers/scoping.py` |

"Mine" narrows to items addressed to you personally. "Mine and my team" opens it
to your subtree, which is what a manager wants and what the chain rule already
permits. A person with no reports sees no difference and the control could be
hidden for them.

## 10. Backend

Most of this exists. `services/customers/interactions.py` already merges Email,
Call and Ticket across the whole visible book, applies the per-model personal
scoping, and exposes `filtered_querysets(user, params)` and `filter_options`.
The new work is a waiting predicate and an endpoint.

**`GET /api/v1/communications/`** — paginated, newest-waiting first.

| Parameter | Values |
|---|---|
| `needs` | `true` (default) or `false` for the Everything tab |
| `kind` | `email`, `question`, `ticket`, `call`, repeatable |
| `scope` | `mine` (default) or `team` |
| `q` | Free text over subject, person and account |
| `customer`, `from`, `to` | As the interactions module already parses them |

**`GET /api/v1/communications/stats/`** — the four bucket counts plus the oldest
waiting age, so the tiles need no request of their own. Same shape as the
existing `/contacts/stats/` and `/tickets/stats/` endpoints.

The waiting predicate, per channel, using only fields that exist today:

| Bucket | Predicate |
|---|---|
| Replies owed | An `Email` with `direction="received"` where no `direction="sent"` email in the same `thread_id` has a later `sent_at`. Scoped to `mailbox_owner` under Mine |
| Questions for you | `Question.status="open"` and `assignee=user`. `days_open` and the 3 day stale flag already exist |
| Open tickets | `Ticket.status` not in `RESOLVED_STATUSES`, through `visible_tickets` |
| Calls to wrap up | `Call.summary=""` where `logged_by=user` under Mine |

Waiting age is `now - sent_at` / `created_at` / `opened_at` / `occurred_at`, the
same per-model date field `interactions.SOURCES` already names.

**One thing does not exist and must be built:** the reply-owed predicate needs a
thread index. `Email.thread_id` is stored but unindexed. Add a composite index on
`(mailbox_owner, thread_id, sent_at)` in the same migration.

## 11. Phasing

| Version | Scope |
|---|---|
| **v1** | The queue, the four buckets, the two tabs, the scope toggle, the detail pane with context, reply and answer in place, all six states. Read plus the four existing write paths. No new models |
| **v2** | Bulk actions, saved views, keyboard navigation (j/k, e to reply, x to open), a snooze that writes a real `Task` rather than inventing inbox state |
| **v3** | Ticket comments posted back through the connector rather than linking out; a digest that says what is waiting before the day starts |

v1 is deliberately shippable without a migration beyond the index.

## 12. Accessibility

The page must pass the eleven-point bar in the UI/UX document. Three things
specific to this surface:

1. **The queue is a list of buttons, not clickable rows.** Each row is a real
   `<button>` carrying `aria-current` when selected, so Tab reaches it.
2. **The detail pane is a live region.** Selecting a row replaces its contents,
   which a screen reader must announce rather than leave silent.
3. **Waiting urgency is never colour alone.** The number is always written
   ("9d") and the detail chip spells it out ("Waiting 9 days"). Amber and red
   are reinforcement.

**A design-system finding this work surfaced.** `--color-ink-faint` (`#9CA3AF`)
gives 2.6:1 on white and fails WCAG AA for any text under 24px. It is currently
used for eyebrow labels and hints across the app. The mockup uses
`--color-ink-muted` (`#4B5563`, 6.2:1) everywhere small text carries meaning.
This should become a repo-wide fix rather than a rule this one page follows
alone, and it is worth adding as a task in the implementation plan.

## 13. Open questions

1. **Does "Mine" for tickets mean anything?** `Ticket` has `assignee_name` as
   free text and no assignee foreign key, so a ticket can only be scoped to a
   department. Either accept that Mine and My team are identical for tickets, or
   add the foreign key. I would accept it in v1 and say so in the tile's hint.
2. **Should an answered question leave the queue immediately?** Yes, but it also
   becomes a contribution, and there may be value in a brief confirmation before
   the row vanishes.
3. **Reply-owed for shared inboxes.** An email with no `mailbox_owner` is visible
   to everyone. Counting it in everyone's queue would make it nobody's job. v1
   excludes authorless mail from Mine and shows it only under My team.

## 14. Success

The page works when these are true:

- A CSM opens Communications first each morning instead of Organizations.
- The oldest waiting item across the team trends down week over week, and that
  number is worth putting on the Brain overview.
- Nobody replies to a renewal question without the renewal date in view.
- "Calls to wrap up" stays near zero, which means the call record, the health
  rubric and Copilot retrieval are all getting the summaries they depend on.
