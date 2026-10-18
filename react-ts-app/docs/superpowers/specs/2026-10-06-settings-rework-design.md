# Workspace Settings rework (round 1)

The owner asked on 2026-10-06 for workspace Settings (`/settings`) to be
re-thought as a senior product manager would. The aim is not to tidy tabs but
to shape Settings into the place where an admin governs what Revenact finds,
who does the work and what the agents may do. That is the direction of the web
"Today" flow and the later Revenact Mobile app.

Round 1 is the new frame. It removes the dead tabs, gathers workspace pages
that live elsewhere today, and fixes the broken controls. The **Work**
(recommend, assign, notify, track) and **Agents** (actions with approvals)
sections arrive with their own features in later rounds; this round only leaves
room for them.

**Frontend only.** No backend, model or API changes. Account settings
(`/account-settings/*`) are out of scope, by the owner's call.

## 0. What exists (react-ts-app origin/main 08d9755, backend 3cf85cf)

- **Tabs.** Fifteen tabs sit in the Navbar when the path starts with
  `/settings` (`Navbar.tsx:476-489`): Data, Currency, Products, Entity Uploads,
  Webhooks, Activities, Global Presets, Connect Widget, AI Agent, AI
  Attributes, Brief Delivery and Agent Access. The `AI_SETTINGS_TABS` list
  (`aiSettingsTabs.ts`) adds AI usage, AI skills and AI feedback, but only for
  `view_all_accounts`. The bar is capped at `max-w-[60vw]` and scrolls
  sideways, so most tabs are off-screen on a laptop.
- **Routes** (`App.tsx:330-347`).
  - Each tab is one page.
  - `activities` and `connect-widget` render `SettingPlaceholder`; neither has
    a backend.
  - AI usage, skills and feedback sit behind
    `RequireCapability view_all_accounts`.
- **Workspace pages outside Settings.**
  - `/users` (`UserManagement`, `RequireCapability manage_users`) holds
    members, roles, departments, invitations, domains and access requests.
  - `/integrations` (`Integrations`) holds personal mailboxes, ticket
    connectors and CallSense. It already shows sync health
    (`last_synced_at`, `last_sync_note`, `error`). Anyone can open it, since
    everyone connects their own mailbox. Connector writes need
    `manage_integrations`.
  - Both have their own items in the app `Sidebar` (`Sidebar.tsx:213,215`).
  - The backend's OAuth callbacks redirect to
    `${FRONTEND_URL}/integrations?<result>` (`connectors/views.py:130`,
    `mail/views.py:57`). That URL must keep working, query included.
- **Plan & billing.** `BillingSettingsPage` is real (seats, credits, ledger
  for `manage_org_settings`) but only reachable at `/account-settings/billing`.
- **Ownership.** `POST /api/v1/auth/organisation/owner/ { user_id }` hands the
  workspace to another active member; only the current owner may call it. The
  response is `{ owner: { id, name } }`, and errors use the usual
  `{ error: { code, message } }` shape. `/auth/me/` returns `is_owner`. No
  screen calls the endpoint.
- **Organisation fields.** `name` and `slug` are read-only by design
  (`OrganisationSerializer`). There is no workspace timezone and no working
  hours: the server runs in UTC, and the brief job's own docstring says it
  offers no hour.
- **Data tab** (`SettingsPage`).
  - Sub-tabs: Organization, Account, Contact, Pipeline, Custom Objects.
  - `AttributesTabContent.tsx:69-74` draws Filter and Download buttons with
    no handler.
  - Table columns: Display Name, Name, Description, Type, Attribute
    Properties, Usage.
- **Global Presets** is one real setting: `default_lifecycle_stage`.
- **Webhooks.** `WebhookSubscription` has exactly one event
  (`customer.created`, "Organization Created").
- **Headings.** The pages' own h1s already agree: `text-[20px] font-bold`.

## 1. Information architecture

`/settings` gets its own left navigation in four groups, and the Navbar's
settings tabs go. Each item opens an existing page unless marked **new**.

| Group | Item | Route | Page | Shown to |
|---|---|---|---|---|
| Workspace | General **(new)** | `/settings/general` | `GeneralSettingsPage` | everyone |
| | People & teams | `/settings/people` | `UserManagement` | `manage_users` |
| | Connections | `/settings/connections` | `Integrations` | everyone |
| | Plan & billing | `/settings/billing` | `BillingSettingsPage` | everyone (ledger stays `manage_org_settings`) |
| Data | Attributes | `/settings/data` | `SettingsPage` | everyone |
| | Defaults | `/settings/defaults` | `DefaultsPage` **(new: Currency + Global Presets)** | everyone |
| | Products | `/settings/products` | `ProductsPage` | everyone |
| | Imports | `/settings/entity-uploads` | `EntityUploadsPage` | everyone |
| AI | AI agent | `/settings/ai-agent` | `AIAgentPage` | everyone |
| | AI attributes | `/settings/ai-attributes` | `AIAttributesPage` | everyone |
| | AI skills | `/settings/ai-skills` | `SkillsPage` | `view_all_accounts` |
| | AI usage | `/settings/ai-usage` | `AgentsPage` | `view_all_accounts` |
| | AI feedback | `/settings/ai-feedback` | `FeedbackLogPage` | `view_all_accounts` |
| | Briefs | `/settings/brief-delivery` | `BriefDeliveryPage` | everyone |
| Developers | Webhooks | `/settings/webhooks` | `WebhooksPage` | everyone |
| | Agent access | `/settings/agent-access` | `AgentAccessPage` | everyone |

**Rules for the table:**
- **"Shown to"** repeats the route's existing guard. A person never sees an
  item that would bounce them. Pages keep their own write gating unchanged.
- **Gaps for later rounds.** The groups leave room for **Work** (Tasks,
  Recommendations, Routing, Notifications & briefs) and for **Agents**
  (Actions & approvals, Activity) without reshuffling. Nothing is drawn for
  them now. The rule is to add no setting for a feature that does not exist,
  which is how the fake account-settings pages happened.
- **Briefs** stays under AI for now and moves to Work › Notifications when
  that round lands.

**Redirects**, with `replace` so the old URLs never stay in history:

| From | To |
|---|---|
| `/settings` (index) | `/settings/general` |
| `/settings/currency`, `/settings/global-presets` | `/settings/defaults` |
| `/settings/activities`, `/settings/connect-widget` | `/settings/general` |
| `/users` | `/settings/people` |
| `/integrations` | `/settings/connections`, **keeping `location.search` and `hash`** so the OAuth callbacks still land with their result |

- The backend redirect URLs stay as they are; the frontend redirect absorbs
  them.
- `/account-settings/billing` stays untouched for now, because account
  settings are out of scope. The duplicate entry is noted for the
  account-settings round.

**App sidebar.** The **Users** and **Integrations** items leave the main
`Sidebar`; both now live under Settings. Settings stays where it is.
`SourcesGroup`'s "connect a source" link points to `/settings/connections`.

## 2. The frame

### 2.1 `WorkspaceSettingsLayout`

- A new layout route wraps every `/settings/*` child.
- Layout: a nav column (`w-56`, `border-r border-line`), then the page in an
  `<Outlet/>` filling the rest. Pages keep their own scroll.
- The groups come from a single `WORKSPACE_SETTINGS_NAV` constant in
  `src/pages/settings/workspaceSettingsNav.ts`. It replaces
  `AI_SETTINGS_TABS`, which is deleted along with its test. Each entry holds
  `{ label, path, icon, capability? }`.
- Each group has a label (`text-[11px]` uppercase `text-ink-faint`) above
  `NavLink` rows.
  - Row: `min-h-9`, a 16px Lucide icon, `text-[13px]`.
  - Active row: `bg-subtle text-ink font-semibold`.
  - Focus: the usual `focus-visible:outline-accent`.
- Tokens only. This is a product surface, so no glass.
- **Below `md` (375–767px):** the nav column is replaced by a native
  `<select aria-label="Settings section">` above the page. Its options are
  grouped with `<optgroup>`, and choosing one navigates. This avoids a
  horizontal scroll.
- **Navbar.** On `/settings` it shows only the "Settings" title. The tabs are
  removed, along with the dead `ChevronDown` that suggested a menu.

### 2.2 Page heads

Pages keep their own h1 (`text-[20px] font-bold`) and intro.

`UserManagement` and `Integrations` used to be top-level pages. Their wrappers
change only as far as needed to sit in the frame:
- `max-w-4xl mx-auto py-8 px-4` stays.
- No second "Settings" title is added.

## 3. New and changed pages

### 3.1 General (`GeneralSettingsPage`)

The workspace's identity, and the one owner-only action that has no home.

- **Workspace.**
  - Name and slug, read-only, in DM Mono for the slug.
  - Created date: left out as built. The organisation serializer does not
    send a creation date, and this round has no backend change.
  - The current owner's name, from the members list `UserManagement` already
    loads; reuse its fetch helper rather than adding one.
- **Transfer ownership.** Shown only when `currentUser.is_owner`.
  - A member picker lists active members other than you.
  - "Transfer" opens a confirm dialog that names the person and says plainly
    that you keep your role but lose the owner's rights.
  - On confirm the page POSTs `/auth/organisation/owner/`, then refreshes
    `/auth/me/` so `is_owner` flips.
  - Errors show below the picker, with the server's message.
  - Non-owners see one line instead: "Only the owner, \<name\>, can hand the
    workspace on."
- **Not here, on purpose.** Rename, timezone and working hours have no backend
  field, and nothing would read them yet. Timezone and hours arrive with the
  Work round's morning brief, which is their first reader.

### 3.2 Defaults (`DefaultsPage`)

- One page with two sections, in this order:
  1. **Currency**: today's `CurrencyPage` body, with its FX rates.
  2. **New organisations**: today's `GlobalPresetsPage` body, the default
     lifecycle stage.
- Each section keeps its own Save button, gating and tests. Lift the bodies
  into `CurrencySection` and `LifecycleDefaultSection` components; do not
  rewrite them.
- The old page files become thin wrappers or are deleted; there must be no
  dead file left behind.
- The stale comment in `GlobalPresetsPage.tsx` ("the real home for what
  GlobalConfigSidebar.tsx used to mock … deleted") goes. `GlobalConfigSidebar`
  is alive on the Data page.

### 3.3 Attributes: Filter and Download made real (`AttributesTabContent`)

- **Filter.**
  - The button opens a small popover with checkboxes for the attribute
    **types** present in the current list, plus "Has values" / "Empty"
    (usage > 0 / = 0).
  - The table filters on the client. Filters reset when the sub-tab changes.
  - The button shows a count when filters are active, and the popover has a
    "Clear" action.
  - Empty result state: "No attributes match these filters", plus Clear.
- **Download.**
  - Saves `<entity>-attributes.csv` built from the rows on screen (after
    filtering).
  - Columns: Display name, Name, Description, Type, Properties, Usage %.
  - Written with a small `toCsv` helper that quotes values and doubles inner
    quotes. Downloaded via a `Blob` and an object URL that is revoked
    afterwards.
- Both buttons get an `aria-label` and a tooltip, and meet the `min-h-9` rule.
- The Custom Objects sub-tab is unchanged.

### 3.4 Webhooks

- The backend sends one event. A picker with one option would be another
  false promise, so the event becomes a read-only line instead: "Sends when:
  Organization created".
- More events, and then a picker, belong to the Work round, where task and
  assignment events exist.
- Only wording changes in this round.

### 3.5 Removed

- `SettingPlaceholder.tsx` and its two routes.
- `AI_SETTINGS_TABS`.
- The Navbar settings tab list.
- The `Users` and `Integrations` app-sidebar items.
- Any test that asserted those.

## 4. Testing

Vitest and Testing Library, per the `testing` skill.

**`WorkspaceSettingsLayout`:**
- The four group labels render, with their items in order.
- A member without `view_all_accounts` or `manage_users` does not see AI
  skills, AI usage, AI feedback or People & teams. An admin sees all of them.
- The active item gets `aria-current="page"`.
- At phone width the `<select>` lists the same items, and choosing one
  navigates.

**Redirects.**
- `/settings` lands on general.
- `/settings/currency` and `/settings/global-presets` land on defaults.
- The placeholders land on general.
- `/users` lands on people.
- `/integrations?connected=gmail` lands on
  `/settings/connections?connected=gmail`, query intact.

**Navbar.** No settings tabs render on `/settings/*`.

**General.**
- An owner sees the picker, and you are not in it.
- Confirming posts the chosen `user_id` and then refreshes me.
- A server error is shown.
- A non-owner sees the owner line and no picker.

**Defaults.**
- Both sections render.
- Each Save still PATCHes its own field. The existing Currency and Presets
  tests move over.

**Attributes.**
- Filtering by a type narrows the rows. "Empty" shows only 0% rows. Clear
  restores all rows.
- Download builds the expected CSV, including a value with a comma and a
  quote, from the filtered rows.
- `toCsv` gets its own unit test.

**Webhooks.** The read-only event line renders.

**Sidebar.** The Users and Integrations items are gone; Settings is still
there.

`npm run lint`, `npm run build` and the full suite pass.

## 5. Docs

Update in the same PR:
- `docs/04-app-flow.md`: the route table (rows 87–89, plus `/users` and
  `/integrations`), and the "Settings > …" section titles.
- `docs/03-ui-ux-design.md`: a short entry for the settings frame (grouped
  nav, phone select).

## 6. Out of scope (later rounds)

- **Work:**
  - task statuses, due defaults and escalation;
  - recommendations and their recipients;
  - routing;
  - notifications and the morning brief, with workspace timezone and working
    hours;
  - more webhook events.
- **Agents:**
  - the action layer, Actions & approvals, Activity with undo;
  - budgets per team, connector write-back permission.
- **Security & audit:** a workspace audit log (needs an API; only the platform
  portal reads `AuditEvent` today), MFA enforcement, device sessions.
- **Account settings round:**
  - fake pages (Integrations, Personalization, Skills & Tasks), theme
    persistence, `/profile` merge;
  - the duplicate billing entry and the dead seed data in `settingsSlice`.
