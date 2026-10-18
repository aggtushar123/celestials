---
description: App flow reference — every route, guard and user journey through Revenact, with the files and endpoints involved.
---

# Revenact — App Flow

Current as of 2026-09-24, read from `src/App.tsx`, the layout, the 27 Redux
slices and the page components. Written in the style of this repo's
`.agents/workflows/*-flow.md` notes: real file paths, real endpoint names, no
abstract description.

Companion documents: [UI/UX Design](03-ui-ux-design.md),
[PRD](../../revenact-backend/docs/product/01-prd.md),
[Backend Schema](../../revenact-backend/docs/product/05-backend-schema.md).

---

## 1. Shell

```
main.tsx
 └── <Provider store>
      └── <App>
           └── <BrowserRouter>
                ├── /login, /auth/callback, /forgot-password, /reset-password, /s/:token, /u/:token   (public, no shell)
                ├── /__ui                                            (development builds only: the UI primitives gallery)
                ├── /onboarding                                   (auth, no shell: the first-run tour)
                └── <ProtectedRoute>
                     └── <DashboardLayout>
                          ├── <Sidebar/>     hover-expands, 68px to 240px
                          ├── <Navbar/>      hidden on the canvas builder (/scenarios/create, /scenarios/:id) and on /copilot
                          └── <Outlet/>      the page
```

`DashboardLayout` also owns the notification lifecycle: on mount with an access
token it fetches `/notifications/` and opens the `ws/notifications/` socket,
closing it on unmount or token change.

Every socket (`lib/socket.ts`: notifications and Copilot sessions) also
closes while the person is away (`lib/presence.ts`): the tab hidden for 5
minutes, or 30 minutes with no pointer, key, wheel or touch input. On Cloud
Run an open WebSocket keeps an instance billed, so a tab left open must not
hold one. Any input or showing the tab reconnects at once, and the caller's
`onResume` catches up: the bell refetches `/notifications/`, an open Copilot
session refetches the session and its messages.

### How the app is served

In production the SPA, the API and the WebSockets share one origin, which is
the Cloud Run `web` service URL. This repo's image is that service's ingress
container. nginx (`deploy/nginx.conf`) listens on :8080, serves `dist/` and
proxies `/api/`, `/ws/`, `/admin/` and `/static/` to the Django sidecar on
127.0.0.1:8000. Because `VITE_API_URL` is empty in that build, `lib/apiClient.ts`
and `lib/socket.ts` both fall back to `window.location.origin`. There is no CORS,
and the CSP's `connect-src` names only this origin. `deploy/nginx.conf` is a
template: at start-up the image fills in `PUBLIC_HOST`, which revenact-deploy's
`services/web.yaml` sets to the service's hostname. Django and the CSP see that
configured host, never the client's `Host` header, and only a WebSocket upgrade
is passed to Django (an `h2c` upgrade stays a plain HTTP request). Without
`PUBLIC_HOST`, nginx refuses to start. The `/assets/*` files have
hashed names, so they are cached for a year as immutable, while `index.html` is
`no-cache`, so a deploy reaches users on their next navigation. Cloud Build
(`cloudbuild.yaml`) builds the image on every push to main, and the public
revenact-deploy repo rolls it out.

### Guards

| Guard | Behaviour |
|---|---|
| `ProtectedRoute` | Not authenticated, redirect to `/login` carrying `state.from` |
| `RequireCapability` | Capability absent from `user.permissions`, redirect to `/dashboard`. Replaces the former `AdminRoute` |
| `RequirePlatform` | Not `user.is_superuser`, redirect to `/dashboard`. Staff whose session lacks the `mfa` claim see a page saying which half is missing (enrol, or sign in again) instead of the portal |
| `TenantOnly` | Wraps the tenant shell and the tour: a superuser is sent to `/platform`. Staff belong to no tenant and never see the tenant app; `RootRedirect` sends them to the portal on sign-in |

---

## 2. Route map

| Path | Component | Guard |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password` | `Login`, `ForgotPassword`, `ResetPassword` | public |
| `/auth/callback` | `AuthCallback` (hand-off exchange, workspace form, or an explained refusal) | public |
| `/s/:token` | `HostedForm`: the one-time survey form from a customer's email. No shell, no session (no `Authorization` header, no token refresh), light only. `GET`/`POST /public/surveys/<token>/`; every 404 reads "This link has expired." | public |
| `/__ui` | `UiGallery` (`src/pages/dev/UiGallery.tsx`): every UI primitive in every state, for screenshots. Registered only when `import.meta.env.DEV`; absent from production builds | public (dev only) |
| `/` | `RootRedirect`: `/login`, then `/onboarding` until `user.tour_completed_at` is set, then `/work`, the home page since 2026-10-17 (staff: `/platform`); onboarding's finish and the RequireCapability / RequirePlatform fallbacks go to `/work` too | auth |
| `/onboarding` | `OnboardingCarousel`, the eight-step first-run tour | auth |
| `/account-settings/*` | Redirects into Settings (2026-10-17): account → `/settings/account`, billing → `/settings/billing`, integrations → `/settings/connections`, personalization, skills, about → the same names under `/settings/`; anything else → `/settings/account` | auth |
| `/settings/{account,personalization,skills,about}` | Settings › **You** (the person's own settings, every member): Account, Personalization, Your skills & tasks, About, in their own centred column (`Personal`) | auth |
| `/platform`, `/platform/organisations`, `/platform/organisations/:id`, `/platform/staff` | `PlatformLayout` (its own shell) with `PlatformOverview`, `PlatformOrganisations`, `PlatformOrganisationDetail`, `PlatformStaff` | auth + `RequirePlatform` |
| `/platform/account` | `PlatformAccount`: the staff member's password and second factor. Reachable without an MFA session, because it is where MFA is set up | auth + `RequirePlatform` (staff only) |
| `/dashboard`, `/dashboard/custom` | `Keep` → `/dashboard/overview` | auth |
| `/dashboard/overview` | `Overview` — the ranked attention list plus a Revenue/Health/Support headline card each | auth |
| `/dashboard/revenue/{forecast,customers,products}` | `AreaLayout` (area: revenue) wrapping `ForecastContainer`, `CustomerOverviewContainer`, `ProductUsageContainer` | auth |
| `/dashboard/health/{triage,divergence,movement,renewals,distribution}` | `AreaLayout` (area: health) wrapping `HealthOverviewContainer` and its five views | auth |
| `/dashboard/health/{usage,activity}` | `AreaLayout` (area: health) wrapping `UsageOverviewContainer`, `ActivityContainer` | auth |
| `/dashboard/support/{tickets,topics}` | `AreaLayout` (area: support) wrapping `TicketOverviewContainer`, `AITrendingTopics` | auth |
| `/health`, `/dashboard/advance/*` | `Keep`/`LegacyRedirect` → the equivalent `/dashboard/...` route, query string preserved (`src/pages/dashboard/redirects.tsx`, mapping in `areas.ts`'s `LEGACY`) | auth |
| `/organizations/{list,board,:id}` | `List`, `Board`, `OrganizationDetails` | auth |
| `/accounts/{list,board,:id}` | `AccountsList`, `AccountsBoard` (the Accounts portfolio), `AccountDetails` (the account's story, read by the URL id alone). `AccountsAskLayout` wraps all three in one `AskProvider` (surface `accounts`, delivery 3 of the Ask spec, own preference key `revenact_accounts_ask`), one conversation lasting from the List into the Board, into an account and back: a question posts `context: {surface:'accounts', view:'list'\|'board', filters}` (set keys only, no focus — the List and the Board send no focus, unlike Organizations' list) or `{view:'detail', account, focus}`. Each story item's "Ask about this" sets `focus: {kind, id}` for that one question, typing "What should I know about this `<kind>`?" without sending. Each page reports its own names to the layout (`accountsNames.ts`'s `useReportAccountsOptions` from the List and the Board, `useReportAccountName` from the account page), so a live chip names the portfolio's filter options or the account's own row before the server has ("Accounts · Owner: Carl CSM", the account's name, or "This account"); a sent question shows the server's own `label`. A `400` under `context.account` reads "You can no longer ask about this account."; under `context.focus`, "You can no longer ask about this item. Ask about the account instead."; under `context.filters`, "You can't ask about this list. Clear the filters and ask again." History reopens `/accounts/list?<filters>` (never `/accounts`, whose redirect drops the query), `/accounts/board?<filters>` or `/accounts/:id` | auth |
| `/contacts`, `/contacts/:id` | `ContactsPage`: the list with its summary line and filters (`q`, `customer`, `account`, `sentiment`, `role` in the URL), and the chosen person's profile beside it (`GET /contacts/`, `GET /contacts/<id>/`, `GET /contacts/<id>/history/`); on phones the person is its own screen with a back link. `/contacts/list` redirects to `/contacts`, keeping its query string; `/contacts/<non-numeric>` shows the not-found state. `ContactsAskLayout` wraps this route in one `AskProvider` (surface `contacts`, delivery 2 of the Ask spec, own preference key `revenact_contacts_ask`): a question posts `context: {surface:'contacts', view:'list', filters}` or `{view:'person', contact, focus}`; the chip names the filtered organisation/account, sentiment and role (or a quoted search term), or the open person's name and place, with "Sentiment" appended while `focus:'sentiment'`. "Why this sentiment?" under a person's sentiment line drafts "Why is <first name>'s sentiment <word>?" with that focus and opens the rail without sending. A `400` under `context.contact` reads "You can't ask about this person here."; under `context.filters`, "You can't ask about this list. Clear the filters and ask again." History reopens a Contacts conversation on `/contacts/:id` (a person) or `/contacts?<filters>` (a list) | auth |
| `/pipelines/{list,board}` | `PipelinesList`, `PipelinesBoard` (`pages/pipelines/List.tsx`, `Board.tsx`): one book of opportunities or risks across organisations and accounts, `?kind=risks` for risks; `/pipelines` redirects to the List. `PipelinesAskLayout` wraps both in one `AskProvider` (surface `pipelines`, key `revenact_pipelines_ask`) — one conversation across both views and both kinds. A question posts `context: {surface:'pipelines', kind, view, filters}`: `filters` is the set URL keys only, `group:'none'` for the List's ungrouped (the Board never sends it), no `focus` key unless one is set. "Ask about this" on a List item or a Board card adds `focus: {kind:'opportunity'\|'risk', id}` for that one question. Each page reports its read's filter options with its kind (`useReportPipelineOptions`), so a live chip can name them before the server has. A `400` under `context.focus` reads "You can no longer ask about this opportunity." (or "…this risk."); under `context.filters`, the same list copy as Organizations and Accounts. History reopens `/pipelines/list?<filters>` or `/pipelines/board?<filters>` (never `/pipelines`, whose redirect drops the query) | auth |
| `/segments`, `/segments/new`, `/segments/:id`, `/segments/:id/edit` | `SegmentsList`, the builder modal (`NewSegmentRoute`, `EditSegmentRoute` in `Builder.tsx`), `SegmentPage` (`pages/segments/`). The list reads `GET /segments/?scope=&search=`. The builder reads `GET /segments/<id>/` to edit, previews with `POST /segments/preview/` (400 ms after the last change, latest answer wins), and saves with `POST /segments/` or `PATCH /segments/<id>/` (no `kind`, and only the fields that changed); `?kind=` plus a list's own filters starts a new one from Save as segment. The page reads `GET /segments/<id>/`, `GET /segments/<id>/members/` (rows, and a `limit=1` read for the tiles and `hidden_count`), `GET /segments/<id>/changes/?days=` and `GET /segments/<id>/members/export.csv`; `?tab=changes` opens the Changes tab (the `segment_changes` alert's link). A 404 reads "Segment not found" for a missing segment and one not shared with the reader alike | auth |
| `/communications` | `CommunicationsPage`, arranged as an inbox with its own top bar (no Navbar): the inbox card (folders for the four kinds of waiting with counts, Needs-you and Mine-only switches, a list grouped by month, the open item in place, with a `ReplyBox` under it: Draft with Copilot fills it from the thread and the account's history and lists the sources used; Send reply on an email row sends from the person's mailbox via `POST /communications/emails/<id>/reply/`); on `?source=mailbox:<provider>` the card is `MailboxView` instead, the person's own mail whole (Inbox/Drafts/Sent/Done/Muted with counts, Priority and Unread switches, Starred/Important/Spam/Trash and the categories, a Categories block of what is waiting, the list by month, conversations (Sent and Drafts as messages) with bulk select, Gmail labels in the sidebar and a label view, the open conversation with older messages folded and its actions (star, unread, mute, done, and for Gmail delete or restore, spam and labels) applied at once and put back if refused, attachments that open or download, HTML in a sandboxed frame with remote images blocked until Show images and cid: images shown, keys e, #, j, k and r, and a reply that sends from the mailbox; the header says when the 12-month import is running, the mailbox is paused, or changes cannot reach Gmail; ?message=<id> opens a conversation); and the shared Copilot rail (`components/copilot/CopilotRail`, with the Scheduled card above it (the asker's Google Calendar meetings for the week with Join, then dated to-dos and tasks, each opening on Work) and the picked source as context; New chat, History and a hide switch live in the top bar); with `?draft=<id>` the card is the agent's reply draft instead (`DraftRoute`: `GET /communications/drafts/<id>/`; the owner's Save `PATCH`, Send `POST …/send/`, Mark as sent `POST …/mark-sent/`, Discard `DELETE`); a queue row with `draft` links it, and the mailbox's Drafts lists "From your agents" (`GET /communications/drafts/?channel=email`) above the provider's drafts | auth |
| `/copilot` | `CopilotIndex` (the home page until 2026-10-17, when Work took its place). No Navbar, no frame; the greeting, the ask box, three suggested questions and the skills sit directly on the canvas, with a small Copilot/Cockpit switch top-right. Cockpit sits on the same canvas: My book (counts, value, health rings), Renewals with a window selector and drill-down, and Next up (Mine's first five, acted on in place: the circle on a task completes it through `PATCH /tasks/<id>/`, a question is answered inline; Mine's toast with Undo for Done and an applied action; its own Try again). Third in the sidebar, after Work and Brain | auth |
| `/scenarios`, `/scenarios/rules/new`, `/scenarios/rules/:id`, `/scenarios/rules/:id/edit`, `/segments/:id/rule` | `ScenariosHome` (Rules; Canvas is `ScenariosList`, `?tab=canvas`), the rule builder modal (`NewRuleRoute`, `EditRuleRoute`, `RuleSegmentRoute` in `pages/rules/RuleBuilder.tsx`), `RulePage`. See 4.5j | auth |
| `/scenarios/create`, `/scenarios/:id` | `CreateScenario` (the canvas builder, unchanged) | auth |
| `/projects`, `/projects/new`, `/projects/:id`, `/projects/templates`, `/projects/templates/new`, `/projects/templates/:id/edit`, `/organizations/:id/plans/new`, `/accounts/:id/plans/new` | `ProjectsHome` (List or Board), the New plan modal (`NewPlanRoute`, `RecordPlanRoute` in `pages/plans/NewPlan.tsx`), `PlanPage`, `TemplatesPage` with its editor modal (`NewTemplateRoute`, `EditTemplateRoute`). See 4.5k | auth |
| `/canvas`, `/canvas/:id` | `CanvasPage` (the gallery: search, Show more), `MapEditor` (live stakeholder map); `/canvas/create` redirects to `/canvas` | auth |
| `/campaigns`, `/campaigns/new`, `/campaigns/:id`, `/campaigns/:id/edit` | `CampaignsHome` (Mine, Shared with me; `?tab=`, `?archived=1`), the editor modal (`NewCampaignRoute`, `EditCampaignRoute` in `pages/campaigns/CampaignBuilder.tsx`), `CampaignPage` (`?send=<id>` opens a send). `/campaigns/create` redirects to `/campaigns/new`. See 4.5l | auth |
| `/u/:token` | `Unsubscribe`: a campaign email's one-click unsubscribe. Outside the guard and the shell, no session, light only | public |
| `/surveys`, `/surveys/new`, `/surveys/:id`, `/surveys/:id/edit`, `/segments/:id/survey` | `SurveysHome` (Sends; Logged scores is `SurveysPage`, `?tab=logged`, or `?customer=<id>` alone), the modal (`NewSurveyRoute`, `EditSurveyRoute`, `SurveySegmentRoute` in `SurveyBuilder.tsx`), `SendPage` (`pages/surveys/`). See 4.5i | auth |
| `/lifecycle` | `LifecyclePage` | auth |
| `/custom-objects/:id` | `CustomObjectRecordsPage` | auth |
| `/profile` | `Profile` | auth |
| `/settings` | `WorkspaceSettingsLayout` (`pages/settings/routes.tsx`): the settings nav (four groups, twelve items), a select below `md`; the index redirects to `/settings/general` | auth |
| `/settings/general` | `GeneralSettingsPage`: name, slug and owner; the owner hands the workspace on (`POST /auth/organisation/owner/`, then `/auth/me/`) | auth (transfer: the owner) |
| `/settings/people` | `UserManagement` (members, roles, access) | `manage_users` |
| `/settings/connections` | `Integrations`: Your accounts (Gmail, Slack link, Jira link), Workspace (Slack, Jira; `manage_integrations`), Coming soon (§4.9); each tool connection shows Agents: Read only, or Can act with **Allow agents to act** / **Make read only** (`POST /connectors/<id>/agents/`; a Slack consent returns to `/integrations?connector=agents_on`) | auth, connector writes `manage_integrations` |
| `/settings/billing` | `BillingSettingsPage` (the ledger needs `manage_org_settings`) | auth |
| `/settings/{data,defaults,products,entity-uploads}` | `SettingsPage` (attributes), `DefaultsPage` (Currency, in the save bar, + New organisations, saved at once), `ProductsPage`, `EntityUploadsPage` | auth, writes gated per capability |
| `/settings/work/{recommendations,tasks,notifications,briefs}` | the Work item's tabs (`SettingsTabsRoute`): `WorkRecommendationsPage`, `WorkTasksPage`, `WorkNotificationsPage`, `BriefDeliveryPage`; `/settings/work` redirects to its first tab | auth, writes gated per capability |
| `/settings/agents` | the Agents item's first tab, `AgentsSettingsPage`: `GET`/`PATCH /agents/settings/`, Run now `POST /agents/<cs, sales or ops>/run/`; Reading messages (how often, a switch per source; `PATCH /agents/settings/` `signal_interval`, `signal_sources`) and a credits note per agent | auth, `can_edit` decides form or text |
| `/settings/agents/actions` | the Agents item's second tab, `AgentActionsPage`: Actions & approvals, the same `GET`/`PATCH /agents/settings/` | auth, `can_edit` decides form or text |
| `/settings/ai/{attributes,skills,usage,feedback}` | the AI item's tabs: `AIAttributesPage`, `SkillsPage`, `AgentsPage`, `FeedbackLogPage` (the former Brain > Skills, Agents, Feedback Log); `/settings/ai` redirects to its first tab | auth; skills, usage and feedback `view_all_accounts` |
| `/settings/developers/{webhooks,agent-access}` | the Webhooks & API access item's tabs: `WebhooksPage`, `AgentAccessPage`; `/settings/developers` redirects to its first tab | auth, writes gated per capability |
| `/settings/{recommendations,work-tasks,work-notifications,brief-delivery,agent-actions,ai-attributes,ai-skills,ai-usage,ai-feedback,webhooks,agent-access}` | the eleven one-page addresses before the merge redirect to their tab (`/settings/work/recommendations`, `/work/tasks`, `/work/notifications`, `/work/briefs`, `/agents/actions`, `/ai/attributes`, `/ai/skills`, `/ai/usage`, `/ai/feedback`, `/developers/webhooks`, `/developers/agent-access`), keeping the query and hash (`KeepLocation`) | auth |
| `/settings/ai-agent` | redirect to `/settings/agents` (query and hash kept) | auth |
| `/settings/{currency,global-presets}`, `/settings/{activities,connect-widget}` | redirect to `/settings/defaults`, `/settings/general` | auth |
| `/users`, `/integrations` | redirect to `/settings/people`, `/settings/connections`; `/integrations` keeps its query and hash, so the backend's OAuth callbacks (`${FRONTEND_URL}/integrations?<result>`) still land with their result | auth |
| `/work` | `WorkRoutes` › `WorkInbox` (`pages/work/`): the queue rail from `GET /work/queues/` (Mine, My team, Rest of company, History; a select below `sm`; a queue whose count failed shows no number), `?queue=` (default `mine`), `?kind=` (Bundles, Approvals = rule reviews, Tasks, To-dos (Mine only), Questions, Suggestions), `?bundle=<id>` opens the bundle panel (`BundleSheet`: `GET /agents/bundles/<id>/`, Run `POST …/run/`, Retry `POST …/steps/<id>/retry/`, Reject `POST …/reject/`; a 404 titles the panel "You can't open that any more." with no record line and no footer); Mine is `GET /work/feed/`, My team and Rest of company `GET /work/feed/team/?scope=team\|company&kind=`, My team's people `GET /work/team/?scope=team`, History `GET /agents/bundles/history/`; `?queue=department:<code>` (a department's queue: Customer Success, Engineering, …) and `?queue=unassigned` (admins) both read `GET /work/feed/team/?scope=…`, bundles only, no chips (`?kind=` is ignored there); outside steps (email reply, Slack reply, Jira create and assign) edit in the panel, and Jira's lists (projects, issue types, priorities, people) load live from `GET /agents/bundles/<id>/steps/<step>/options/<list>/`; a blocked step is unticked with its reason and links to `/settings/connections` ("Open Connections"); result links open the tool in a new tab, in the panel and in History; the panel saves edits with `PATCH /agents/bundles/<id>/steps/<step>/` and refreshes with `POST /agents/bundles/<id>/refresh/` | auth |
| `/work/mine`, `/work/today`, `/work/recommended`, `/work/team?scope=`, `/work/activity?action=` | redirect into `/work?queue=…` keeping the query and history state (so `?task=<id>` from the bell still opens the panel); `/work/activity?action=<id>` reads the action's bundle and opens it on Mine while the action waits, in History otherwise | auth |
| `?task=<id>` on any route | `TaskPanelHost` (mounted once in `DashboardLayout`): the task panel, `GET /tasks/<id>/`, `PATCH /tasks/<id>/`, `POST /tasks/<id>/comments/`, `GET /work/assignees/?customer=` or `?account=`; closing drops only `task` | auth |
| `/brain` | `WhatChangedPage`: What changed, scoped Me / My team / Company (`?scope=`) | auth |
| `/brain/waiting` | redirects to `/work?queue=mine&kind=approval` (query kept); `/brain/review` too. The page was removed in work in one place delivery 2 | auth |
| `/brain/doing` | `DoingPage`: What's being done, scoped Me / My team / Company (`?scope=`), sections in `?section=` | auth |
| `/brain/initiatives` | redirect to `/brain/doing?section=initiatives` | auth |
| `/brain/customers` | CustomersPage: What customers are saying, scoped Me / My team / Company (`?scope=`), sections in `?section=` | auth |
| `/brain/{graph,requests,anomalies}` | one page each, scoped by `?scope=` with the same switch (curation on requests and anomalies stays `view_all_accounts`) | auth |
| `/brain/dashboard`, `/brain/agents`, `/brain/skills`, `/brain/feedback` | redirect to `/brain`, `/settings/ai/usage`, `/settings/ai/skills`, `/settings/ai/feedback` | auth |
| `/*` inside the shell | "Under Construction" | auth |

### Navigation surfaces

**Sidebar** is an icon rail that never widens: resting the pointer on an item (or focusing it) shows its name in a pill beside it (`useHoverLabel` / `HoverLabel`); section headings are thin separators. Sections: top (Work (to `/work`, the home page, lit on every `/work*` route; its badge is `GET /work/feed/count/` `badge`, named "Work, 3 to decide, 1 overdue"), Brain, Copilot, Dashboard (owner, 2026-10-17), then the Communications group: the inbox, Gmail (Google sign-in or app password; Outlook in its place only when that is the connected mailbox), Slack and Jira, all shown, the unconnected ones dimmed and leading to Settings › Connections (owner, 2026-10-16); a source goes to `/communications?source=`, and Slack lists the Slack threads on records the reader may open (`?kind=slack`, newest first, Open in Slack)), ENTITIES (Organizations,
Accounts, Contacts, Pipelines), CUSTOM OBJECTS (one item per real definition,
fetched on mount), TOOLS (Segments, Project Management, Scenarios, Surveys,
Campaigns, Canvas), KNOWLEDGE BRAIN — one Brain item for everyone, lit on
every `/brain*` route, with no badge; the four
questions are the Brain bar's tabs — SETUP (Settings, Lifecycle). Users and
Integrations live under Settings as People & teams and Connections.

**Navbar** is route-contextual on the left: a greeting on Copilot, a back button
and entity identity on detail pages, a title plus sub-navigation on list pages.
On the right: the rose "AI Copilot" button, four unwired icon buttons, the
notification bell with an unread badge and popover, and the avatar menu with My
Profile and Sign out. On `/dashboard/*` the Navbar is Communications' header
instead (transparent `h-16 px-4`, no border or shadow): "Dashboard" and the area
tabs on the left, the Ask pill then the bell on the right, and no avatar menu
(the sidebar's avatar carries it).

On the Records routes (`/organizations/*`, `/accounts/*`, `/contacts/*`) the
page draws its own title, Back link and List | Board tabs through `PageHeader`
into the Navbar's title slot (`NavActionsSlotContext.titleSlot`), and the
frames sit at the bar's 16px edge.

On `/pipelines/*` and `/communications` the page draws its title through
`PageHeader`; on `/brain/*` and `/work/*` the route layout does
(`BrainAskLayout`, `WorkRoutes`' `WorkLayout`), so the bar stays put across queues
and opened records. Page controls such as the scope reach the bar's actions slot
through `PageHeaderActions`. Communications now sits under the shared Navbar (its
own header is gone) and portals its Copilot controls into the actions slot from
lg.

Every Impact route (Segments, Surveys, Scenarios, Project Management, Campaigns
and Canvas, with any id, so a not-found record keeps the bar) is titled by its
page through `PageHeader`; the Navbar's per-route Impact branches are gone. The
legacy canvas builder (`/scenarios/create`, `/scenarios/:id`) still has no
Navbar.

Every workspace settings route (`/settings/*`) is under `WorkspaceSettingsLayout`, which draws `PageHeader title="Settings" titleAs="p"` into the Navbar's title slot below md only (phones have no nav column; from md the nav column's heading says "Settings"): the bar names the area as text and each page's `SettingsFrame` owns the page's only `h1`. The Navbar's Settings branch is gone, and so is account settings' own header: `/account-settings/*` redirects into Settings (2026-10-17).

---

## 3. Data conventions

- **One HTTP path.** `src/lib/apiClient.ts` attaches the bearer token from the
  auth hooks, serialises JSON unless a `FormData` is passed, lets absolute URLs
  through so DRF `next` links work, turns 204 into null, and raises `ApiError`
  with a message pulled from `detail`, the first field error array, or a bare
  string array.
- **One refresh path.** A 401 triggers `refreshSession`, one retry with the new
  token, then `onAuthFailure` which clears the session.
- **Pagination.** Pages forward and back through DRF's own `next` and `previous`
  links; no page size is assumed. `fetchAllPages` exists for the few screens that
  genuinely need everything.
- **Mapping layer.** Backend payloads are adapted into the table shapes the
  mock-era components already expected: `mapToOrgRow.ts`, `mapToAccountRow.ts`,
  `toHealthDataRow.ts`, with shared formatting in `formatters.ts`. Purely
  presentational values (pill colours, avatar initials) are derived there rather
  than invented in the component.
- **Dashboard filters.** `useDashboardFilters` (`src/pages/dashboard/shared/useDashboardFilters.ts`)
  reads and writes `useSearchParams` directly, so a filtered view is always a
  linkable URL. `SHARED_KEYS` (`owner`, `lifecycle`, `customer`) are the three
  every stats endpoint already reads, rendered by `DashboardToolbar`, and the
  only keys the Navbar's area tabs and Overview's links carry from one area to
  another (`sharedSearch`). Views add their own keys on top. Period keys:
  Forecast's `horizon_days` (default `365`), Activity's `days` (default `90`),
  Tickets' `days` validated against its `DATE_PRESETS`. Other view keys:
  Topics' `scope` (`customer:<id>` or `account:<id>`, which organisation or
  account to read — not a period), Product's `product`, Tickets' `priority`.
  `toQuery` turns the current values into the API's query string, renaming a
  key where the backend spells it differently.

---

## 4. Core flows

### 4.1 Sign in, refresh, sign out

Two doors, one session shape.

**Continue with Google / Microsoft** (`features/auth/oauth.ts`)

1. `/login` asks `GET /auth/oauth/providers/` on mount and shows a button per
   provider the backend has configured; none configured, and only the password
   form appears. The list is the server's answer, never a constant.
2. A button calls `POST /auth/oauth/<key>/start/` and sends the whole window to
   the returned `authorize_url`. Never an iframe or popup.
3. The provider returns to the backend, which redirects to `/auth/callback` with
   exactly one of:
   - `?handoff=<code>`: `AuthCallback` scrubs the code from the address bar,
     dispatches `loginWithHandoff` (`POST /auth/oauth/exchange/`) once (guarded
     against StrictMode's double effect) and lands on `/`.
   - `?setup=<code>`: nobody has claimed this person's email domain.
     `WorkspaceSetup` previews who is signing up (`POST workspace/preview/`),
     asks for a company name, and `createWorkspace` (`POST workspace/`) creates
     the organisation with them as its first administrator and signs them in.
     A `409 WORKSPACE_CLAIMED` means a colleague got there first: they are told
     to sign in again, where they will be routed to that workspace.
   - `?error=<CODE>`: `ACCESS_REQUEST_PENDING` gets its own "waiting for
     approval" screen; every other code is explained in words by
     `authErrorMessage`, never shown as an identifier.

**Email and password**

1. `Login.tsx` validates with `loginSchema` (Zod: email required, password at
   least 8 characters).
2. `dispatch(login)` → `POST /auth/login/` with `skipAuthRetry`, so a bad
   password does not trigger a refresh attempt. The error stays visible until
   the person edits a field.
3. Someone with an authenticator app enrolled gets `{mfa_required, mfa_token}`
   and no session: the page becomes the code form (`auth.mfaChallenge`), and
   `loginWithMfa` → `POST /auth/login/mfa/` mints tokens whose `mfa` claim the
   slice reads into `auth.mfaVerified` (also after every refresh). Enrolment
   lives in Account settings (`TwoFactorSection`: QR from the server's
   `otpauth://` URI, confirm with a code, recovery codes shown once).

**Either way**

3. Tokens and user are written to `localStorage` under `revenact_access_token`,
   `revenact_refresh_token` and `revenact_user`, then the app navigates to
   `state.from` or `/`, where `RootRedirect` sends a first-timer to
   `/onboarding` (until `user.tour_completed_at` is set; finishing or skipping
   the tour writes it through `PATCH /auth/me/ {tour_completed: true}`).
4. On reload, `authSlice` hydrates from `localStorage` so `ProtectedRoute` passes
   without a round trip.
5. Any 401 from `apiFetch` → `POST /auth/token/refresh/` (the rotated refresh
   token is stored) → the original request is retried once. A second 401 clears
   the session and the guard redirects.
6. Sign out: the Navbar avatar menu dispatches `logout`, which clears the client
   first and then makes a best-effort `POST /auth/logout/` to blacklist the
   refresh token.

Forgot and reset password are separate public pages; the reset page reads `uid`
and `token` from the query string. Changing a password while signed in lives in
Account settings, and only for people who have one: `user.has_password` is false
for someone who only ever signed in with a provider, and they see how they sign
in instead.

### 4.2 Organisations: list to detail

1. `/organizations/list` reads its state from the URL (`search, owner, lifecycle,
   health, product, renews_within, nps, ids, include_churned, sort, group`;
   `group` defaults to health and `group=none` turns grouping off) and calls
   `GET /organizations/portfolio/`. Grouped, that first call asks `limit=1`
   for the summary, groups, filter options and count; each expanded section
   then reads its own rows with `group_value=<key>&limit=25` and a "Show more"
   cursor. Ungrouped, the list pages 50 at a time. With any filter active, a
   second `?limit=1` call (with `include_churned=1` when the view includes
   churned accounts) gives M for "N of M organizations".
2. Five summary tiles (Health with Count/MRR/ARR, NPS, Lifecycle, Accounts · ARR,
   Renewing 30/90) show the server's figures for the current filters; clicking a
   segment writes that filter to the URL.
3. The toolbar has search (300ms debounce, name or Revenact ID), Group, Sort
   (with direction), Filters (a popover; a bottom sheet on phones holding group,
   sort, Export and Add too), Pin fields (up to three row chips per user, in
   `localStorage`), Export (`export.csv` of the current query via the session)
   and Add organization. Active filters are removable chips; removing one, or
   Clear all, returns focus to the search box. Opening the Filters or Pin
   fields popover moves focus into it; Escape, its own Close, or applying a
   choice sends focus back to the toolbar button that opened it, while a click
   outside just closes the popover and leaves focus wherever the visitor had
   already moved it.
   Each account is a row: health ring, name (links to the detail page), owner ·
   lifecycle · last touch, trend, renewal runway, pinned chips, ARR, AI/CSM pulse
   with the stored dots and a "pulses disagree" marker, and one signal. Below
   `sm` a row collapses to a two-line card holding the ring, name, owner, ARR,
   signal and trend; the renewal runway and pulse pair stay desktop-only there
   (an opened row's own panels still show both). Opening a row shows six panels
   (Commercial, Contract timeline, Adoption, Voice of the customer, Profile,
   History) inline, or in a bottom sheet on phones — which locks page scroll,
   traps focus, returns it to whatever opened the sheet on close, and shows the
   row's fresh values after a reload — with **Edit details** opening
   `OrganizationFormModal`.
   Selecting rows (a checkbox, a long press on phones, or the phone toolbar's
   Select toggle) shows the selection bar: Change owner and Set lifecycle
   (choosing a value only arms an "Apply to N" button beside it; the targets
   are the org's active members plus Unassigned, and every stage but churn),
   Export, Archive (`POST /organizations/bulk/`;
   the backend can refuse an account server-side — "You can't archive this
   organization." — and any failures list by organisation name with their
   reason, staying selected for a retry) and, for exactly one selected account,
   Churn (the existing `ChurnOrganizationModal`; cancelling it keeps the
   selection). Selection is capped at 500, with a hint once an unchecked row
   hits the cap, and a row's checkbox disables while its list or section is
   loading or a bulk action is running. Only a different query landing (a
   filter, sort or group change) resets the selection: ungrouped it prunes to
   the ids on the new page one; grouped it clears outright, since there is no
   one row set left to prune against. A reload of the same query (after a bulk
   action) keeps it, so failures stay selected even from a Show-more page.
4. On a row, the organisation name links to `/organizations/:id`; a row click
   or the chevron opens the row instead (inline on desktop, a sheet on
   phones).
5. `/organizations/:id` is the organization's story
   (`docs/superpowers/specs/2026-09-26-organization-detail-design.md`). It lands
   in four requests: `GET /organizations/portfolio/?ids={id}&include_churned=1`
   (the List's own row: the name row and the tiles), `GET /customers/{id}/`
   (the health breakdown and the edit form), `GET /customers/{id}/accounts/`
   (the account chips) and `GET /organizations/{id}/story/` (the Story). The
   tabs, in the URL as `?tab=`, are Story, Details (the connected accounts as
   list items linking to `/accounts/:id`, with Add and Edit; then the List's six
   panels; then the email, phone, industry and CSAT response bands from
   `GET /customers/{id}/`; then `AIAttributesPanel`), People (a list item per
   person, with a summary line and search), Maps (`MapsTab`, the
   organisation's stakeholder maps, `GET /customers/{id}/canvases/`), Deals &
   risks (an Opportunities / Risks switch over list items, the board from
   `sm`), Knowledge (Company View, then headlines) and Files (files, then
   calls grouped by day; both roll up the organisation's own records and
   every visible account's, each tagged); the last five read their data when
   first opened. Opening a
   tab reads its data the first time only: visited tabs stay mounted, with
   inactive panels hidden, so returning doesn't reload or blank them, and the
   Story is read only once Story has been opened. The account chips
   (`?account=`, an id or `none`) sit above the tabs on Story, People, Deals &
   risks and Files and filter each (the lists client-side by `account_id`);
   a chip counts the active tab: story items, people, opportunities plus
   risks, or files plus calls, and shows no number while that list loads or
   still holds another organisation's records (a slower reply for the
   organisation opened before never lands). New contacts, opportunities,
   risks, files and calls go on the chosen account; while `?account=` names
   an account the page does not have yet, the add and upload controls wait
   and say why. Each list keeps its rows while it reads again after a save.
   The Story's filters (`group`, `source`,
   `q`) live in the URL too. "+ Add" offers Log a call, New task, New
   note and Log survey — there is no "Log activity", since there's no create
   endpoint for it — with the existing forms, on the chosen account when there
   is one or at organisation level otherwise; an email opens its thread; any
   other item opens in place, with its link when it has one. A failed task or
   note save keeps the sheet open, keeps what was typed, and shows "Could not
   save that task." or "Could not save that note.", or the server's message.
   The Feedback filter group shows "Manage surveys", a link to
   `/surveys?customer={id}`. Edit opens `OrganizationFormModal`; Add account,
   beside it, opens `AccountFormModal`;
   ⋯ archives (`POST /organizations/bulk/`) or churns
   (`ChurnOrganizationModal`). A tile jumps to its Details panel; Health opens
   its breakdown. An id that is not a number, or one the viewer cannot see,
   says "Organization not found".
6. Ask Revenact sits beside this page (delivery 3 of that spec): the page is
   a child of `OrganizationsAskLayout`, so one conversation lasts from the List
   into an organisation and back. Each question posts `context:
   {surface:'organizations', view:'detail', organization, account, focus}`:
   `account` is the account chip on Story, People, Deals & risks and Files
   (null for All, for `none`, and on Details and Knowledge), never a name. The
   chip reads "Pizza Hut" or "Pizza Hut · EMEA", from the names the page
   reports to the layout; a sent question shows the server's `label`. "Ask
   about this" on a story item prefills "What should I know about this call?"
   and sets `focus: {kind, id}` for that one question (the send, the chip's ×
   or any change to the URL drops it). A `400` under `context.organization` or
   `context.account` shows "You can no longer ask about this organization." or
   "…this account. Choose All and ask again." on the rail, with no Retry. There
   is no link to `/copilot`.

Add and edit run through `OrganizationFormModal`; churn through
`ChurnOrganizationModal`, one account at a time; archive, owner and lifecycle
changes through `POST /organizations/bulk/` on the list, and a board move
through `PATCH /customers/<id>/`, one account at a time.

A dashboard drill's "Open as a list" (§4.7) lands here as `?ids=3,7`: the
portfolio call carries `ids` (archived and churned accounts named there are
included), the chip "Opened from the dashboard (2)" shows, and removing it
drops the param and returns focus to the search box. The count reads "N of M"
against the whole book.

`/organizations/board` shares the list's top half (the transparent top bar,
tiles, toolbar, chips and "N of M") and its URL state; the List/Board tabs
carry the query across. `group` defaults to lifecycle here (health on the
list); `group=none` from the list reads as lifecycle, and the board's Group
menu offers no None. The frame call (`limit=1`) gives each column header its
count and ARR from `groups`. Grouped by lifecycle, every stage is a column in
stage order, empty ones included. Churn lists churned accounts only when the
view includes them (`include_churned`, a `churn` lifecycle, or `ids`), and is
otherwise a drop target with "Show churned". Each non-empty column reads its
own cards with `group_value=<key>&limit=25` and loads the next page when its
end scrolls into view, with "Show more" as the fallback. A card (ring, name,
owner, ARR, signal, trend) opens its six panels in a side panel beside the
board — a non-modal aside — or the bottom sheet on phones, with **Edit
details**. Grouped by lifecycle, a card moves by drag (from `sm`) or its
**Move to…** menu (a compact icon button in the card header, "Move <name>
to…", that opens a menu of stages; nothing moves until one is chosen, an
outside click closes the menu without moving focus, and after a move focus
lands on the moved card in its new column):
the card and the counts move at once, `PATCH /customers/<id>/` saves
`lifecycle_stage`, one move at a time, and only once it saves do the frame and
the two columns reload; a failure rolls back the card and shows a dismissable
alert with the server's reason, and a polite status announces "Moved X to
Y." Moving into Churn opens `ChurnOrganizationModal` instead (confirming
reloads the board, cancelling changes nothing). Other groupings do not move
cards. Each lifecycle column but Churn has a "+" that opens Add organization
preset to that stage; the toolbar's own Add has no preset. Below `sm` the
columns are full-width panels that snap sideways, with a strip of column tabs
that jumps to one. The board has no selection mode; bulk work stays on the
list.

**Ask Revenact** is on both routes (spec §3), and on every organisation's page
(delivery 3, item 6 above). `OrganizationsAskLayout`, a
pathless layout route above the list, the board and `/organizations/:id`,
draws `OrganizationsFrame` (the `bleed` variant on an organisation's page)
and `AskRail` once, holding one conversation (the shared `AskProvider` with
the `organizations` surface), so both survive the tab switch and every
filter; a page's own `OrganizationsFrame` inside it is a pass-through
(`InFrame` context), never a second frame. `AskRail` portals the pill (New
chat, History, the Sparkles switch) into the Navbar's actions slot. Each
question posts `context: {surface:'organizations', view:'list'|'board',
filters:{search, owner, lifecycle, health, product, renews_within, nps, ids,
include_churned, sort, group}, focus}`: the portfolio params as the API reads
them, only the set keys present (never `ids: ''` or another unset key as
`''`), never a cursor, `group` only when it differs from the view's own
default, and the board's `group` never empty. The chip reads "Organizations ·
Owner: Carl CSM", with names from the
portfolio's filter options, which each page reports to the layout. Opening a
row on the list, or a card's side panel or sheet on the board, sets
`focus: {kind:'companies', ids:[id]}` for one question without opening the
rail — the send, the chip's × or a filter change drops it; closing the account
does not. The rail is the Dashboard's: a 320px glass column, open by default
from `xl`, a full-screen sheet below `sm`, with its own remembered choice
(`revenact_organizations_ask`). The rail wins its room: from `xl` the side
panel sits between the columns and the rail, both showing together; below
`xl`, with the rail open, a card opens in the bottom sheet instead, and
opening the rail closes a side panel that was already open. Beside the rail
the board's columns narrow to `w-64` (`w-72` otherwise). List rows and the
summary tiles wrap to their content column (`@container`, not the window):
rows go `@min-[60rem]:flex-nowrap`, tiles `@min-[50rem]:grid-cols-5`. History
tags an Organizations conversation with "Organizations" followed by the
server's own `labels`, joined with " · " ("Organizations · Owner: Carl CSM";
there is no `origin_label` field), and reopening one goes to its view with
its filters, then shows the thread. One started on an organisation's page is
tagged with the server's `label` ("Pizza Hut · EMEA") and reopens
`/organizations/{id}`, with `?account={account}` when it had one. A conversation that started on the
Dashboard, picked here, navigates to its dashboard view carrying the
conversation History already loaded (and its id) in the navigation state; the
Dashboard's rail shows that conversation for the visit at once, and only
fetches it by id when just the id survives (and the reverse) — a History
pick always navigates to the surface the conversation started on, whichever
page is showing it. Shared replies on Organizations are withheld from mentioned-only
readers by the same write-time snapshot rule as the Dashboard's; see
[API_CONTRACTS §"Shared sessions"](../../revenact-backend/docs/API_CONTRACTS.md).

### 4.3 Accounts

1. `/accounts/list` works like the Organizations list, on
   `GET /accounts/portfolio/`:
   - Its state is in the URL: `search, organisation, owner, lifecycle,
     health, renews_within, nps, ids, sort, group`. `group` defaults to
     health, and `group=none` turns grouping off.
   - A `limit=1` frame read gives the tiles, groups, filter options and count.
   - Each open section reads its own rows with `group_value`.
   - With a filter active, a `limit=1` probe gives M for "N of M accounts".
   - Nothing is hidden for churn.
2. Selecting rows offers Change owner and Set lifecycle (Churn included).
   - Each is applied with "Apply to N" through `POST /accounts/bulk/`, and a
     failure is named per account.
   - Export selected sends `ids`. Export CSV sends the view's query to
     `GET /accounts/portfolio/export.csv`.
3. `/accounts/board` uses the same state, with `group` defaulting to
   lifecycle, and every stage is a column.
   - A move saves through `PATCH /customers/<organisation>/accounts/<id>/`, on
     the first linked organisation the viewer may open.
   - It then reloads the frame and the two columns it touched.
4. Edit details reads `GET /customers/<organisation>/accounts/<id>/` and opens
   `AccountFormModal`. Add reads `GET /customers/` for its organisation picker.
   The page reloads after either.
5. An account's name opens `/accounts/:id` by its id alone (no navigation
   state).
6. `/accounts/:id` is the account's story
   (`docs/superpowers/specs/2026-09-29-accounts-redesign-design.md` §2). It
   lands in three requests: `GET /accounts/portfolio/?ids={id}&limit=1` (the
   list's own row: the name row, the tiles, the four Details panels and the
   currency), `GET /accounts/{id}/` (the owner and their function, the account
   pulse and the edit form) and `GET /accounts/{id}/story/` (the Story; no
   `account` is sent). An id that is not a number, or one with no row (the
   viewer may not open it), says "Account not found". The tabs, in the URL as
   `?tab=`, are Story, Details, People, Maps, Deals & risks, Files and Custom
   objects; each other tab reads its data when first opened and stays
   mounted: People `GET /accounts/{id}/contacts/`, Maps (`MapsTab`)
   `GET /accounts/{id}/canvases/`, Deals & risks `…/opportunities/` and
   `…/risks/`, Files `…/files/` and `…/calls/`, Details `…/surveys/` (the CSAT
   bands) and `GET /attributes/values/?account={id}`, Custom objects
   `GET /custom-objects/definitions/` then
   `…/records/?definition={d}&account={id}`. Every create goes to
   `/accounts/{id}/…` (contacts, opportunities, risks, files, calls, surveys,
   tasks, notes); none needs an organisation id.
7. Edit opens `AccountFormModal`, which PATCHes
   `/customers/{first openable organisation}/accounts/{id}/`, or
   `/accounts/{id}/` when there is none; the page then reads the row and the
   story again. Details' owner handover PATCHes
   `/accounts/{id}/ {owner_id, handover_note}`. ⋯ opens Add contact, Log a call
   and New task; New map, on the Maps tab, opens `NewMapDialog` and then
   `/canvas/<id>`.
8. Ask Revenact (delivery 3, spec 2026-09-29 §3) runs on all three routes —
   the List, the Board and an account's page — as one conversation
   (`/api/v1/copilot/messages/`, purpose `accounts`); see the route table's
   `/accounts/{list,board,:id}` row for its contexts, chip, refusals and
   History path.

### 4.4 Activity feed (unused)

**Dead:** the old account page's feed. Both detail pages (an organization's,
§4.3, and an account's, §4.2) now use the Story instead (§4.2 step 5, §4.3
step 6) — no route renders `ActivityFeed` or `PinnedAttributes` any more.
Removing them is a follow-up (accounts spec 2026-09-29 §2.10's "Removed",
and the owner's 2026-09-30 ruling). For what replaced it — filters, sources,
search, + Add, the day-grouped stream — see the Story tab in §4.2/§4.3 and
`src/components/organizations/detail/StoryTab.tsx`/`StoryToolbar.tsx`.

The table below describes `ActivityFeed` as it was before the Story
replaced it; it is history, not a live surface.

| Filter | State (when this page was live) |
|---|---|
| All, Activities, Emails, Tasks, Notes, Tickets, Calendar Events, Surveys, Sessions | Real |
| Slack | Inline `SLACK_DATA` mock |
| Pulse, Conversations, Revenact Support | "coming soon" |

Emails opened a thread panel with a quick reply, and Compose sent through the
signed-in person's own connected mailbox. Tasks and notes could be created
inline. Files uploaded with validation and downloaded through an
authenticated blob request. CallSense logged a call with an optional
transcript, which the backend summarised and classified immediately — all of
which the Story's own + Add and Files/Calls tabs carry forward.

### 4.5 Pipelines

1. `/pipelines/list` reads `GET /pipelines/{opportunities|risks}/` (the kind
   from `?kind=`, opportunities when absent):
   - Its state is in the URL: `kind, search, organisation, account, owner
     (id|unassigned|outside), stage, priority, department (none = whole
     company), date (30|90|180|overdue|none), changed (quarter), ids, sort,
     group`. `group` defaults to stage; `group=none` turns grouping off. With
     no `stage` the server lists the open stages.
   - A `limit=1` frame read gives the tiles, groups, filter options, count and
     currency; each open section reads its own rows with `group_value`; with a
     filter on, a `limit=1` probe gives M for "N of M opportunities" (the
     same stages and `ids` as N, so both count the same set).
   - Selecting items offers Set stage, priority, department and date through
     `POST /pipelines/<kind>/bulk/`; a failure is named per item and stays
     selected. Export sends the view's query, or `ids`, to
     `GET /pipelines/<kind>/export.csv`.
2. `/pipelines/board` uses the same state; with no `stage` it asks for every
   stage. A move is `PATCH /opportunities/<id>/` or `/risks/<id>/` with the
   new `stage`, then the frame and the two columns it touched read again.
3. An item or card opens `OpportunityFormModal` / `RiskFormModal`, built from
   its row. Save PATCHes `/opportunities/<id>/` (or `/risks/<id>/`), Delete
   confirms and DELETEs. Add first asks where the item belongs:
   `ParentPicker` searches `GET /customers/?search=` and
   `GET /accounts/?search=` as the viewer types (only what the server
   returns, so only what the viewer may open). An organisation keeps the
   form's optional account step (`GET /customers/<id>/accounts/`) and POSTs
   `/customers/<id>/opportunities/` or
   `/customers/<id>/accounts/<id>/opportunities/`; an account POSTs the flat
   `/accounts/<id>/opportunities/` (risks alike). The parent is in the path,
   never the body. The page reads its book again after each.
4. Opportunities | Risks keeps the view and the shared filters and drops
   `stage`, `changed` and `ids`, except that a Closing / Due tile's
   narrowing (`date=30|90` with the kind's open stages) carries over as the
   other kind's open stages.
5. Ask Revenact (spec `docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md`
   §3). `PipelinesAskLayout` sits above both routes with one `AskProvider`
   (surface `pipelines`, preference key `revenact_pipelines_ask`): the same
   conversation survives the List, the Board and both kinds. A question
   posts `context: {surface:'pipelines', kind, view, filters, focus?}` —
   `kind` always sent, `filters` the page's own set URL keys (never the
   default sort or group, `group:'none'` for the List's ungrouped, never
   from the Board), `focus` present only when "Ask about this" (a List
   item's or a Board card's quiet Sparkles button) named one. A view or kind
   switch keeps the conversation and drops an unsent focus, since each is a
   URL change and `AskProvider` drops a pending focus on one. The server
   stores its own `label` on the context and the origin (never including the
   focus) and that label replaces the live chip once a sent question's
   answer lands; until then the chip reads "Pipelines · Opportunities" or
   "Pipelines · Risks" plus the page's own filter chips, named from
   `useReportPipelineOptions`'s read when it matches the asked kind, else
   the toolbar's placeholders. History tags a Pipelines conversation with
   the server's `label` and reopens `/pipelines/list?<filters>` or
   `/pipelines/board?<filters>`, never `/pipelines`. One case does not
   round-trip the tile highlight: reopening from a server-canonical List
   context whose `stage` the server dropped (equal to the List's own
   default open stages) lists the same rows but no longer shows the
   Closing/Due tile as active, since the explicit `stage` that marked it
   is gone. A turn the server withheld (a mentioned reader's reply) comes
   back with `context: null` and shows no chip; a conversation whose
   `origin` is `null` carries no History tag and opens where the person
   already is.

### 4.5b Feature requests (Brain > Feature Requests)

1. `/brain/requests`. `FeatureRequestsPage` lists what customers keep asking
   for, most revenue first, with a status filter. Every figure is the
   reader's own: the ARR, the company and ask counts and the evidence cover
   only the companies they may open and the records they may read. It reads
   `?scope=` (Me, My team, Company) through the Brain's scope switch, sends
   it on the list and on each detail, and is open to every member; See all
   on What customers are saying lands here in the same scope. A status
   change keeps the scope's figures (the PATCH answers unscoped).
2. Leadership presses "Gather asks": the backend clusters the interactions
   the classifier tagged as feature requests and names each new group. The
   result says how many requests were made, from how many asks, and how many
   are left for the nightly pass.
3. Opening a request shows its summary, the companies asking with their ARR,
   and the evidence with a link to each company. Leadership can change the
   status from the same pane.

### 4.5d Anomalies (Brain > Anomalies)

1. `/brain/anomalies`. `AnomaliesPage` lists what is going wrong at several
   companies at once, most revenue first, with a status filter. Every
   figure is the reader's own: the companies they can open and the reports
   they can read. It reads `?scope=` (Me, My team, Company) through the
   Brain's scope switch, sends it on the list and on each detail, and is
   open to every member; See all on What customers are saying lands here in
   the same scope. A status change keeps the scope's figures (the PATCH
   answers unscoped).
2. Leadership presses "Look now" to run detection rather than waiting for
   the nightly pass, and the result says how many clusters were named and
   how many reports joined existing ones.
3. Opening one shows the summary, the revenue and spread, the companies hit
   with links, and the reports behind it. Leadership can mark it
   acknowledged or resolved, and a resolved cluster stops collecting.

### 4.5c The account brief and what nobody can answer (Company View)

1. Organization Details › Company View opens with `AccountBriefPanel`: the
   standing brief on what this account uses the product for, who the
   stakeholders are and what is still open, with the date it was written
   and who asked for it.
2. "Write the brief" or "Rewrite" asks the Copilot to read what the company
   knows and write a new one. It cites the records it used; a reader is
   shown only the citations they may open, with a count of the rest.
3. Under it, "What we cannot answer": questions asked of the Copilot that
   had nothing to go on, and routed questions nobody answered. Answering
   one records an ordinary contribution and closes the gap; a gap not worth
   answering can be dismissed.

### 4.5e Reading in your language, writing in theirs (Communications)

1. An email, ticket or call in the queue detail pane carries a Translate
   control with a language picker. The original shows until somebody asks;
   the translation then replaces it with a line saying what it was written
   in, and "Show original" puts it back.
2. Translating the same message again costs nothing: the backend keeps it
   per record per language, and the pane keeps what it has already asked
   for.
3. When the contact's own language is known, the reply box offers "Write in
   French" (or whichever): it puts the draft into their language in place.
   The person still reads it and still presses send.

### 4.5f Brief delivery (Settings › Work › Briefs)

1. `/settings/work/briefs`. An admin pastes a Slack incoming webhook and
   chooses weekly on a weekday or monthly on a day. There is no hour: the
   job that posts it runs once a night, so it goes out on its day.
2. The webhook is written once and never shown again: the page shows the
   last few characters, enough to recognise which hook is set, and when it
   last sent.
3. "Send one now" proves a new schedule without waiting a week. It reports
   plainly when no brief has been written yet, because the schedule posts
   what exists and never writes one itself.

### 4.5f2 Tasks and Notifications (Settings › Work)

1. `/settings/work/tasks` and `/settings/work/notifications` each read
   `GET /work/settings/` once (`WorkSettingsFrame`). With `can_edit`
   (`manage_org_settings`) a switch or select (the timezone, the digest and
   its hour) sends `PATCH /work/settings/` with that one field the moment it
   changes, then shows "Saved" with Undo (a second `PATCH` with the old
   value); typed fields (the escalation days, the working days) wait in the
   page's save bar, whose Save (or Enter in a field) sends only what
   changed. Without it the values are text.
2. Tasks: `escalate_after_days` (checked first, "Choose a whole number from
   1 to 30."), `timezone` (the browser's IANA list; the server refuses a
   name it does not know with "Choose a timezone from the list.") and
   `working_days` (sent sorted; none is refused with "Choose at least one
   working day."). The timezone moves every Work date: Mine's groups,
   overdue, Assign's prefilled due date and the badge all use the server's
   date there, never the browser's.
   A failed read says "Nothing is shown rather than settings that may be out
   of date." with Try again; after Try again focus moves to the page heading
   when the read succeeds and back to Try again when it fails (never on the
   first load). Recommendations, Tasks and Notifications all use the frame.
3. Notifications: `digest_enabled` and `digest_hour` (local hour in the
   workspace timezone), both saved at once. `email_ready` false shows "Email
   isn't set up on this server yet: digests are skipped" to everyone, in a
   warning `Banner`; nothing else changes.
4. The backend reminds an overdue task's assignee once a day
   (`task_overdue`) and tells their manager once (`task_escalated`); both
   arrive in the bell and open `/work?queue=mine&task=<id>` (an old `/work/mine?task=<id>` or `/work/today?task=<id>` link redirects), and the task's
   trail gains "Revenact reminded …" and "Revenact told …" lines.

### 4.5g Agent access (Settings › Developers › Agent access)

1. `/settings/developers/agent-access`. Anyone can make a key for an agent that reads
   Revenact as them over MCP: it sees their book, their mail and their
   department's tickets, and cannot change anything.
2. The secret is shown once, on the screen that made it, with a copy
   button and a plain warning that nobody can recover it afterwards.
3. The list shows each key by name, its last four characters, when it was
   made and when it was last used. Revoking asks first and takes effect
   immediately.

### 4.5h Segments

Spec `docs/superpowers/specs/2026-10-03-segments-design.md`. Every read is the
reader's own: members are computed over what they may open, and a shared
reader also gets `hidden_count`, a count only.

1. **List.** `/segments` → `GET /segments/` (`scope=mine|shared`, `search=`
   when set). The owner's nightly figures (`member_count`, `today`, `sparkline`)
   are null on rows the reader does not own and read "—".
2. **Build.**
   - **The modal.** The builder is a modal: `/segments/new` over the list,
     `/segments/<id>/edit` over the segment's page (nested routes, so the page
     under it stays loaded), and Save as segment over the list it came from.
     Closing it returns to the page under it.
   - **Draft and preview.** The builder keeps the rules as a draft (uids,
     missing values). Each complete draft is previewed with
     `POST /segments/preview/ {kind, rules, pinned_ids, excluded_ids}`, 400 ms
     after the last change; an answer a newer draft superseded is dropped.
   - **Save.** `POST /segments/`, or `PATCH /segments/<id>/` with only the
     fields that changed (never `kind`, and a rename alone never resends
     `rules`), then the segment opens (an edit swaps the saved copy into the
     page under the modal, without reading it again). `shared_with` is sent only while
     `sharing` is `people`; an inactive teammate still in the chosen list is
     dropped before the send, with a note at the field.
   - **400s.** `{rules}`, `{name}`, `{shared_with}` and `{kind}` show at their
     fields, and `{detail}` (the 50-segment limit) above the form.
   - **Someone else's segment.** `/segments/<id>/edit` shows a read-only notice;
     **Duplicate to edit** POSTs `/segments/<id>/duplicate/` and opens the
     copy's builder.
3. **Save as segment.**
   - The Organizations, Accounts and Contacts lists open the builder modal in
     place, from `?kind=<kind>&<their own filter query>`
     (`saveAsSegmentSearch`), with one shared button, `SaveAsSegmentButton`
     (`components/organizations/portfolio/toolbarParts.tsx`). The list's own
     URL does not change.
   - `rulesFromList` turns it into rules: owner, lifecycle, health, product,
     renewal window, NPS band, organisation, account, sentiment and role.
     `include_churned=1` becomes "Churned is yes or no".
   - The search and picked `ids` don't carry over, and a note says so.
   - Names for the organisations and accounts named come from
     `GET /organizations/portfolio/?ids=` and `GET /accounts/portfolio/?ids=`.
4. **Open.**
   - `/segments/<id>` reads the segment, then the members (the kind's own rows;
     `search`, `sort` and `group` in the page URL; only `sort`, `group`,
     `group_value`, `search`, `cursor` and `limit` are sent).
   - A separate `limit=1` read gives the tiles and `hidden_count`.
   - **Pin, Unpin, Keep out and Let back in** are
     `PATCH /segments/<id>/members/<record>/ {state}` (owner only), then the
     members and tiles reload.
   - The **Kept out** list is named through the preview, with no rules and
     those ids as pins, ten at a time (its own `Show more`); names are sorted
     within each batch of ten, not across the whole list.
   - **Export CSV** fetches `members/export.csv` with the tab's search and sort.
   - **Delete** confirms, then DELETEs and returns to the list.
5. **Changes.** `?tab=changes&days=7|30|90` → `GET /segments/<id>/changes/?days=`.
   It shows each day's totals, up to 100 names each way and "+N more", and
   reasons as field names; a reason with no known label falls back to the raw
   field key with its `attr:` or `parent.` prefix stripped (e.g. "csat_score",
   not "attr:csat_score").
6. **Alert.** The nightly step's `segment_changes` notification shows in the
   bell like any other; clicking it opens `/segments/<id>?tab=changes`.

### 4.5i Surveys

Spec `docs/superpowers/specs/2026-10-03-surveys-design.md`. A send asks one
standard question (NPS, CSAT or CES) of the people at the builder's own
segment, by email, as a one-time link to `/s/<token>`.

1. **List.** `/surveys` → `GET /surveys/sends/` (unpaginated, newest first).
   `?tab=logged`, or `?customer=<id>` alone, shows Logged scores: `GET
   /surveys/` as before. A row with `send_id` links to its send and offers no
   edit or delete (the backend refuses them: 400 and 409).
2. **Build.** `/surveys/new` (over the list), `/surveys/<id>/edit` (over the
   send) or `/segments/<id>/survey` (Survey these, over the segment, with it
   chosen).
   - The segments offered are the caller's own (`GET /segments/?scope=mine`).
   - Who it reaches: `POST /surveys/sends/audience/ {segment, roles}` 400 ms
     after the last change, latest wins. Roles go only with organisation and
     account segments; Champion and Decision Maker are ticked by default.
   - **Save draft:** `POST /surveys/sends/`, later `PATCH
     /surveys/sends/<id>/` with only what changed; opens `/surveys/<id>`.
   - **Send:** saves the draft, asks the count again, shows the confirm, then
     `POST /surveys/sends/<id>/send/` and opens `/surveys/<id>`. A 400 lands at
     its field; 403 and 429 above the form; a 409 (already sending or sent)
     opens `/surveys/<id>`. Closing the modal after Send saved a new draft
     opens that draft; the Sends list reads again whenever the modal closes
     over it. A workspace with no email set
     up refuses with a form-level 400 ("Email isn't set up for this workspace
     yet, so surveys can't be sent."); the confirm stays open over the saved
     draft rather than losing it.
   - After the send, Edit offers only the name and sharing.
3. **Read a send.** `/surveys/<id>` → `GET /surveys/sends/<id>/` (a 404 for
   one not shared reads "Survey not found"), then `GET
   …/answers/?filter=&cursor=` (the page keeps `?answers=`; Show more passes
   the server's cursor) and, once Not answered is opened, `GET …/pending/`.
   A draft's owner can delete it (`DELETE /surveys/sends/<id>/`).
4. **Answer.** `/s/<token>`: `GET /public/surveys/<token>/`, then `POST
   {score, comment?}` (204) and "Thanks, your answer was recorded." Every 404,
   on either call, is the one expired page; a 429 says to wait.

### 4.5j Rules

Spec `docs/superpowers/specs/2026-10-04-rules-design.md`. A rule is "when →
then" on one of the owner's own segments, run nightly as the owner by the
backend's `run_health_maintenance`.

1. **List.** `/scenarios` → `GET /rules/` (every readable rule, by name;
   unpaginated). `?tab=canvas` shows the canvas list as before. A row's
   switch is `PATCH /rules/<id>/ {is_active}`, turning on only after the
   confirm; a 400 (no segment) shows under it. A new rule is saved off
   unless the owner turns it on in the builder, which confirms first.
2. **Build.** `/scenarios/rules/new` (over the list), `/scenarios/rules/<id>/edit`
   (over the rule) or `/segments/<id>/rule` (Automate, over the segment, with
   it chosen).
   - The segments offered are the caller's own (`GET /segments/?scope=mine`).
   - **Test this rule:** `POST /rules/test/` with the rule's body (`name`
     optional, and `rule: <id>` when editing); nothing is written. The
     answer is worded as an estimate ("… would match if tonight's run
     happened now") and shows while the rule is unchanged.
   - **Save rule:** `POST /rules/` (201, then `/scenarios/rules/<id>`), or
     `PATCH /rules/<id>/` with the whole rule; this needs no confirm. A rule
     whose segment was deleted can still be renamed, re-shared or switched
     off: its PATCH leaves out `segment` and the trigger fields, and a
     segment is asked for only to change the trigger or turn it on. When
     an edit changes the segment or the trigger of a rule whose last night
     waits for review, a line before Save says "Saving this expires the
     survey waiting for your review." (the backend expires it), and after
     the save the rule page reads its nights again. 400s
     land at their fields (`actions` per card); the segment-ownership 403 at
     the segment; 429 (50 rules) above the form. Turning the rule on from
     Status, and Send without review on a survey action, each ask first in
     place (`ConfirmedSwitch`/`InlineConfirm`).
3. **Read a rule.** `/scenarios/rules/<id>` → `GET /rules/<id>/` (a 404 for
   one not shared reads "Rule not found"), then `GET /rules/<id>/runs/`
   (Show more passes the server's `next`), and, when a night is opened, `GET
   /rules/<id>/runs/<run_id>/`. A night's skipped figure adds every
   `skipped` count (`cooldown`, `cap`, `not_visible`, `failed`, `nobody`);
   a skipped record says why: its cooldown, every action failed (`failed`),
   or nothing to do for it (`nobody`: no action could act on it, e.g. nobody
   it could be told to). The `nobody` reason is the whole record's; a Notify
   action's own "skipped (nobody to notify may open it)" is that action's
   result. `?run=<id>` (the `rule_fired` link) opens that night. The owner can turn it on (asking first in the shared
   `ConfirmDialog`, outside the modal), Edit, or Delete it (`DELETE
   /rules/<id>/`, behind its own confirm).
4. **Review.** A rule review waits on the reader's Mine (`/work?queue=mine`,
   Needs your decision, from `GET /work/feed/`, kind `rule_review`; the
   Approvals chip, `?kind=approval`, shows approvals and reviews together).
   Approve is `POST /rules/reviews/<id>/approve/`; the row leaves and the
   toast links "Open survey" (`/surveys/<survey_send_id>`) or "Open
   campaign" (the campaign's send; Campaigns if it was deleted), and the
   reader stays on Mine. A 400 is Surveys' refusal, shown on the row,
   which stays; a 400 whose body is the backend's `RULE_CHANGED` sentence
   (the rule's segment or trigger changed since the review was made) drops
   the row instead; Skip is `POST …/skip/`; a 409 or 404 removes the row
   ("Already decided."). A review the backend never decided expires on its
   own 7 days after its night.
5. **Notifications.** `rule_fired` links to `/scenarios/rules/<id>?run=<run_id>`
   (or nowhere, for someone who may not read the rule); `rule_review` links to
   `/brain/review`, which redirects to Mine's Approvals
   (`/work?queue=mine&kind=approval`).

### 4.5k Plans

Spec `docs/superpowers/specs/2026-10-04-plans-design.md`. A plan is a run of
work on one organisation or account: milestones and the tasks under them,
copied from a template when it starts.

1. **List and board.** `/projects` → `GET /plans/?<filters>&status=…` (List:
   `open` by default; Draft is `draft`; All is `open`, `draft`, `done` and `cancelled`), cursor pages
   of 50 (`cursor`). The Board reads one `GET /plans/?status=<s>` per column;
   each page's `counts` holds every column's count. Scope: Mine is
   `owner=me`, Has my tasks `mine=tasks`; the default waits for
   `GET /auth/members/` (All when someone reports to the reader). A move is
   `PATCH /plans/<id>/ {status}` (on_track, at_risk, done), then every column
   reads again. Show drafts (`?drafts=1`) adds a `status=draft` column; a Draft
   is never moved by the board. A `counts` without `draft` reads as 0, and a
   board holding only drafts shows its empty state while Show drafts is off.
2. **Start.** `/projects/new` (or `?template=<id>` from Templates' Use),
   `/organizations/<id>/plans/new`, `/accounts/<id>/plans/new`.
   - Records: `GET /customers/?search=` and `GET /accounts/?search=`; the
     chosen record's owner: `GET /customers/<id>/` or `GET /accounts/<id>/`.
   - Templates: `GET /plans/templates/`.
   - Start plan: `POST /plans/` with the reviewed copy (`milestones`, each
     task's `assignee` an id). 201 opens `/projects/<id>`; 409 `PLAN_OPEN`
     links to `plan_id`; 400s sit at their fields (`milestones` nested).
3. **A plan.** `/projects/<id>` → `GET /plans/<id>/` (404 reads "This plan
   doesn't exist or you can't open its record."). Every write answers with
   the plan: `PATCH /plans/<id>/` (status, cancel), `DELETE` (409 says
   cancel instead), milestones (`POST`, `PATCH {name, due_date, done}`,
   `DELETE` (refused with "Some of its work is done; mark it done instead."
   when any of its tasks is done), `POST …/reorder/ {order}`), tasks
   (`POST`, `PATCH`, `DELETE`; a tick is `PATCH {status}`),
   `POST /plans/<id>/save-as-template/`. A Draft (an agent-started plan whose
   undo sent it back) shows `pending_tasks` and Start plan: `POST
   /plans/<id>/start/` makes its tasks again, due from today, and answers the
   plan (`not_started`); 409 `NOT_DRAFT` or `PLAN_OPEN` (with `plan_id`) show
   the server's sentence. `PATCH` and `DELETE` work on a Draft; its status is
   never set by hand. `started_by_agent` reads "Started by the CS agent".
4. **Templates.** `/projects/templates` → `GET /plans/templates/`; the
   editor `POST` or `PATCH /plans/templates/<id>/` (whole body); Delete.
5. **Records.** Organisation and account pages read
   `GET /customers/<id>/plans/` or `GET /accounts/<id>/plans/`. Draft plans are
   listed on their own, between open and finished.
6. **Rules.** The Start a plan action is `{action: 'plan', template: <id>}`;
   the dry run adds `plans: {would_start, already_open}`.
7. **Notifications.** `plan_started` and `plan_task_assigned` link to
   `/projects/<id>`.

### 4.5l Campaigns

Spec `docs/superpowers/specs/2026-10-04-campaigns-design.md`. A campaign is
the owner's plain-text email to one of their segments (Surveys' audience
rules). The list reads `GET /campaigns/?tab=&archived=&cursor=`; the editor
`POST`s once, then `PATCH`es only what changed; its preview pane posts
`POST /campaigns/<id>/preview/ {contact, subject, body}` 400 ms after the
last change and reads `GET /campaigns/<id>/audience/` for its person picker;
Send now… saves, reads `audience/` again, then `POST /campaigns/<id>/sends/`
once (a refusal clears the latch, so a retry posts again). Its refusals are
`400 {detail}` in the backend's order and stay at the Send button: "Email
isn't set up…", "This campaign is archived.", "Its owner is no longer
active.", then "Choose a segment first.", "Write a subject and a body
first." and "Nobody in this segment can be emailed right now."; a field
refusal goes back to its field.
A campaign's page reads `GET /campaigns/<id>/`, `GET …/sends/` and, for an
open send, `GET …/sends/<sid>/deliveries/?status=&reason=&cursor=`; a
`sending` send is read again every 3 s. Archive is `PATCH {status}`; Delete
answers 409 once sent. `/u/:token` reads and posts
`/campaigns/unsubscribe/<token>/` without a session. A contact's
Re-subscribe is `PATCH /contacts/<id>/ {campaigns_unsubscribed: false}`. The
rule action `campaign` and its reviews go through the Rules endpoints; a
campaign review carries the campaign and counts, never the records' names.

### 4.5m Your mail, two-way (Communications › your mailbox)

Two-way Gmail delivery 2 (contract `revenact-backend
docs/superpowers/plans/2026-10-11-gmail-actions-api.md`). The list reads
`GET /mail/threads/` (Sent and Drafts keep `GET /mail/messages/`), with
`folder=all&label=<id>` for a label; the sidebar's labels and their unread
conversations come from `GET /mail/labels/`. Opening a row reads
`GET /mail/messages/<id>/thread/` and, when it has unread messages, sends
`PATCH .../thread/ {is_read: true}`. Every action is a `PATCH .../thread/`
(`is_read`, `is_starred`, `state`, `trashed`, `spam`, `add_labels`,
`remove_labels`); bulk actions and Unmute are `POST /mail/actions/` with
`op` and `thread_of`. The screen changes first and puts the change back
when the server refuses (`409 MAILBOX_PAUSED`, `TWO_WAY_OFF`,
`NO_MAILBOX`, `400 GMAIL_ONLY`, `TOO_MANY`), saying why; after a refusal it
reads the connection again. A new label is `POST /mail/labels/ {name}`
(pending until Gmail creates it; `409 LABEL_EXISTS` applies the existing
one). Gmail's outbox may still fail later: the message then carries
`sync_issue` and the owner gets `mail_action_failed`, whose link
(`?source=mailbox:google&message=<id>`) opens the conversation; while the
mailbox is open, that notice reads the list again. Attachments are fetched
with the session from `download_url`
(`GET /mail/attachments/<id>/download/`): images and PDFs open in a
viewer, the rest download; `cid:` images are fetched the same way (once per
part per tab) and inlined. On a record's Files tab, filed mail's
attachments (`source: "email"`) list beside uploads and cannot be deleted.

### 4.5n Writing mail (Communications › your mailbox)

Two-way Gmail delivery 3 (contract `revenact-backend
docs/superpowers/plans/2026-10-11-gmail-writing-api.md`). On a Google
two-way mailbox (paused included), Compose (`c`) and Reply, Reply all and
Forward (`r`, `a`, `f`) open the composer, which reads
`GET /mail/compose/?kind=&message=` (nothing is stored). The first change
waits two seconds and `POST /mail/drafts/` (with `kind` and
`source_message_id`); later changes `PATCH /mail/drafts/<id>/` with the
whole content and the `revision` it was edited from. While an answer says
`gmail.state` is `saving`, the draft is read again (every 3 seconds, a few
times) until Gmail confirms. `409 DRAFT_CHANGED` carries the newest draft:
the screen shows it and the person takes the Gmail version or keeps theirs
(a PATCH with the new revision). Files go up one at a time as multipart to
`POST /mail/drafts/<id>/attachments/` (over XHR, for progress), after a
check against the upload allow-list and the total (the draft's
`max_bytes` and `total_bytes`, the compose prefill's before a draft exists,
25 MB otherwise); `DELETE .../attachments/<id>/` removes one. Every write
runs in order, so a revision is never sent twice. Send is
`POST /mail/drafts/<id>/send/` with the content and `revision`; 200 closes
the composer and reads the list, counts and conversation again;
`504 SEND_UNCONFIRMED`, `409 SEND_SUPERSEDED`, `ALREADY_SENT` and
`DRAFT_GONE` read the draft again (`GET /mail/drafts/<id>/`), and an
unconfirmed send is settled with `POST .../confirm-sent/` (which closes
the composer and reads the mailbox again, like a 200) or `.../reopen/`;
`MAILBOX_PAUSED`, `TWO_WAY_OFF`, `NO_MAILBOX`, `MESSAGE_TOO_LARGE` and
`ATTACHMENT_UNAVAILABLE` are shown in the server's words. In Drafts, a row
with `draft` opens `GET /mail/drafts/<draft.id>/`; Delete and `#` call
`DELETE /mail/drafts/<id>/` for one (a 404 counts as done) and
`POST /mail/drafts/discard/ {ids}` for more, never the thread PATCH. The
`mail_action_failed` link `?source=mailbox:google&folder=drafts&draft=<id>`
opens that draft; any other `?draft=<id>` is still an agent's reply draft
(`/communications/drafts/`), whose list hides drafts with `mail_draft_id`.
Search sets `q` on `GET /mail/threads/` (or `/mail/messages/`); "Search
older mail in Gmail" reads `GET /mail/gmail/search/?q=&page_token=` 20 at a
time, and opening a result without `message_id` posts
`POST /mail/gmail/search/open/ {gmail_id}` and opens the stored message.
Outlook, IMAP and read-only Google keep `POST /mail/messages/<id>/reply/`.

### 4.6 Copilot and multiplayer sessions

1. `/copilot`. `HomeView` offers skill cards that prefill a prompt, and a
   `MentionTextarea` that completes colleague and function mentions.
2. Sending posts to `/copilot/messages/`, creating or continuing a conversation.
   `ChatView` sits straight on the canvas (no card): the user's question is a
   surface pill on the right, the answer is a reading column (`AnswerText`
   renders paragraphs, numbered and bulleted lists, bold and code) with its
   sources and a single Copy action; the ask box stays pinned at the bottom.
   While the answer is pending, a skeleton with a live status line shows.
3. The owner clicks "Make this a live session" → `POST .../session/` → the
   `ws/copilot/sessions/:id/` socket opens. A slow 20 second poll stays as a
   resilience fallback only.
4. "Hand off to…" picks a member and a note. A hand-off is its own way for a
   session to start existing; it does not require making the session live first.
5. The invitee sees "Invited to a live session" in the sidebar, polled every 8
   seconds, and accepting joins them. Access is invite only, and the same
   visibility function gates both REST and the socket.
6. "Capture decisions" runs the facilitator over the transcript and writes
   proposals that wait on Mine (Needs your decision, the Approvals chip),
   tagged with the session. "Close
   session" offers to capture first; the close always stands even if capture
   fails. A decision about a record this reader can't open shows only as a
   count ("N more decisions about records you can't open"), never named; a
   reader without view_all_accounts sees no evidence or reasoning on any
   proposal, visible or not (SOC2:AUTH-02).
7. A viewer who may see only part of a conversation gets a `visibility: partial`
   notice, and a reply citing records outside their scope is withheld entirely.
8. Conversations started on the dashboard carry an `origin` (area, view,
   filters). The chat history shows it before the time ("Revenue › Forecast ·
   2h ago"); such a conversation opens here as plain text.

The Cockpit tab is a personal view: portfolio summary, a renewals window of 30,
60 or 90 days, and my tasks.

### 4.7 Dashboard

The old "Advance Dashboards" tab bar is gone; the dashboard is now three areas
under one route tree, defined once in `src/pages/dashboard/areas.ts` (`AREAS`)
and rendered by `src/pages/dashboard/routes.tsx` (`dashboardRoutes`):

```
/dashboard/overview                                  Overview (attention list + headline cards)
/dashboard/revenue/{forecast,customers,products}      Revenue
/dashboard/health/{triage,divergence,movement,
                    renewals,usage,activity,
                    distribution}                     Health
/dashboard/support/{tickets,topics}                   Support
```

- **Overview** (`Overview.tsx`) is the dashboard's landing page: a ranked
  "Needs attention" list beside a headline card per area, filtered by the
  same three book filters as the areas.
  - **The list** (`overview/AttentionList.tsx`, `GET /dashboard/attention/`)
    holds five kinds — renewal, risk, going quiet, support, anomaly — ranked
    by money at stake × urgency (the server's own `score`; the client never
    re-ranks). Each row shows a kind chip, a title (a link to
    `/organizations/<id>` for every kind but anomaly), a reason line and the
    amount at stake. An **anomaly** row's title is a button, not a link — it
    opens the drill panel over its list of companies (`"1 company"` /
    `"<n> companies"`),
    since one anomaly can span several.
  - **Snooze 7 days** and **Done** are optimistic: the row is replaced at
    once by a "Snoozed · `<title>`" / "Marked done · `<title>`" line with an
    **Undo** button in the same place; a failed call restores the row and
    shows an alert and puts focus back on the row's Snooze. Focus moves to
    the Undo button after Snooze/Done and back to Snooze after Undo, and the
    swapped line is `aria-live="polite"`. Undo is held in the list's own
    state, keyed by item and spliced back in at the position it was acted
    on; it lasts until the filter changes (`Overview.tsx` keys the whole
    `AttentionList` by the query string, so another filter starts clean) or
    the page is left. The Overview only refetches on a filter change, so
    there is no same-filter reload for it to survive. An Undo whose DELETE
    answers 404 (the snooze already gone) counts as done.
  - While a refetch runs, or after a failed load, the previous rows stay on
    screen dimmed but read-only: Snooze, Done and Undo are disabled and the
    list is `aria-busy`, so nothing is filed under a filter it doesn't
    belong to.
  - **Snooze 7 days** expires after 7 days: the item returns then if it is
    still a candidate. It returns sooner if it **gets worse** than it was
    when snoozed (risk score rising, renewal further overdue, more ARR at
    stake, more open tickets) or a **new episode starts** (a new renewal
    date, a new last contact, a newly open ticket).
  - **Done** has no expiry: the item returns only when it gets worse or a
    new episode starts, never merely because time passed.
  - **The three headline cards** (`overview/HeadlineCards.tsx`) — Revenue,
    Health, Support — each read the same slice/endpoint their area page
    does, so the Overview can never disagree with the page its
    "Open `<Area>` →" link goes to (which carries only the shared filters).
    Revenue shows "ARR today" and "At risk" (churn + contraction, 12 months)
    off `fetchForecast`; Health mirrors the shared filters into
    `state.health.filters` exactly as `HealthOverviewContainer` does
    (clearing them on unmount) and shows "Book at Good x/y" and "Needs
    action n" off the same triage summary the Triage view uses; Support
    shows "Open tickets" and its oldest-open-day count off
    `fetchTicketStats` — Support/Tickets has no lifecycle filter, so only
    owner and account travel to it.
  - Each card shows a skeleton in place of its figures until the data it
    holds actually answers the current filters — a stale answer for a
    previous query (a different horizon, a filter changed mid-flight) counts
    as not loaded yet, not shown as if it were current.
- **`DashboardFrame`** is the `dashboard` route's element: an outer row
  (`p-4`, `relative`) holding the scroll container (`overflow-y-auto`) for
  Overview and every area, since `DashboardLayout`'s `<main>` is
  `overflow-hidden`.
- **Ask Revenact.** `DashboardFrame` mounts `FilterNamesProvider` →
  `DashboardAskProvider` (the shared `AskProvider` with the dashboard
  surface) → `DrillProvider` around `[scroll area][AskRail]`
  (`src/pages/dashboard/ask/`). The conversation lives in `AskProvider`, above
  the areas, so it survives tab and filter changes.
  - **Sending.** Each question posts to `/copilot/messages/` with
    `context: {surface:'dashboard', area, view, filters:{owner, lifecycle,
    customer}, focus}` and no text prefix. `useDashboardContext()` reads the
    route (`areas.ts`) and `useDashboardFilters(SHARED_KEYS)` at send time, so a
    follow-up after a filter change carries the new filters; the client never
    sends figures, and the server recomputes the screen. Each user message shows
    its own chip from its echoed `context` (e.g. "Revenue › Forecast · Owner:
    Priya"), with names from the view's filter options, which `DashboardToolbar`
    reports into `FilterNamesProvider`. Replies render as plain text
    (`whitespace-pre-wrap`), not the paragraph/list/bold `AnswerText` formatting
    `/copilot` uses; a reply withheld from a reader with narrower visibility in
    a shared session renders the same way, as plain text.
  - **Layout.** Shaped like Communications' Copilot rail: a 320px glass
    column (`CopilotRail variant="glass"`), no header row of its own. The
    frame is Communications' too: `DashboardFrame` is `flex gap-3 px-4 pb-4`
    under the transparent top bar (`<main>` unpadded on `/dashboard/*`), so
    the content column (filters toolbar and views, its own scroll) and the
    rail share a top and run the full remaining height; hidden, the content
    takes the full width. The empty rail shows Communications' line ("Ask
    about what is in front of you. Answers use your accounts, mail and
    tickets."); the suggested questions were removed on 2026-09-24 at the
    owner's request. Its
    controls are a pill in the Navbar, where the four decorative icons were
    (`/dashboard/*` only): New chat, History (its popover anchored in the
    pill) and the Sparkles switch ("Show Copilot"/"Hide Copilot",
    `aria-pressed`). `DashboardLayout` owns a Navbar actions slot
    (`layouts/navActionsSlot.ts`); the Navbar renders it on dashboard routes
    and `AskControls` portals the pill into it (nothing renders without a
    slot). Open by default from `xl` (1280px), hidden (not rendered) below it
    until switched on; the switch's choice is kept in `localStorage`
    (`revenact_dashboard_ask`, read and written in try/catch). Below `sm` the
    switch opens a full-screen sheet instead (`aria-modal`, Tab trapped, a
    Close button, Escape/Close return focus to the switch).
  - **Entry points.**
    - Typing.
    - "Ask about these" in the drill panel: it closes the drill first, because
      the drill takes the rail's box at `lg` and up, then opens the rail and
      prefills "Why are these in <segment>?" with focus `{kind:'companies',
      ids}`. It is enabled only for a complete list of up to 200 accounts;
      otherwise it is disabled with a note explaining the 200-account limit,
      and nothing is sent until the person sends it.
    - "Why?" on an attention row: it sends "Why is this on my list?" at once
      with focus `{kind:'attention', key}`. While an answer is in flight
      (or that row's Snooze/Done is) it is `aria-disabled` and `ask()` sends
      nothing and clears nothing.
    - Every entry point (and a History pick) opens the rail (or the phone
      sheet) for that visit only, and so does New chat; only the Sparkles
      switch, from `sm` up, writes the remembered
      open/closed choice to `localStorage` — an entry point never
      overwrites it. The phone sheet's Close saves nothing; the sheet
      always starts closed.
    - Calling `ask()` (a send-at-once entry point) replaces any earlier
      drafted question and its focus, so a prior "Ask about these" draft
      can't be sent alongside a new focus.
    - A focus lasts one question; it is also dropped by the chip's × or by
      another area or filter.
  - **States.**
    - In flight: a "Thinking…" skeleton.
    - A `400` (a malformed context) is shown as a generic error with Retry,
      the same as any failure that isn't a budget one.
    - A `429`: "This month's AI budget is used up." with no retry.
    - Any other failure keeps the question, with Retry, which resends the
      question exactly as first asked — its own context and focus — not the
      screen as it now stands.
    - Sources render under answers as on `/copilot`.
  - **History.** The Navbar pill has New chat, History and the switch. History is
    shared with Communications and the Copilot page. A conversation whose
    `origin` is set shows a tag with only its area and view (e.g. "Revenue ›
    Forecast"), never the filters it was asked with — those live on each
    question's own chip. Reopening one on the dashboard navigates to its area,
    view and filters, then shows the thread. A conversation that started on
    Organizations reopens there instead, with its view and filters (§4.2).
    From Communications or `/copilot` it opens where you are, as plain text,
    with the tag shown (an Organizations one's is "Organizations" followed by
    the server's own `labels`; there is no `origin_label` field).
- **`AreaLayout`** hands each area's sub-view list down through `Outlet`
  context (`useSubViews`); each container renders `DashboardToolbar` (the
  sub-view switch plus the filter row) and dispatches its own fetch.
- **Health** carries seven views from three containers:
  `HealthOverviewContainer` renders Triage, Divergence, Movement, Renewals and
  Distribution off one `/customers/health/` request (`useHealthOverview`
  applies the shared owner/lifecycle/account filters to all five, mapped by
  `toHealthDataRow`; unrated pulse scores are null and excluded from the
  divergence scatter, which says how many it left out); `UsageOverviewContainer`
  and `ActivityContainer` are separate containers for Usage and Activity.
  Distribution is itself two halves: the old Health Controls charts
  (`ControlsView`) and the old `/health` page's whole-tenant
  Organizations/Accounts × count/MRR rollup (`HealthDistribution`), which
  reads `/customers/stats/` and `/accounts/stats/` — neither accepts the
  dashboard's filters, so that half ignores the bar above it and says so
  (`"Covers the whole book; the filters above do not apply to this section."`)
  whenever `owner`, `lifecycle` or `customer` is set.
- **Filters** live in the URL — see "Dashboard filters" in §3 — so a filtered
  view is a link, not a session-local state. Health mirrors the URL into
  `state.health.filters` exactly (`replaceHealthFilters`, no pruning), so a
  deep link applies even when the book loads after it; once rows exist, a
  filter the book cannot honour (an owner who left, an account the chosen
  owner doesn't hold) is removed from the URL itself, narrowest first.
- **Redirects.** `/health` and every `/dashboard/advance/*` path redirect to
  their new home with the query string kept (`Keep`, `LegacyRedirect`); the
  mapping from an old path to its new one is `LEGACY` in `areas.ts`. `/dashboard`
  and `/dashboard/custom` both land on `/dashboard/overview`.
- **Drill-down.** Any number or chart segment that can name the accounts
  behind it opens the drill panel — one panel for the whole dashboard,
  mounted once by `DashboardFrame` inside a `DrillProvider`
  (`src/pages/dashboard/drill/`), not one per view. A `Kpi` given an
  `onDrill` renders as a button (`"<label> <value>, show accounts"`); a
  Recharts segment a keyboard can't reach gets a parallel `DrillTargets` row
  of real buttons, visible on focus. Both call `useDrill().open({title,
  figure, source}, trigger)`.
  - **Source.** `{kind: 'rows', rows}` for a list already computed
    client-side — Triage's three tiles, Divergence's headline numbers,
    Movement's downgrade/upgrade counts, Renewals' four tiles plus its
    calendar/coverage-gap/owner-load charts, Distribution's owner bar,
    CSM/AI pulse bars and renewal-date bar, Customer Overview's "Top 3
    concentration", Usage's three seat tiles and its utilisation-band chart.
    `{kind: 'server', path, query, segment}` for one the client can't
    compute cheaply, which fetches `GET <path>?<query>&drill=<segment>` —
    Customer Overview's "Churned in 12 months" (`/customers/overview/`),
    Activity's "Gone quiet" (`/customers/activity/`), Forecast's "At risk"
    tile and its ARR-bridge chart (`/customers/forecast/`), Tickets'
    KPIGrid and every donut/bar (`/tickets/stats/`), Topics' five charts
    (`/interactions/stats/`).
  - **Completeness.** A drill opens only where the list behind it is
    complete, never from a capped one (Forecast's `swing` table, Activity's
    `going_dark` table, Customer Overview's `concentration` list beyond its
    own top three, Topics' `recent` table). Every Health view (Triage,
    Divergence, Movement, Renewals, Distribution) turns every one of its
    drills off when `useHealthOverview()` reports the book `truncated`;
    Usage turns its three tiles and band chart off until
    `stats.scatter.length >= kpis.measured_count` (the scatter is capped at
    500 rows server-side with no `truncated` flag of its own), and its "No
    seat data" tile is never drillable — those accounts aren't in `scatter`
    at all. Product Usage (`product-usage/ControlsView.tsx`) has no drill
    anywhere: every figure there is an aggregate across a product's own
    customers, never a set of accounts.
  - **Panel.** `role="dialog"`, `aria-labelledby` the title. From `1024px`
    (`lg`) it takes the Ask rail's box, 320px wide. With the rail showing
    it lies over the rail and covers it exactly (absolute: `lg:top-0
    lg:right-4 lg:bottom-4`, against `DashboardFrame`'s `relative` row). With
    the rail hidden (switch off) or collapsed it is a 320px flex item in the
    rail's place in that row, so the content column narrows while the drill
    is open and returns to full width when it closes; the figures are never
    covered. Below that it
    is a full-screen sheet (`aria-modal="true"`) with
    its own Tab/Shift+Tab focus trap, since there's nowhere else useful for
    focus to go. Escape and the close button both close it from either
    layout — Escape always closes the sheet, but at `lg` it closes the panel
    only when focus is inside it and nothing else already handled the key
    (`defaultPrevented`), so the page keeps its own Escape. Focus returns to
    the trigger that opened it, and moves to the close button when a drill
    opens, not when the viewport merely crosses `lg`.
  - **Lifetime.** A drill describes the screen it was opened on, so the
    panel closes when the path or query string changes (another area, or
    any filter), without refocusing the old trigger. While a view refetches
    it keeps its old figures on screen, dimmed, but every server drill on it
    (Forecast, Customer Overview's churned tile, Activity's gone-quiet tile,
    Tickets, Topics) is off until the new figures land — a drill then would
    send the new query and list its accounts under the old figure. A bucket
    at 0 in Tickets or Topics offers no drill. A segment the backend doesn't
    recognise comes back with no `drill` key and the panel says "This number
    can't be listed.".
  - **Rows.** Each links to `/organizations/<id>`, shows its ARR and an
    optional one-line detail worded for the segment (a risk score, days
    overdue, seats used, tickets, interactions — `drillApi.ts`'s
    `formatDetail`). A ticket or interaction drill lists companies, not
    records, so one 11px line under the header says so: companies with at
    least one matching ticket (interaction), records not linked to a company
    aren't listed, and one on a shared account counts for each of its
    companies. Renewals' calendar and coverage-gap segments show the ARR the
    segment draws, not an account count. A server drill that the backend itself truncated at 500
    prints "Showing n of count". "Open as a list" appears only when the full
    count is known, `<= 500` and not truncated, and goes to
    `/organizations/list?ids=<comma ids>`.

### 4.8 Knowledge and @mentions

1. Organisation detail, Company View tab: the accountable owner tile with hand
   over, a responsible person per function, the contributions feed with a
   composer, and the questions panel.
2. Asking picks an assignee or uses `@name`, `@engineering` or `@team`. The
   assignee is notified.
3. They answer in place on Mine (and, with `manage_users`, on My team), from Next up on the Copilot Cockpit, from Communications' Questions for you, or on the organisation's Knowledge tab. The answer is stored as a contribution, so retrieval picks it up.
4. Assistant turns can suggest who to ask, and a question raised in a chat links
   back to that chat through its notification.

### 4.9 Connections (Settings › Workspace › Connections)

Reached at `/settings/connections`; `/integrations` redirects there with its
query, so the backend's OAuth callbacks land with their result. Account
settings › Integrations is gone: `/account-settings/integrations` redirects
here and its sidebar entry opens this page (spec 2026-10-16-connections-page-design).

Three sections, one row per connection (`components/integrations/ConnectionRow`):
logo, name, its state in words, one line on what it does, one primary button,
and the rest in a ⋯ menu.

- **Your accounts** (every member; they act as the person):
  - **Gmail** (`GmailAccountRow`, `GET /mail/connection/`). Not connected:
    **Connect Gmail** opens an app-password form (Gmail address, app password,
    a link to Google's app-password page) and posts `POST /mail/connect/imap/`
    with Gmail's IMAP/SMTP hosts; the password is cleared after every attempt.
    When the workspace is cleared for two-way Gmail the button is **Connect
    Google Workspace / Gmail** (`POST /mail/connect/google/`) and the app
    password moves to the menu; while a gate blocks Google, its sentence shows
    under the row. ⋯ also offers another mail provider (full IMAP/SMTP form).
    Connected: the state is the address and last sync; **Sync now**
    (`POST /mail/sync/`); ⋯ Reconnect (Google) and Disconnect (confirm,
    `DELETE /mail/connection/`); underneath, Status, Connected as, and for
    Google Two-way, Push and Import, the reconnect banner, and the signature.
  - **Slack** (`SlackAccountRow`, `GET /connectors/slack-link/`): **Link Slack**
    (`POST`, then Slack's consent) once the workspace's Slack is connected;
    linked shows "Linked as <name>" and **Unlink** (confirm, `DELETE`); a lost
    link shows Reconnect. Slack returns to `/settings/connections?slack_link=
    linked|error&detail=`. A backend without the endpoint shows "Not available
    on this deployment yet" and no button.
  - **Jira** (`JiraAccountRow`, `GET /connectors/jira-link/`): **Link Jira**
    once a workspace Jira exists; linked shows "Linked as <name> · <sites>"
    and **Unlink**; lost shows Reconnect with Unlink in the menu.
- **Workspace** (`manage_integrations` only; others never load
  `GET /connectors/`): Slack and Jira (`WorkspaceToolRow`), one connection
  each, the one with credentials or else the first (seeded ones included; no
  "Add another"). Not connected says how many records are already here and
  **Connect** opens the credentials form for that connection
  (`ConnectSourceForm`; Slack offers **Sign in with Slack**), creating it
  first (`POST /connectors/`) only when none exists. Connected says "Connected
  · synced … · N conversations|tickets · <how Slack files> · visible to …",
  **Sync now** (`POST /connectors/<id>/sync/`), ⋯ Reconnect, Choose channels
  (Slack), Change who sees it, Disable (confirm when connected),
  Disconnect (confirm). Disabled shows **Enable**. Agent access shows under a
  connected row.
- **Coming soon**: Salesforce, HubSpot, Zendesk, Freshdesk, Intercom, Any
  other system, GitHub, Figma, Microsoft Teams, Zoom; greyed, no buttons.
  Records they already brought in stay on customers.

**Send to Revenact** (Slack message shortcut; backend `POST /connectors/slack/interactivity/`):
a person picks it from a Slack message's ⋯ menu; Slack sends only that message.
It arrives in that person's Work (`/work/mine`, Suggested group, kind
`slack_message`, chip Suggestions) as a private row (`components/work/SlackMessageRow`):
the agent's one-line summary, the sender and message, the customer's context
(health, ARR, renewal, owner and its newest open tickets, only when the reader
may open it), then its two things, one click each (owner, 2026-10-16): the
**Jira issue** (an editable title, **Create in Jira** →
`POST /work/slack-messages/<id>/jira/`, made once, then its key as a link) and
the **Reply** to the sender (an editable box, as the person, **Send reply** →
`.../reply/`, sent once, then "Replied to <name>." with View in Slack). The
reply's draft becomes its with-issue form, the key and link filled in, once
the issue exists, unless the person edited it. **Do both** makes the issue
first and replies with its link; a refused issue stops it there with the
reason. Without a Jira connection it says where to connect one. Then
**Open in Slack** (the message's permalink, new tab) and **Dismiss**
(`DELETE /work/slack-messages/<id>/`, owner only; a 404 leaves the feed saying
it is gone). Nobody else, managers and admins included, ever sees it.

One status region, always mounted, says what a provider's return means
(`?connector=connected|agents_on`, `?jira_link=linked`, `?slack_link=linked`);
failures are alerts.

### 4.10 Settings and administration

`/settings` is the workspace's settings (spec
`docs/superpowers/specs/2026-10-06-settings-rework-design.md`, reworked by
`docs/superpowers/specs/2026-10-11-settings-production-design.md`), in
`WorkspaceSettingsLayout` on a solid canvas: twelve items in four groups in a
left nav from `md`, a grouped select below it (see 03 UI/UX, "Settings: the
frame"). Work, Agents, AI and Webhooks & API access are tabbed pages, each tab
its own address. An item is shown only to someone one of its routes lets in;
each page gates its own writes by capability. The Navbar shows "Settings"
here below md only.

Saving is the same on every page: a switch or a single select saves the
moment it changes and shows "Saved" with Undo; typed fields wait in one
sticky bar, "Unsaved changes · Discard · Save", which saves every edited
section (Enter in a field does the same), and leaving with edits (a link,
the phone section picker, closing the tab) asks "Leave without saving?".

- **Workspace.** General (`GeneralSettingsPage`): the name and slug,
  read-only, and the owner. The owner picks another active member, confirms
  ("You keep your role but lose the owner's rights."), and the page posts
  `/auth/organisation/owner/ {user_id}`, then reads `/auth/me/` again so
  `is_owner` flips; a refusal shows the server's message below the picker.
  Everyone else reads "Only the owner, <name>, can hand the workspace on."
  People & teams (`UserManagement`, `manage_users`), Connections
  (`Integrations`), Plan & billing (`BillingSettingsPage`).
- **Data.** Attributes (`SettingsPage`): usage per entity with a Filter (the
  types present, Has values / Empty, a count on the button, Clear; reset per
  sub-tab) and Download of the rows on screen as `<entity>-attributes.csv`,
  plus the global attribute mapping. Defaults (`DefaultsPage`): Currency with
  its exchange rates, the currency in the save bar because saving a new one
  clears every rate (a note says how many), and New organisations' default
  lifecycle stage, saved the moment it is chosen, with Undo. Products,
  Imports (CSV importer with column mapping).
- **Automation › Work** (tabs Recommendations, Tasks, Notifications,
  Briefs). Recommendations (`WorkRecommendationsPage`, every member):
  `GET /work/settings/`; with `can_edit` (`manage_org_settings`) who
  receives them and each source's switch send `PATCH /work/settings/` at
  once, with Undo; a source's threshold and the dismiss cooldown wait in
  the save bar, which sends only what changed, each number checked first
  against the contract's limits in its words ("Choose a whole number from
  1 to 120."), a refusal shown under its field; Run now posts
  `/work/recommendations/refresh/` and says what it did. The signals are four (Renewal due, Health drop, Urgent tickets, Anomalies); the three retired kinds are gone. Without
  `can_edit` the values are text. Tasks (`WorkTasksPage`) and
  Notifications (`WorkNotificationsPage`), the same way (4.5f2); Briefs
  (4.5f) keeps its own button.
- **Automation › Agents** (tabs Agents, Actions & approvals). Agents (the AI
  switch, tone, and each agent's switch, credits and Run now) and Actions &
  approvals (Auto, Ask or Never per agent and action), see 4.11c.
  `/settings/ai-agent` redirects to `/settings/agents`.
- **Automation › AI** (tabs Attributes, Skills, Usage, Feedback; the last
  three `view_all_accounts`).
- **Developers › Webhooks & API access** (tabs Webhooks, one event, stated
  as "Sends when: Organization created"; Agent access).

Old addresses land with `replace`: `/settings` → General,
`/settings/currency` and `/settings/global-presets` → Defaults,
`/settings/activities` and `/settings/connect-widget` → General, `/users` →
People & teams, `/integrations` → Connections with query and hash kept. The
eleven one-page addresses from before the tabs keep their query and hash
too: `/settings/recommendations`, `/settings/work-tasks`,
`/settings/work-notifications` and `/settings/brief-delivery` → the Work
tabs; `/settings/agent-actions` → `/settings/agents/actions`;
`/settings/ai-attributes`, `/settings/ai-skills`, `/settings/ai-usage` and
`/settings/ai-feedback` → the AI tabs; `/settings/webhooks` and
`/settings/agent-access` → the Developers tabs. The bare `/settings/work`,
`/settings/ai` and `/settings/developers` open their first tab;
`/settings/agents` is itself the Agents tab.

People & teams manages members with inline role, function, manager and active
controls, a Roles tab that edits capability checkboxes live, and an Access tab
(`AccessTab.tsx`, `features/access/accessSlice.ts`): people waiting to join
(approve with a role, or reject), invitations (send by address and role; the
invited person signs in and is let straight in; cancel), and email domains
(add, copy the TXT record, check DNS; verified domains route sign-ins here).
Domains need `manage_org_settings`; the rest needs `manage_users`.

`/account-settings/*` is the personal side, in the newer shell (own left nav,
assistant rail): profile name, password or sign-in method, two-factor,
appearance (light, dark, system), timezone, cached-data reset, plan and
billing (`features/billing/billingSlice.ts` against `/api/v1/billing/`: the
plan, seats used of limit, AI credit balance, published plans, and, with
`manage_org_settings`, the credit ledger; also reachable as Settings › Plan &
billing until the account-settings round removes the duplicate), integrations,
personalization
rules, skills and tasks, about.

### 4.10a The internal portal

`/platform/*`, for Revenact staff only (`features/platform/platformSlice.ts`
against `/api/v1/platform/`). Its own thin shell, never the tenant one.
Overview counts; organisations with search by name or domain and a status
filter, and **New organisation** (name plus the owner's email: the owner is
created as the tenant's root user, an Admin with no password who signs in
with a provider on that address or from the reset email); an organisation's
name (rename in place), owner (transfer to another active member when the
owner cannot), suspend or reactivate with a required reason, archive (closes
sign-in, hides it from the list, purges nothing), members (owner first),
domains, the last twenty audit events, and a billing card (plan, seats,
credits, recent ledger; adjust credits, set the seat allowance or change the
plan, each with a mandatory reason); the "Google two-way mail" switch (turn on or off with a mandatory reason, `POST /platform/organisations/<id>/gmail/`; turning it off pauses that workspace's Google mailboxes within a minute) with its connected and paused counts and the platform-wide count against Google's 100 test users; a Gmail column on the list and a Google mailboxes tile on the overview; staff with their second-factor
state. Metadata only: nothing here shows a tenant's customers,
emails or notes, and the backend pins that. The Sidebar shows a Platform link
to superusers.

### 4.11 Brain

Every `/brain*` page sits under the Brain bar (spec 2026-10-06 Brain UI): the
tabs What changed, What's being done and Customers carry
`?scope=` between pages (Waiting on you was removed in work in one place delivery 2;
`/brain/waiting` redirects to Mine's Approvals), the scope
switch is in the bar (inline below `sm`), and each question opens with
tiles built from the data it already reads. On What's being done and What customers are saying a tile sets
`?section=` and moves focus to that section, as the section links did.

What changed at `/brain` for every member (spec 2026-10-05 §2). The scope
switch offers only the scopes `GET /brain/scopes/` returns (Me, My team,
Company), narrowest first; one scope offered reads as a label, not a control;
below `sm` it is a select. The scope is `?scope=`, else the reader's last
choice in `localStorage`, else the server's default; a 403 `SCOPE_NOT_ALLOWED`
drops back to the default with "You no longer have access to that view."
The header line names the comparison: a month-end, a baseline ("since your
view started"), or a team just changed. The brief is kept text — none yet,
stale with Write again, or current — written only from a click (Write my
brief / Write the company brief), sent once however fast it's clicked. What
moved lists each signal with its drivers, a handover ("includes 2 customers
handed to…") and an inline Why?, opening one explanation at a time: the kept
explanation, or Explain this; hidden organizations the reader can't open are
counted, never named. A failed read never offers a write beside it ("None
yet" is a successful read with nothing kept, not an error): the brief and
each explanation gate Write/Explain on `value === null && !loadError`, plus a
stale brief or explanation's own Write/Explain again. Everything we measure
lists every metric. Knowledge by function has moved to What's being done.
A quiet "Knowledge graph" link (Lucide `Network`) sits in the toolbar row for
every member, to `/brain/graph?scope=<scope>`; a driver that is a product or
an owner links to the graph on that node. The graph reads `GET
/brain/graph/?scope=` for every member, starts on `?owner=` / `?product=`
when a link names one, and counts the scope's customers the reader can't
open. Its `agent_action` nodes (which replace the old proposals) are the
scope's waiting agent actions the reader may read, of every kind and agent;
a record action acts on its organisation, a builder action has no relation,
and a node opens `/work/activity?action=<id>`.

Beside the graph's title, someone who may see every account (`view_all_accounts`,
the server's rule) gets "Export as OKF" (`components/brain/OkfExportButton`). It
downloads `GET /knowledge/okf/` through `apiFetchBlob` as
`revenact-knowledge-okf.zip`: the workspace as an Open Knowledge Format v0.2
bundle (metrics and their attested computations, customers, and what people know
about them). While it runs the button reads "Exporting…" and is disabled; a toast
says when it is done or that it failed. Everyone else never sees it.

What customers are saying (`/brain/customers`, spec 2026-10-05 customers §2)
is open to every member, on the same scope switch: `GET
/brain/customers/?scope=` gives the top 5 asks and anomalies in the scope
(ranked by the ARR in it, with totals; See all opens
`/brain/requests?scope=` or `/brain/anomalies?scope=`), NPS, CSAT and CES
for the last 90 days against the 90 before (null under 5 answers in a
window; CES on organisations only) with this window's latest comments the
reader may open and a count of the rest, and the scope's negative contacts
with who turned negative in the last 30 days (`tracking_since` null until
the first recorded change). Reads only.

Waiting on you (`/brain/waiting`) was removed in work in one place delivery 2: the route redirects to Mine's Approvals, and what waited there is on Mine and the Rest of company queue.

What's being done (`/brain/doing`, spec 2026-10-05 Doing §2) is open to
every member, on the same scope switch: `GET /brain/doing/?scope=` gives the
initiatives on the scope's book (Me: those I own or cut to me; My team: the
same for my desk; Company: all), the plans on its records (open first, then
the last 30 days' done and cancelled, with health and ARR then → now), the
rules owned on the desk (the full counts on my own, fired only on others'),
and how many plans the reader can't open. Its tiles set `?section=`,
which `useBrainScope` keeps while it settles `?scope=`. New initiative
starts one on the reader's own book (`POST /brain/initiatives/?scope=me`),
or in My team on a report's (`for_user`, chosen from `GET /auth/members/`
through `reports_to`), offering only the metrics with an owner cut; in
Company, for `view_all_accounts`, the full form posts to
`/metrics/initiatives/` as before. The page then reads `doing/` again and
focuses the new row. Edit, Mark done, Abandon and Reopen send `PATCH
/brain/initiatives/<id>/` once each; a 403 "You can't change this
initiative." stays on the row. Knowledge by function shows in Company for
`view_all_accounts` readers. `/brain/initiatives` redirects to
`/brain/doing?section=initiatives`.

Agents, Skills and Feedback Log have moved to Settings › AI (AI usage, AI
skills, AI feedback).

**Answer quality** (Settings › AI › Usage, between This month and Recent
calls; owner 2026-10-16, Google's "measure before you cut"): the newest run
of Copilot's golden set (`GET /copilot/evals/`, view-all-accounts) — "N of
M passed", the date, the Copilot and judge models and the last runs' scores;
then each question, failed first, with Passed / Failed, its kind, who asked,
the judge's scores and reason, and Copilot's answer behind a disclosure.
Before the first run: "Not measured yet." with the command
(`run_copilot_evals`). A failed read is an error state with Try again.

Ask Revenact on the Brain (spec `docs/superpowers/specs/2026-10-06-brain-ask-design.md`
§2). `BrainAskLayout` wraps every Brain page in `BrainRoutes` (the
redirects sit outside it) with one `AskProvider` (surface `brain`,
preference key `revenact_brain_ask`), so the conversation survives every
tab and scope change. A question posts `context: {surface:'brain', scope,
tab}`: `tab` comes from the route (`changed` at `/brain`, `doing`,
`customers`; `waiting` is kept only so Ask history started on the removed Waiting page still names it), and `scope` from the page once its
scope settles. Each tab reports it (`useReportBrainScope`), keyed by its path. There is no
`focus`. Until the scope settles the context is null and nothing is sent.
Feature Requests, Anomalies and the Graph keep the rail but send nothing.
While the conversation is empty, the tab's three fixed starters are offered,
and pressing one sends it. A `400` under `context.scope` reads "That view
changed; ask again." with no Retry. A `429` reads as the month's budget
spent, and a `503` shows the server's message. The stored origin is the
context itself. History tags it "Brain · <tab> · <scope>" and reopens
`<tab path>?scope=<scope>`. A Brain answer is readable by its asker and by a
same-organisation reader who sees everything and reads every ticket
department; anyone else shown the conversation sees the question with the
answer withheld (spec decision 2, enforced by the server).

### 4.11b Work (the inbox, bundles, History and the task panel)

Agent bundles delivery 1 (frontend): `/work` is one inbox, `WorkInbox`.
Mine, My team, Rest of company and History are queues on a rail
(`QueueRail`, counts from `GET /work/queues/` through `useQueues`), chosen by
`?queue=` and filtered by `?kind=` (`KindChips`). A queue the rail does not
offer the reader falls back to Mine (the URL is rewritten, replace). A bundle
row opens `?bundle=<id>`: `BundleSheet` reads `GET /agents/bundles/<id>/`
(`useBundle`); Run selected posts the ticked steps to `POST …/run/`, a failed
step's Retry posts `POST …/steps/<id>/retry/` (the other failed steps keep
their edits), and Reject bundle posts `POST …/reject/` after "Choose a
reason."; a reject, an undo or a lost bundle reads the feed and the queues
again (`feedChanged()`, `taskChanged()`), so the row leaves without a reload.
Closing asks "Discard your edits?" whenever there are edits, including edits
to a failed step of a partly done bundle and a filled reject form (Keep
editing brings the form back with its values). A Send step's audience shows
only while the step waits; a send saved only as a draft reads "Saved as a
draft." after it runs. History rows name a rejected bundle's reason, never its
note.

Round 2 D1 (Jira comments and signatures). Running a Jira comment step: the
person edits the Comment field (saved with `PATCH …/steps/<id>/` as `body`),
ticks the step and presses Run; the step's result carries the comment link
("Open the comment on SUP-12 in Jira"), which History shows too. A failed run
shows the step's error with one Retry (`POST …/steps/<id>/retry/`). When
Jira's live lists fail on a Jira step, one error and one Try again show for
the step. The backend lists a step's placeholders in stored-key order, so the UI never
relies on their order: it finds one by its step and key, or by its field. Writing an Outlook signature:
Settings › Connections, in the "Your mailbox" card, type up to 10 lines, Save
(`PATCH /mail/connection/`), "Signature saved."; the signature is added under
every email sent from Revenact. A Gmail signature is read only there and
appears as a read-only block in the mail editor; IMAP has none.

Round 2 D2 (act as the person). Linking Jira: Settings › Connections, "Your
Jira account", **Link your Jira account** (`POST /connectors/jira-link/`, the
browser leaves for Atlassian's consent and comes back to
`/integrations?jira_link=linked|error&detail=`, which becomes `/settings/connections`);
the page shows "Jira account linked." or "Could not link Jira: <detail>" and
reads the link again. **Unlink** asks first, then `DELETE` and the card goes
back to its intro; the person can also remove Revenact under Connected apps in
Atlassian. Running a Jira step as yourself: the panel reads "Created in Jira
as you (Carl Lee)" and the issue is made as them; without a link it names the
connection and offers **Open Connections**. Moving a Slack reply to a channel
Revenact does not sync: in the Reply step, type in "Search channels", choose
"#escalations (Not synced)" in "Channel" (`channel_choice`), tick the step and
press Run; the preview then names that channel. A step its tool blocks shows
its text read only, with the reason and the link to fix it.

Spec 2026-10-07 Work round §1.5; contract
`revenact-backend docs/superpowers/plans/2026-10-07-work-tasks-api.md`
and `revenact-backend docs/superpowers/plans/2026-10-07-work-recommended-api.md` (delivery 2).
Mine: spec 2026-10-12 work in one place §5; contract
`revenact-backend docs/superpowers/plans/2026-10-12-work-one-place-api.md`
(delivery 1).

- **Mine** (`/work?queue=mine`; `/work/mine`, `/work/today` and
  `/work/recommended` redirect here, keeping the query and history state) reads `GET /work/feed/`:
  everything waiting on the reader in eight groups, in this order: Needs
  your decision (rule reviews, approvals, questions and drafts, oldest
  first), Overdue, Today, This week, Later, No date, Blocked (tasks and
  to-dos, by due date then priority) and Suggested (newest first). Empty
  groups are not drawn; each heading carries the group's full `count`.
  The chips All, Tasks, To-dos, Approvals, Questions and Suggested write
  `?kind=` (`task`, `todo`, `approval`, `question`, `suggestion`; no
  `kind` is All, an unknown one reads as All) and the read sends it;
  Approvals sends `kind=approval,rule_review`, and drafts show only under
  All. A group cut by the server shows Show more, which reads `GET
  /work/feed/?group=<key>&cursor=<next>` and appends the page. A source
  that failed (`failed`) shows one notice in its place (Decision 4):
  approvals, reviews, questions and drafts at Needs your decision's place
  ("Couldn't load approvals and questions."), with Try again reading
  `?group=decide`; tasks and to-dos at Overdue's place, whose Try again
  reads the whole feed again; suggestions at Suggested's place
  (`?group=suggested`). The rest still renders. `hidden` reads "N more on
  records you can't open" under the groups. States: a skeleton, Try again,
  and "Nothing waiting on you." with quick-add still on top; under a chip
  "No approvals waiting." (the chip's kind) with Show all, which clears
  `?kind=` and puts focus on the All chip. After Show more, focus moves to
  the first row the page brought (by key), or to the group's heading when
  an empty page took Show more away.
  - **Right pane (from `lg`, owner 2026-10-16).** Work gets a 320px pane
    on the right (`components/work/WorkAskPane`, on every queue): two cards
    in the Next event template (`copilot/RailCard`: glass, a label with its
    icon) — **Scheduled** (`ScheduledCard`: first the reader's Google
    Calendar meetings for the next 7 days, at most 3, one in progress
    included (`GET /calendar/meetings/?from=&to=`): title, "Today · 3:00 pm"
    and the customer, and Join for a Meet link; none when Calendar isn't
    connected. Then the reader's dated to-dos and
    tasks from the feed's overdue, today, week and later groups, at most 5,
    "Overdue" / "Today" / the date, each opening its panel; "Nothing
    scheduled." when none; read again on any task change or added to-do) and
    **Add a to-do** (Quick-add, its label for screen readers only, More's
    fields stacked) — then Ask Revenact (the Copilot rail, "Work" as its
    context chip) in the rest. A to-do added
    there lands in My work as from its own box (`todoAdded` /
    `useTodoAdded`); My work then shows no box of its own (`boxInPane`).
    Below `lg` there is no pane and the box sits above the list.
  - **Quick-add.** Typing a title and Enter posts `POST /work/todos/
    {title, priority, due_date}`: a private to-do with no date. More adds
    an organisation or account, a due date, a priority and, once a record
    is picked, Who does it (`GET /work/assignees/?customer=|account=`);
    with a record the body carries `customer_id` or `account_id`, a due
    date is required, and `assignee_id` when it is not the reader. It is
    sent once. A blank title ("Give the task a title.") or a record with
    no date ("Choose a date.") is refused in place, and the error (with
    `aria-invalid`) clears as soon as that field is edited; a server refusal keeps
    the text, shows under its field (an assignee refusal under Who does it,
    in the server's sentence) and leaves focus where it was. On success
    the form clears, focus stays in the box, the answered item is placed
    in its group locally (when the chip allows it; a task for someone else
    is only announced, "Added for Dana CSM: <title>.") and only
    `feedChanged()` fires: the feed is not read again.
  - **Rows and their routes** (contract §2.3). A task or to-do: the circle
    Done sends `PATCH /tasks/<id>/ {status:"completed"}` once per row; the
    title opens the task panel (`?task=<id>`); a 404 is lost access. An
    approval: the action's rationale and evidence, then Apply (`POST
    /agents/actions/<id>/approve/`) and Reject (`.../reject/ {note}`)
    through `AgentActionDecision`; a 409 `ALREADY_DECIDED` or `EXPIRED`
    removes the row and the toast shows the server's `detail` verbatim, and
    any other refusal (`OWNER_LIMIT` among them) stays on the row in the
    server's words. A
    rule review: its counts per kind (a survey's people and records, a
    campaign's reach and skipped), then Approve (`POST
    /rules/reviews/<id>/approve/`) or Skip (`.../skip/`) through
    `ReviewDecision`; approving stays on Mine and the toast links Open
    survey or Open campaign (Decision 8); a 409 or 404 removes the row
    with "Already decided.". A question: Answer is in place (`InlineAnswer`,
    as on Next up): a box, Send answer posts `POST
    /questions/<id>/answer/ {body}` once, and the row leaves
    with "Answered: <title>"; a quiet "Open thread" links the
    organisation's Knowledge tab when the question is on one. The Team
    queue answers the same way where its item offers `answer`. A draft:
    Open draft (`/communications?draft=<id>`). A suggestion: Add to my
    work (`POST /work/recommendations/<id>/assign/ {assignee_id: me}`),
    Assign (the same route with the Assign form) and Dismiss (`.../dismiss/
    {reason, note}`); Add and Assign fire `taskChanged()`, Dismiss
    `recommendationsChanged()`. A row without the decide action reads
    "You can't decide this one."
  - **The toast and Undo** (Decisions 1, 2). A row that leaves says so in
    one page-level toast (`role="status"`, bottom of the page): the
    sentence ("Done: <title>.", "Approved: <title>.", "Added to your work:
    <title>."), an optional link (Open task, Open survey, Open campaign),
    Undo where one exists, and Close. It never hides by itself; the next
    replaces it. After a row action it takes focus; after quick-add it does
    not. Close returns focus to the element that had it before, or, when
    that is gone, to the quick-add box. Undo exists only for Done (`PATCH
    {status: <previous>}`, with `blocked_reason` when it was Blocked; the
    row comes back in its group if the current chip shows it, "Reopened:
    <title>.") and for an applied agent action while `undo.allowed` (`POST
    /agents/actions/<id>/undo/`, "Undone: <title>."; the row does not come
    back). A refused Undo shows the server's sentence.
  - **Conflicts and lost access** (Decision 6). A 409 removes the row and
    shows the server's sentence ("Already decided." for a rule review). A
    404 or 403 on a task's Done, a suggestion's Add, Assign or Dismiss
    (`REC.GONE`, `CANT_DECIDE`) or an approval (`AGENTS.GONE`,
    `CANT_DECIDE`) removes the row, says "You can't open that any more."
    or "You can't decide this any more." and adds one to `hidden`. A rule
    review never adds to `hidden` (its 404 and 409 look alike).
  - **The gear.** Readers with `manage_org_settings` get an icon link "Work
    settings" in the header's actions, to `/settings/work`.
  - **To-dos in the task panel** (Decision 10). A to-do's row opens the
    same task panel: its facts say "Only you" and Assignee reads "You";
    Due may be cleared. "Attach to a record" (one way) picks an
    organisation or account and, for a dateless to-do, a due date in the
    same save, with one warning, "Attaching a record makes this to-do and
    its history visible to people who can see that record. This can't be
    undone."; the answer's
    `customer`/`account` replaces the panel.
- **My team and Rest of company** (`/work?queue=team|company`; `/work/team`
  redirects through `TeamRedirect`: `?scope=company` goes to the Rest of
  company queue, anything else to My team, other query kept) are two queues
  on the rail, offered only to readers who have them (reports,
  `view_all_accounts` or the Leadership function, from `GET /work/queues/`);
  there is no scope switch. Each reads `GET /work/feed/team/?scope=team|company&kind=`
  (the queue, its pages, its decisions through each item's own route),
  under "Waiting on your team" / "Waiting on the company": To decide,
  Overdue and Suggested, Mine's rows through `useFeedSource` and
  `useTeamQueue`, each meta line starting "For <name>" or "For the whole
  company"; a task row without `done` has no Done circle and a suggestion
  without `add` no "Add to my work"; settling, toast and Undo are Mine's
  (`useFeedSettle`). A question is answered with `manage_users`. A refused
  scope drops back to Mine. Ask the agent (`POST /agents/ops/run/`) shows
  on Rest of company for `view_all_accounts` readers, sent once; on success
  the status line says "The Ops agent ran: 3 proposed, 1 applied." and the
  queue reads again, the button held until that read lands; a 409 shows the
  server's `detail` as an alert. Under My team, `TeamPeople` reads
  `GET /work/team/?scope=team` and gives one row per person (every active
  person in the scope, a deactivated one only while they hold readable open
  tasks, as "Unassigned (was X)"), ordered by overdue, then open, then name,
  and `hidden` ("N tasks you can't open"). Readers with `view_all_accounts`
  or the Leadership function read every task on records they can open. A
  row opens `GET /work/tasks/?assignee=<id>&state=open`. The inbox waits
  for the queue list before deciding a queue is not offered, so a manager's
  cold load on `?queue=team` stays.
- **The task panel** opens wherever the URL carries `?task=<id>` (a row's
  title on Mine or My team, a task's title in an organisation's or
  account's story, the bell's `task_assigned` link `/work?queue=mine&task=<id>`; the bell's other work links are
  `/work?queue=mine&kind=suggestion`, `/work?queue=mine&kind=approval` and, for bundles, `/work?queue=mine&kind=bundle`; the bell's `agent_step_failed` (a step failed on a tool) opens `/work?queue=history&bundle=<id>`; old links
  redirect). A to-do opens here too
  (see To-dos in the task panel above). `GET /tasks/<id>/` gives the task, its
  `editable` fields and its `events`; a 404 reads "This task isn't there,
  or you can't open it." Each field saves on its own through `PATCH
  /tasks/<id>/` and the answer replaces the panel, trail included, and
  "Saved." is announced: title and due date on Enter or blur (a due date
  that does not parse, or is before 2000, is refused in place with "Choose
  a date."), status, assignee and priority on change, description and the
  Blocked reason from their buttons. While a write runs the control is
  `aria-disabled`, never `disabled`, so focus stays on it. A PATCH or
  comment answered 404 (after a hand-off out of the reader's chain) shows
  the panel's missing state. Closing a panel opened by an in-app link
  steps back over its history entry; a page loaded with `?task=` drops it
  in place. Choosing Blocked
  asks "Blocked on" first; a blank reason is refused in place. A
  field outside `editable` (a plan task for someone who doesn't edit the
  plan) is text. Refusals sit under their field (`ASSIGNEE_CANNOT_OPEN`
  under Assignee) or on the form (403, `non_field_errors`). `POST
  /tasks/<id>/comments/ {body}` adds a comment to the trail.
- **After any change** in the panel, a quick Done, a suggestion's Add or
  Assign, or an approval's decision, `taskChanged()` tells every mounted
  reader to read again: Mine, My team and its open rows, the sidebar badge
  (`GET /work/feed/count/`, also read on every route change), Brain's desk
  and the open record's story. `recommendationsChanged()` (agent decisions, Run now, a suggestion's Dismiss) reaches the badge.
  `feedChanged()` (new; quick-add, rule reviews, a row leaving Mine)
  reaches only the badge: Mine places or removes the row itself.

### 4.11c Agents (Settings › Agents, Actions & approvals, Work › History)

Spec 2026-10-08 Agents delivery 1 §1.8; contract
`revenact-backend docs/superpowers/plans/2026-10-08-agents-actions-api.md`.
Delivery 2: `revenact-backend docs/superpowers/plans/2026-10-08-agents-drafts-api.md`.
Delivery 3: `revenact-backend docs/superpowers/plans/2026-10-08-agents-builder-api.md`.

1. **Set up.** Settings › Agents (`/settings/agents`) reads `GET
   /agents/settings/`: the AI switch and tone (the same fields as
   `Organisation.ai_agent_enabled` and `ai_agent_tone`), each agent's switch,
   monthly credits, spend this month and last run. For an admin
   (`can_edit`) the AI switch, the tone and each agent's switch send their
   own `PATCH` at once, with Undo; edited monthly credits wait in the page's
   save bar and go in one `PATCH` (only a typed budget is checked against
   the plan, so a saved one above a lowered plan does not hold the bar open);
   after a change to the AI switch or tone
   the page dispatches `fetchMe()` so Copilot catches up. Run now sends `POST
   /agents/<agent>/run/` at once, for whoever has `can_run`, and says what the
   run did; a 409 shows the server's sentence. An agent's Run now no longer
   runs the recommender afterwards (contract D12): its proposals are approvals
   now, and the once-a-day `agent_proposal_waiting` notice tells the people who
   decide. That is distinct from Settings › Work's Run now
   (`POST /work/recommendations/refresh/`), which is unchanged. A run that answers 200 calls
   `recommendationsChanged()` (so the sidebar's Work badge reads again; it no longer refreshes Brain's Waiting count, which is gone), and
   `taskChanged()` when it applied anything (Mine, My team and the badge). A refusal on the form shows
   under its field in the server's words. With AI off, both settings pages
   read "AI is off for this workspace: agents don't run."
2. **Rules.** Actions & approvals (`/settings/agents/actions`) sets Auto, Ask
   or Never per agent and action, capped by each kind's `max_level`, in one
   `PATCH {levels}` carrying only the changed cells. A field-level refusal
   sits under its cell and the first refused cell takes focus. Setting a
   cell to Never expires that agent's waiting actions of that kind.
   `draft.reply` may be Auto; `plan.start` is capped at Ask; both are for the
   CS and Sales agents. The five builder kinds are capped at Ask:
   `segment.create`, `scenario.create`, `campaign.create` and `plan.template`
   for the Ops agent, `canvas.create` for every agent.
3. **Propose.** Each night (or on Run now, or Ask the agent on Rest of company) an
   agent proposes an action. If its level is Auto it applies at once;
   otherwise it waits (Ask) as an approval on Mine for the
   people who may decide it. An action expires
   if the record changed, its date passed, the agent stopped proposing it, its
   level became Never, or it waited 14 days. A `draft.reply` writes a reply to
   the record's newest unanswered email (only when its owner has a connected
   mailbox) or newest open ticket; applied means a `ReplyDraft` exists, owned
   by the record owner, and nothing is sent. An agent never drafts the same
   source twice: an email, ever; a ticket, not within 7 days. A `plan.start`
   starts a template on the record through the plans service. Only readers
   who may read the source email or ticket see, decide or count a draft action
   by name; everyone else counts it in `hidden`. A builder action proposes a
   whole object: a segment, a scenario (a rule, switched off, with its own
   segment), a campaign draft (with its own segment), a map of one record's
   people with no links, or a workspace-shared plan template. The four
   workspace-level kinds have no record: only view-all readers see them and
   never count them in `hidden`; they never reach Mine. History
   on `/work` lists them, read only (Undo while allowed); view-all readers decide them in the Rest of company queue
   ("Ask the agent" there, view-all); other
   proposals wait on Mine and My team. `canvas.create`
   behaves like any record action.
4. **Decide.** Apply or Reject on Mine (the same
   `AgentActionDecision`, sent once). A 409 `ALREADY_DECIDED` or `EXPIRED`
   removes the row and shows the server's `detail` verbatim; a 403
   `CANT_DECIDE` removes it as lost access (Decision 6). A decision calls
   `taskChanged()` and `recommendationsChanged()` so Mine, My team, the
   badge and Brain read again.
   Applying a builder action makes the object owned by the approver; past an
   owner's limit of 50 the approval answers 409 `OWNER_LIMIT` ("You already
   own 50 segments."), shown on the row, and the action stays proposed.
5. **See.** History on `/work` (`/work/activity` redirects there) lists every action the reader
   may open, newest first. Filters write the URL (`agent`, `kind`, `status`,
   and, from a record's link, `customer` and `account`; a record the reader
   can't open gives an empty page, never a hint). `hidden` counts only
   actions on records the reader can't open, shown as "N more about records
   you can't open"; hidden workspace-level actions are left out of it.
   Evidence shows only when the server sends it. A row links what the action
   made: Open task, Open draft (`/communications?draft=<id>`, only while
   applied) and Open plan (`/projects/<id>`). A draft row shows its first
   lines. While a builder action is applied its row links what it made: Open
   scenario (`/scenarios/rules/<id>`), Open campaign (`/campaigns/<id>`), Open
   segment (`/segments/<id>`), Open map (`/canvas/<id>`) and Open template
   (`/projects/templates/<id>/edit`). Each made object's page reads its
   `made_by` and says "Made by the Ops agent, approved by Alice".
6. **Undo.** An applied action carries `undo`. Undo (`POST
   /agents/actions/<id>/undo/`) works for 7 days. The server's refusals are
   shown on the row verbatim: `CANT_DECIDE`, `UNDO_EXPIRED` and
   `CHANGED_SINCE` (which adds "Now: <current> · Agent set: <applied>");
   `409 ALREADY_DECIDED` carries the action, so the row is replaced and the
   status says who undid it. Success replaces the row, says "Undone: <title>."
   and calls `taskChanged()`. Undoing a draft deletes it unless it was sent,
   edited or discarded (`CHANGED_SINCE`, e.g. "This draft has been sent.");
   undoing a plan start returns the plan to Draft unless it was finished,
   cancelled, deleted or has done work. Undoing a builder action deletes what
   it made while it is untouched; otherwise `CHANGED_SINCE` carries the
   server's sentence (for example "This scenario has been switched on." or
   "Plans have been started from this template."), shown as it comes.
7. **Told.** Whoever approved the action, or the record owner when it ran on
   Auto, gets the bell kind `agent_action_undone` (Lucide `Undo2`), unless they
   did the undo. It links to `/work/activity?action=<id>`, which redirects to History (to Mine while the action still waits) and opens
   the action's bundle first in a "Linked action" section, focused.
   The draft's owner also gets `agent_draft_ready` (Lucide `FilePen`) when a
   `draft.reply` applies and they did not approve it themselves; it links to
   `/communications?draft=<id>`. The undo notice names a segment, scenario,
   campaign, map or plan template; an apply tells no one, since the approver
   owns the result. A proposal that waits gets the bell kind
   `agent_proposal_waiting` ("AI proposals are waiting for your decision.",
   Lucide `Sparkles`), at most once per person per workspace day, linking
   `/work?queue=mine&kind=approval` (backend contract D11 §4.1).
8. **Send.** The draft's owner opens it on Communications. Email: Save
   (`PATCH {body, subject}`), Send (`POST …/send/` with the changed fields,
   from their own mailbox, threaded on the original); the queue and its
   counts read again. Ticket: copy it into the source system (Copy and open),
   then Mark as sent (`POST …/mark-sent/`, after saving an edited reply).
   Discard (`DELETE`) asks first. A Discard refused as sent or "not yours"
   shows the server's sentence in the panel's status line, and the draft is
   read again; a stale draft (`onStale`) is read again and the lists refresh.
   Anyone else who may read it sees it as text.
9. **A send nobody confirmed.** A draft mid-send reads `status: sent`,
   `sent_at: null` and `sending`. While `pending` (its first 10 minutes) the
   panel says "Sending…" as text. Once `unconfirmed` it says "We couldn't
   confirm this was sent. Check your Sent folder." The person who may send
   it gets **It was sent** (`POST …/confirm-sent/`, the draft reads as sent)
   and **Reopen draft** (`POST …/reopen/`, editable again); the answer
   replaces the draft, the status line says what happened and the lists
   refresh. A refusal (409 `NOT_UNCONFIRMED`, or any error) shows the
   server's sentence in an alert. Everyone else sees only the sentence. A
   Send that answers `504 SEND_UNCONFIRMED` shows that sentence in the status
   line and reads the draft again, which lands here.

### 4.11d Wider intake (messages that need a customer, the fast lane)

Agent bundles round 2 delivery 3.

1. **Matching a message to a customer.** A Slack or Jira message that
   matched no customer waits under "Needs a customer" in its department's
   queue (Unassigned when the connector has no department). A person who can
   see that queue chooses **Match to a customer**, searches a customer or
   account (only records they can open are offered), optionally ticks "Also
   add <sender> as a contact" and presses **Match**. The server makes a
   ticket on that record, and a contact when asked, and the row leaves the
   list with a toast "Matched to Pizza Hut. An agent reads it at the next
   run.". Nothing is read at once: an agent reads the new ticket at its next
   run, and the sender's later messages match by themselves when they were
   added as a contact. If someone else matched or dismissed it first, or the
   connection does not cover the record, the dialog shows the server's
   sentence and a gone row is removed.
2. **Dismissing.** **Dismiss** asks "Dismiss this message?"; confirming
   deletes the text now and removes the row. Unmatched messages are also
   deleted on the date the row shows.
3. **Switching the fast lane on.** An admin opens Settings › Agents, turns
   Fast lane on, chooses the rules (Jira's top priority, Slack channels,
   words, senders, customers in poor health) and may lower the per hour and
   per day limits. Every change saves at once and can be undone. From then
   on matching urgent conversations are read after 2 quiet minutes instead of
   waiting for the schedule, within the limits; members see the rules and
   the use line as text.
4. **Request type.** Choosing a Jira request type on a step is not built. Jira Service Management: an issue an agent creates has no request type; set one in Jira so it shows in the portal and in request-type queues.

### 4.11e Slack as a conversation

Slack escalations delivery 1.

1. **A message becomes a conversation.** A colleague's message in a connected
   Slack channel is filed as a conversation on the customer it names, or on
   the channel's customer when one is chosen. On that organisation's Story
   (and its account's) it shows under Conversations as "Slack thread · Faiz
   Jamal · via Slack" with its channel and reply count, and opens to the whole
   thread, with why it is filed there and a link to Slack. It is not a ticket.
2. **When it is unclear.** A message that names no customer, or several, waits
   under "Needs a customer" in the connector's department queue (Unassigned
   when it has none). The row's dialog shows "Mentioned" chips for the
   customers the message names; the person presses one (or searches) and
   presses **Match**. No contact is offered, because the sender is a
   colleague. The toast reads "Matched to Globex (QA). An agent reads it at
   the next run." and the thread appears on that customer's Story.
3. **Connecting Slack once.** An admin connects Slack once (Sign in with
   Slack or a bot token). Slack then pushes each message as it is posted
   (the Events API) and Revenact files it at once; a slow catch-up at each
   sync covers any missing events. Every public channel syncs. New channels
   are joined when Slack announces them, once the app is approved with
   `channels:join` (until then the panel says so and offers **Approve
   again**). A Slack Connect channel (shared with another company) starts off.
4. **Excluding a channel.** An admin opens Settings › Connections, chooses
   "Choose channels" on the Slack connection and turns Sync off for a channel
   (for example #random). The row reads "Stopped syncing #random." and the
   connection "syncs 2 of 4 public channels"; new messages there are not
   filed. Turning it on again resumes.
5. **Setting a channel's customer.** In the same panel an admin presses
   **Customer** on a channel, picks "Always this customer:", searches the
   customer or account and saves. The row reads "#globex-escalations now
   files under Globex (QA)." and every message there files under it;
   "Any customer the message names" returns it to naming.
6. **The owner's one-time Slack app set-up** (api.slack.com/apps, the
   Alfiee app): Event Subscriptions on; Request URL
   `.../api/v1/connectors/slack/events/` (Slack shows "Verified"); subscribe
   to the bot events `message.channels` and `channel_created`; add the bot
   scope `channels:join`; reinstall the app, then Reconnect in Settings ›
   Connections. Until then the panel says "Events: not set up".

### 4.11f The account team and department heads

Slack escalations delivery 2.

1. **Naming a department head.** An admin opens Settings › People & teams ›
   Members › Department heads, picks a person in a department's select (only
   its active members are listed) and sees "Saved" with Undo. Undo restores
   the previous head. Choosing "Nobody" clears it. Someone without
   `manage_org_settings` sees the section read only.
2. **Setting a customer's account team.** On an organisation's Details, the
   Account team card lists the six departments. A person with view-all-accounts
   picks someone for a department and it saves at once; the Knowledge tab's
   owner for that department shows the same person. Customer Success is the
   organisation's owner. Accounts have no Account team card in this delivery.
3. **Who takes a customer's escalation.** For an organisation: the account team
   person for that department when on duty (Customer Success is the
   organisation's owner when active), else the department head, else nobody.
   Off duty means deactivated, or, outside Customer Success, no longer working
   in that department. For an account, Customer Success goes first to the
   account's own owner when set and active, then to the spec's rule: with
   exactly one parent organisation, that organisation's answer (its owner,
   then the Customer Success head), otherwise the Customer Success head. Other
   departments use the parent organisation's answer when the account has
   exactly one, otherwise that department's head. In short,
   the account's owner, else the organisation's. The escalation bundle (D3)
   will use this.

### 4.11g Slack escalations: the thread decides

Slack escalations delivery 4 (frontend).

1. **Colleagues decide in a Slack thread.** Someone posts a customer's problem
   in a connected channel and a colleague answers "@Faiz can you take this?".
   Revenact reads the thread and makes one bundle: the reply, a Jira issue, its
   assignment and a to-do for the person the thread named. If no one was named it
   goes to the account team's person for the function, else the department head;
   the bundle says which.
2. **Who may run it.** The people who took part in the thread and the customer's
   owner. A participant who cannot open the customer sees the participant view
   (no reason, no record link) and runs it from there.
3. **Reviewing it** in `/work?queue=mine&bundle=<id>`: the reply is listed first
   ("Runs last, once the Jira issue exists"), then "Handled by" with where the
   decision came from. Change (`PATCH /agents/bundles/<id>/handler/`) picks
   another person, or "Whoever handles a department"; the answer replaces the
   bundle; when nobody handles the chosen department the panel says only
   "Choose who handles this". The reply's `[Jira key]` and `[Jira link]` chips
   can be kept or removed; removing the link also takes its brackets and the
   space before them. A step's edits save when focus leaves its fields, and Run saves
   any that remain.
4. **Running it.** Run posts the ticked steps in order. A Jira assignment the
   person's Jira account cannot take is skipped with its note ("... Their to-do
   is in Work."). The reply posts as the person who runs it when their Slack is
   linked ("Posts as you"), else as the app, once; Retry finds the earlier post.
   In the participant view the to-do's assignee is read-only text.
5. **Following it.** On the organisation page the Slack thread shows its Jira
   issues under Conversations (each opens Jira), and the ticket shows "From
   Slack: ... in #channel" under Tickets, which opens the thread sheet with its
   "Jira issues". What the reader may not read is a count.

### 4.12 Builders

**Scenarios**: full-canvas React Flow with no Navbar. Drag nodes from the palette,
connect them, click one to configure it in a slide-over, save the graph as JSON,
and Run Now against a chosen customer to see the run log.

A Condition or Filter node asks one of two things. A fact about the
organization: its lifecycle stage, owner, health, NPS, ARR, days until
renewal, open tickets, name, or any AI attribute the organization has
defined, compared with the usual operators plus contains, is one of, is
empty and is not empty. Or what they have been saying: a plain-English
phrase matched against their recent emails, tickets and calls, with a
match strength. The run log says which record matched and how closely.

Two action nodes route work. Assign Owner hands the organization to a
named colleague or to whoever in a function carries the fewest, and tells
them. Notify puts it in front of the owner, their manager or someone
named. The On Event trigger can also start a scenario when an email,
ticket or call is classified, which is what a phrase condition is for.

**Canvas** (spec §2.2): a live stakeholder map on an organisation or account's
Maps tab (`CanvasPage` is its gallery: search, Show more). The editor shows
the record's people as live facts (role, sentiment, last contacted, latest
survey, Unsubscribed), an open plans strip with Start a plan, and lines
between nodes carrying one of four relationship labels. A node's ⋯ opens the
person panel (their facts and relationships, Open contact; focus moves to
their name and returns on close; below 1024px it overlays the board) or
starts Add a relationship to…, which adds the line without dragging a
connection. Every line's label is picked from a small menu on the line,
never dragged onto it; a selected line also offers Remove. A node may still
be dragged to reposition it, or to connect two nodes directly, except a
hidden person, who stays put and takes no lines. A person not yet on the
board waits in the tray, added by a click or a drag (which lands them at the
next free spot); a person the viewer cannot read shows as "Someone you
can't open" everywhere on the map, with no name and no ⋯ menu, and a node
whose contact was removed shows "Removed contact". Save sends the whole map
keyed to its `version`: a double click sends it once, and the board and name
field lock while the save is in flight (nothing can be dragged). A 404 on
save (the map was deleted, or access lost, while open) says "This map
doesn't exist or isn't shared with you." A 409 means someone else saved first
("Someone else changed this map. Reload to see their changes."); its Reload
asks "Discard your changes?" first when the local copy is still dirty, then
takes their version. A field refusal shows as a summary with focus sent to
the first one. Delete follows the map's `can_delete`: its creator and
anyone above them, or anyone who can open the record when the map has no
creator (every map made before creators were kept). Below
768px the board is read-only (pan and zoom only, nothing draggable) behind a People/Map toggle,
defaulting to People (the record's people as flat rows, with their
relationships), with a note ("Edit maps on a larger screen.") that editing
needs a wider screen. Leaving with unsaved changes asks first for an in-app
link click or closing/reloading the tab; the browser's own Back button is
not intercepted.

---

## 5. Real-time flows

| Channel | Opened by | Carries |
|---|---|---|
| `ws/notifications/?token=` | `DashboardLayout` on mount | New notifications, prepended and deduplicated into the bell |
| `ws/copilot/sessions/:id/?token=` | `CopilotIndex` when a session is active | Session snapshots, merged by event id |

Both reconnect after two seconds until explicitly disconnected. The token travels
as a query parameter because a WebSocket handshake cannot carry a header.

---

## 6. Redux map

30 slices. The ones that matter. What changed (`/brain`) and What's being
done (`/brain/doing`) are not among them: they read `/brain/` through hooks
(`useBrainScope`, `useChanged`, `useKept`, `useDoing`), no slice. Work
(`/work/*`) and the task panel do the same (`useFeed`, `useScopedRead`,
`useDrill`, `useTask`, `useAssignees`, `useFeedCount`, `useFeedSource`,
`useTeamQueue`, `useFeedSettle`).

| Slice | Holds |
|---|---|
| `auth` | User, tokens, hydration from `localStorage` |
| `customers` | The largest by far: customers, accounts, contacts, every activity-feed list, opportunities, risks, surveys, and their stats. 63 thunks |
| `copilotSessions` | Sessions by conversation id, plus my invites |
| `notifications` | Items, with optimistic read state |
| `health`, `usage`, `forecast`, `activity`, `portfolio`, `products`, `tickets`, `interactions` | One dashboard each |
| `metrics` | Metric types for the Brain's initiative form (its reads have had no page since Brain delivery 3) |
| `feedback`, `agents`, `skills` | Settings › AI feedback, AI usage, AI skills (and Developers › Agent access) |
| `graph` | The Knowledge Graph |
| `knowledge` | Contributions, responsible people, questions, my inbox |
| `mail`, `files`, `calls`, `connectors` | Integrations and record attachments |
| `userManagement` | Members, roles, capabilities |
| `counter`, `tasks` | Dead. Template leftovers, unused by any page |

---

## 7. Dead ends a user can reach

| Route or control | What happens |
|---|---|
| Sidebar: Product Feedbacks | "Under Construction" |
| Navbar: Search, Plus, Help, Message | No handler |
| Navbar list-page title chevrons | No menu |
| Settings sidebar: "Revenact for desktop" | No handler yet |
| Settings rail: "Scheduled" | The asker's Google Calendar meetings for the week, then dated to-dos and tasks (`ScheduledCard`, tasks opening on Work) |

## Google Calendar (delivery 2, 2026-10-17)

| Where | What |
|---|---|
| Scheduled card (Work, Communications, account settings) | The reader's meetings for the next 7 days (at most 3) above the dated to-dos and tasks; Join opens the Meet link in a new tab |
| Organisation and account timeline, Calendar Events filter | People's meetings with this customer (`GET /calendar/customers/<id>/meetings/`, an account's filtered by `account.id`; `useCustomerMeetings`) beside the seeded events, grouped by local day: time, whose calendar, attendee count, Join. Colleagues never get a meeting's description |
| Settings › Connections › Gmail (a Google mailbox) | A Calendar fact: "Connected · synced <date>", or "Not added" with **Add Calendar**, which reruns Google consent keeping Gmail (`GET /calendar/status/`); no line when the backend has no Calendar |

## Google Calendar (delivery 3, 2026-10-17): booking

| Where | What |
|---|---|
| Organisation page, Story › + Add › **Schedule meeting** | `MeetingForm` in the sheet: title, date, start, length (15–90 minutes, 30 by default), the organisation's contacts with an email to tick, an optional note. **Book meeting** posts `POST /calendar/meetings/` with one `request_id` per form, so a retry books once; the sheet closes and the story says "Meeting booked with a Meet link. Google is emailing the invites." The server's refusal (no Calendar, paused, a contact not on the customer) shows in its words. Not offered on an account's own page (no organisation to book on) |
| Contact page, More actions › **Schedule meeting** | The same form in a sheet ("With <name>, <organisation>"), this person already ticked, the organisation's other contacts offered; only for a person with an email and an organisation |

## Private mail and Add to Revenact (2026-10-17)

| Where | What |
|---|---|
| Communications › mailbox › an open conversation on a customer | "Only you can read this." with **Add to Revenact** (`POST /mail/messages/<id>/share/`: files it on the customer if needed and shares the whole thread), or "Shared on <customer>: anyone who can open it reads this conversation." with **Remove from Revenact** (`DELETE`). Mail is owner-only: managers no longer read a report's mail. No control on mail with no customer |

## Email agent (2026-10-17)

| Where | What |
|---|---|
| Settings › Connections › Gmail (Google mailbox), **Email agent** | A switch, off by default (`PATCH /mail/connection/ {agent_reads_mail}`): "Suggest tasks and meetings from what I send colleagues". The note under it says mail between colleagues is never kept in Revenact, and nobody else hears of a suggestion until you say yes |
| Work › My work › Suggestions, kind `email_suggestion` (`EmailSuggestionRow`) | What the agent read in the reader's own sent mail, waiting on them: "Give Jesh a task: …" (due date, Urgent) or "Ask Tushar for a meeting: …" (who comes). **Give Jesh the task** / **Send the request to Tushar** (`POST /email-agent/suggestions/<id>/confirm/`) or **Dismiss**. Only then does anyone else hear of it |
| Work › My work › Suggestions, kind `meeting_proposal` (`MeetingProposalRow`) | A meeting a colleague's email asked for, waiting on the reader. It shows the agent's topic (never the email), "<name> asked for a meeting", Urgent, who comes and for how long, who has no calendar (counted as free), and the proposed date and start, editable. **Book with Meet** (`POST /email-agent/proposals/<id>/book/`, `{}` at the proposed time or `{starts_at}`) books it on the reader's calendar; Google invites the rest and the row leaves ("Booked. Google is emailing the invites."). **Dismiss** removes it. Refusals show in the server's words. In the Suggestions chip; never in a Team queue |
| Work › a task the agent made from an email | The meta line says "From an email by <name>"; **Undo** (`POST /email-agent/tasks/<id>/undo/`) takes it back until `from_email.undo_until` (a day), and the row leaves ("Task undone.") |


## Slack bundles (2026-10-17)

Send to Revenact now turns a Slack message into an agent bundle in its sender's Work, within a minute (backend #162). The old Slack card is hidden by the server while the bundle is live.

| Where | What |
|---|---|
| Work › Needs your decision, the bundle row | Slack icon, title, why, the waiting step kinds, then the meta line: CS agent · record · **For you** · **Slack message** · step count · day · **Only you** (lock). Review opens the panel (`?bundle=`) |
| Bundle panel / sheet, source block (`BundleSource`) | "Slack message from {sender}" · when · **Only you**, then **Open in Slack** (new tab, `rel="noopener noreferrer"`, https only), then the message's first 280 characters as a quote. Once the message was dismissed or purged, only "Slack message" and Only you remain |
| Bundle panel, meta line | Agent · record · **For you** (`routed_to: "person"`) |
| Bundle panel, Refresh | `can_refresh` is false: the newer-message banner shows without **Refresh suggestions** |
| Step: Send a survey to this customer (`survey.record`) | "Send a CSAT survey to {record}'s {roles}: {subject}", plus ", when {issue} is resolved" when it waits on Jira (a step-1 placeholder is a chip). The question and the audience, as for a survey send. Fields while ticked: Survey type, Subject, Intro, Who at each record, **When it sends** (Send now / When the Jira issue is resolved, saved as `timing`). After the run its state reads "Applied · Waiting for KAN-12" (`wait.label`) and its note ("Sends when KAN-12 is resolved."); Undo on a sent held survey says it changed since |
| Step: Add to a segment (`segment.pin`) | "Add {record} to {segment}, N members", then "Not pinned → Pinned" |
| Step: Run a scenario (`scenario.run`) | "Run {scenario} on {record}"; after the run "Applied · {run note}", or "The scenario ran." / "The scenario failed." |
| Step: Reply in Slack | The usual Slack step, channel "The message's thread" or "Direct message", text editable; a note such as "You already replied to this message from Work." shows once applied |

## Work home: the daily brief (2026-10-17)

Work is the home page (owner, 2026-10-17): `/` sends a signed-in member to `/work`, and the sidebar leads with Work, Brain, Copilot, Dashboard. Mine with no kind chip opens on the brief; picking a chip shows that kind's plain grouped list, as before.

| Where | What |
|---|---|
| Greeting | "Good morning / afternoon / evening, {first name}" by the reader's local hour (before 12, before 17, after) in DM Serif Display, then one line from the feed: "Revenact prepared 4 plans of action · 2 wait on you · 3 due today" (bundles in `decide`; `decide`'s count; `overdue` + `today`), zero parts left out; all zero reads "You're clear. Revenact will put new work here as it comes in." |
| Tiles | **Needs you** (`decide` count) jumps to Ready to run; **Due today** (`today` + `overdue`, with "{n} overdue" in danger ink when any) jumps to Your to-dos; **Done with Revenact** (`GET /agents/bundles/history/` `count`, a dash while it reads or when it fails; the page never waits on it) opens `/work?queue=history`. One column below 36rem of the queue column, three across from there |
| Ready to run | The `decide` group. A bundle row shows its title, the meta line with its source (Nightly review, Slack message, or the thread's channel), its waiting steps as short chips joined by chevrons (Jira › Reply › To-do › Survey; five, then "+N"), and **Review & run** (`?bundle=`; "Review" when it cannot run). Only the first row's button is the primary. Other kinds (rule reviews, questions, drafts, Slack messages, meeting proposals, email suggestions) keep their own rows. Five, then **Show all {n}** expands in place (and Show more pages from there). Empty: "Nothing waits on you." |
| Your to-dos | Overdue, Today, This week, Later, No date, Blocked, each with its own subheading, count and Show more. Empty: "Nothing on your list." |
| Suggested | The newest five suggestions, compact (title, record · from), their Add to my work, Assign and Dismiss shown on hover or focus from `sm` (always on touch). **Show all {n}** selects the Suggestions chip (`?kind=suggestion`) |
| Layout | Mine takes the full width up to the right pane (Add a to-do and Ask Revenact from `lg`); Your to-dos and Suggested sit side by side from `xl`, stacked below |
| Queue rail | A queue with nothing to decide and nothing overdue shows no figure (no more "Mine 0" beside a full list); the phone select reads "Mine" |

## Guided agent (2026-10-18)

A message bundle that holds Diagnose, Write an email and Send it (backend #163) is **guided**: it is answered one question at a time, as a conversation, at every width. Every other bundle keeps its checklist.

| Where | What |
|---|---|
| Bell | Kind `agent_bundle_priority` (Zap icon): "Priority: {title}", linking to `/work?queue=mine&kind=bundle&bundle={id}`. When one arrives over the socket while Work is open, Work reads its feed again at once |
| Work home | Above Ready to run, a neutral banner "Priority: {title}" with **Open** (opens the bundle). A priority bundle that arrives while Work is open takes the banner and fades up once (200ms; none under reduced motion); it never hides by itself. Ready to run lists priority bundles first (otherwise the server's order) and badges each **Priority** (warning tone); a queue's bundle row carries the same badge |
| Bundle sheet (`?bundle=`) | Full height on a phone. The Priority badge and the source block on top (`BundleSource`), then the thread: for each step up to the one asked now, the agent's question (the server's `question`); once it ran, the reader's **Yes** and the agent's result. Steps after the one asked now are not shown |
| Diagnose result | The summary, then **What I found**: each finding with its source's icon (ticket, call, email, Slack, health, contact) and its source's label, linked when the link is https (new tab, `rel="noopener noreferrer"`) or an app path; anything else is a label. When the diagnosis used someone's private mail: "Summary hidden: it used {runner}'s private mail.", the visible findings still listed |
| Write an email result | "Here is the draft." and the email as a card: To, From, Subject and the body with its line breaks (68ch). Anyone but the draft's owner reads "Only {owner} can see the draft" |
| Send it result | "Sent to {name} from {address}.", "Added to {record}'s timeline." when it was shared, and Open the sent email |
| Answer bar (footer) | For the step asked now: **Yes** (the sheet's one primary), **Not now** (quiet, when `can_stop`), and for Send it **Edit** (the email card becomes To, Subject and Message fields; Yes then sends only the changed ones) with "Can't be undone" above. A step the reader may not run shows its reason (and Open Connections) in place of Yes. 44px answers on a phone |
| While a step runs | The reader's Yes, then "Revenact is working…" with three breathing dots (still under reduced motion) and, for a diagnosis, "Reading tickets, calls, emails, Slack…" from `reads` |
| After an answer | Focus moves to the newest agent bubble; the thread is a polite live region |
| Not now | `POST .../stop/`: "Not now", then "Stopped. Nothing else was done." |
| Failed step | Its error in danger ink and **Retry** (`POST .../steps/{id}/retry/`, as the contract says) |
| Refusals | A 409 that carries the bundle (`NOT_NEXT`, `STEP_NOT_WAITING`, a run's 409s) replaces the bundle and says the server's sentence quietly; field errors stay under the email's fields; anything else shows inline |
| Finished | "Done. Everything is in History and on {record}'s timeline.", with Open in History and the record |


## Sales review report (2026-10-18)

The day before a meeting whose title contains "sales review", its organiser gets a guided, high-priority bundle from the Sales agent (backend #165) with one step, `report.sales` ("Prepare the sales report"): "You have Sales review tomorrow at 10:00. Should I prepare the sales report?" **Yes** / **Not now**. It is the organiser's alone (`routed_to: "person"`, `source.private`); anyone else gets 404.

| Where | What |
|---|---|
| Bell and Work home | As any priority bundle (Guided agent above): "Priority: Prepare the sales report for {title}", the banner, Ready to run first. The row's icon is a calendar (`CalendarDays`), its source reads **Meeting**, and it says For you and Only you |
| Bundle sheet: source | `BundleSource`: "Meeting · {title} · {Tue 10:00–10:30} · Only you", the slot 24-hour in the reader's time zone |
| Before it runs | Under the question, "Reads {won} won, {lost} lost, {closing} closing and {open} open deals." (the preview's `counts`); the same line under "Revenact is working…" while it runs |
| Result (the runner) | "Here is the sales report." then the report under the thread (`SalesReport.tsx`): "Sales report · {from}–{to}", four tiles (Won count and amount, Lost, Closing in 30 days, Win rate or "-" with no closed deals; a snap strip on a phone, two columns from `sm`), then one card: the summary (when the model wrote one), Won, Lost and Closing next 30 days (at most 5 rows each, then "+N more"; each deal's record links to `/organizations/{id}` or `/accounts/{id}`; amounts in the report's `currency`, tabular), Stages (count, amount, "+N moved in"), and while `stage_history` is false "Stage moves count changes into a stage; moves out aren't tracked yet." An empty list reads "None in this period." |
| Download | **Download** (the sheet's one primary: the answer bar is gone once the step ran) fetches `download_url` with the session's token (`apiFetchBlob`) and saves it as `sales-report-{period to}.html`. **Print / Save as PDF** (secondary) fetches it the same way into a hidden, sandboxed iframe (`allow-same-origin allow-modals`, no scripts) and prints it; the frame goes after the print dialog (or 60s). A failed fetch says "Couldn't get the report. Try again." |
| Anyone but its runner | "Only {runner} can open the report.", no figures and no download (the preview's `report` and `download_url` are null) |
